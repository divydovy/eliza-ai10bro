import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import pkg from 'pg';
const { Pool } = pkg;

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
  const client = await pool.connect()
  try {
    // First get all memories
    const { rows: memories } = await client.query(`
      SELECT * FROM memories WHERE type = 'knowledge'
    `)

    console.log('\nFound direct matches:', memories.length)
    memories.forEach(memory => {
      console.log('\nContent:', memory.content.text)
      console.log('Has embedding:', !!memory.embedding)
      console.log('Embedding type:', typeof memory.embedding)
      console.log('Embedding length:', memory.embedding?.length)
      console.log('First few values:', memory.embedding?.slice(0, 5))
      console.log('Type:', memory.type)
      console.log('Room ID:', memory.roomId)
      console.log('Created at:', memory.createdAt)
      console.log('---')
    })

    // Now try a similarity search
    const text = "Sid's Serpent Snacks website is bright purple with red spots"
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    })

    const embedding = embeddingResponse.data[0].embedding
    const vectorStr = `[${embedding.join(',')}]`

    console.log('\nSearching with parameters:')
    console.log('Embedding length:', embedding.length)
    console.log('Table name: memories')
    console.log('Match threshold: 0.01')

    try {
      const { rows: similarMemories } = await client.query(`
        SELECT
          m.id,
          m."userId",
          m.content,
          m."createdAt",
          1 - (m.embedding <=> $1::vector) as similarity,
          m."roomId",
          m.embedding
        FROM memories m
        WHERE m.type = 'knowledge'
          AND (m."roomId" IS NULL)
          AND (1 - (m.embedding <=> $1::vector)) > 0.01
          AND m.unique = true
        ORDER BY similarity DESC
        LIMIT 10
      `, [vectorStr])

      console.log('\nSimilar memories found:', similarMemories.length)
      similarMemories.forEach(memory => {
        console.log('\nContent:', memory.content.text)
        console.log('Similarity:', memory.similarity)
        console.log('---')
      })
    } catch (error) {
      console.error('Error performing similarity search:', error)
    }
  } finally {
    client.release()
  }
}

main().catch(console.error)