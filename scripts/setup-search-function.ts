import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config()

const POSTGRES_URL = process.env.POSTGRES_URL

if (!POSTGRES_URL) {
  console.error('Missing POSTGRES_URL environment variable')
  process.exit(1)
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  const client = await pool.connect();
  try {
    // First check if pgvector extension is installed
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Drop the existing function if it exists
    await client.query(`
      DROP FUNCTION IF EXISTS public.search_memories(text,uuid,vector,double precision,integer,boolean);
    `);

    // Create the search_memories function
    await client.query(`
      CREATE OR REPLACE FUNCTION public.search_memories(
        query_table_name text,
        query_roomid uuid,
        query_embedding vector(1536),
        query_match_threshold double precision,
        query_match_count integer,
        query_unique boolean
      )
      RETURNS TABLE (
        id uuid,
        "userId" uuid,
        content jsonb,
        "createdAt" timestamp with time zone,
        similarity double precision,
        "roomId" uuid,
        embedding vector(1536)
      )
      LANGUAGE plpgsql
      AS $function$
      BEGIN
        RETURN QUERY
        SELECT
          m.id,
          m."userId",
          m.content,
          m."createdAt",
          1 - (m.embedding <=> query_embedding) as similarity,
          m."roomId",
          m.embedding
        FROM memories m
        WHERE m.type = query_table_name
          AND (m."roomId" = query_roomid OR m."roomId" IS NULL)
          AND (1 - (m.embedding <=> query_embedding)) > query_match_threshold
          AND (NOT query_unique OR m.unique)
        ORDER BY similarity DESC
        LIMIT query_match_count;
      END;
      $function$;
    `);

    console.log('Successfully created search_memories function');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

main().catch(console.error);