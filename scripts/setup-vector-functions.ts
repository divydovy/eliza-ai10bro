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

    // Drop existing functions
    await client.query('DROP FUNCTION IF EXISTS check_vector_extension();');
    await client.query('DROP FUNCTION IF EXISTS check_vector_index();');

    // Create check_vector_extension function
    await client.query(`
      CREATE OR REPLACE FUNCTION check_vector_extension()
      RETURNS TABLE (
        name text,
        installed boolean,
        version text
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          e.extname,
          true,
          e.extversion
        FROM pg_extension e
        WHERE e.extname = 'vector';
      END;
      $$;
    `);
    console.log('Created vector extension check function');

    // Create check_vector_index function
    await client.query(`
      CREATE OR REPLACE FUNCTION check_vector_index()
      RETURNS TABLE (
        index_name text,
        index_def text
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          i.indexname::text,
          pg_get_indexdef(i.indexrelid)
        FROM pg_indexes i
        WHERE i.indexname = 'idx_memories_embedding';
      END;
      $$;
    `);
    console.log('Created vector index check function');

    // Ensure memories table has correct schema
    await client.query(`
      ALTER TABLE memories
      ALTER COLUMN embedding TYPE vector(1536)
      USING embedding::vector(1536);
    `);
    console.log('Updated memories table schema');

    // Create or replace the index
    await client.query(`
      DROP INDEX IF EXISTS idx_memories_embedding;
      CREATE INDEX idx_memories_embedding ON memories
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    console.log('Created vector index');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
  }
}

main().catch(console.error);