import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import pkg from 'pg';
const { Pool } = pkg;
import OpenAI from 'openai'
import { stringToUuid, splitChunks, embed } from '@elizaos/core'

dotenv.config()

const POSTGRES_URL = process.env.POSTGRES_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!POSTGRES_URL || !OPENAI_API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const pool = new Pool({
  connectionString: POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

async function main() {
  const text = "Sid's Serpent Snacks website is bright purple with red spots"
  const knowledgeId = stringToUuid(text)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // First store the full document
    const documentEmbedding = await embed({ openai }, text)
    const documentVectorStr = `[${documentEmbedding.join(',')}]`

    await client.query(`
      INSERT INTO memories (id, type, content, embedding, "unique", "roomId", "agentId", "userId")
      VALUES ($1, $2, $3, $4::vector, $5, $6, $6, $6)
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `, [knowledgeId, 'documents', { text }, documentVectorStr, true, knowledgeId])

    console.log('Created document memory')

    // Now create fragments
    const fragments = await splitChunks(text)

    for (const fragment of fragments) {
      const fragmentId = stringToUuid(knowledgeId + fragment)
      const fragmentEmbedding = await embed({ openai }, fragment)
      const fragmentVectorStr = `[${fragmentEmbedding.join(',')}]`

      await client.query(`
        INSERT INTO memories (id, type, content, embedding, "unique", "roomId", "agentId", "userId")
        VALUES ($1, $2, $3, $4::vector, $5, $6, $6, $6)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `, [
        fragmentId,
        'fragments',
        { source: knowledgeId, text: fragment },
        fragmentVectorStr,
        true,
        knowledgeId
      ])
    }

    await client.query('COMMIT')
    console.log('Successfully created document and fragments for:', text)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating memories:', error)
    process.exit(1)
  } finally {
    client.release()
  }
}

main().catch(console.error)