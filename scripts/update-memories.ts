import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import pkg from 'pg';
const { Pool } = pkg;
import OpenAI from 'openai'
import { stringToUuid, splitChunks, embed, IAgentRuntime, ModelProviderName, MemoryManager } from '@elizaos/core'

dotenv.config()

const POSTGRES_URL = process.env.POSTGRES_URL
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_URL = process.env.SUPABASE_URL

if (!POSTGRES_URL || !OPENAI_API_KEY || !SUPABASE_ANON_KEY || !SUPABASE_URL) {
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
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function getAgentId(): Promise<string> {
  const client = await pool.connect()
  try {
    // Get the agent ID by character name and show details
    const result = await client.query(`
      SELECT id, name, username, details
      FROM accounts
      WHERE name = 'photomatt' OR username = 'photomatt' OR details->>'name' = 'photomatt'
      LIMIT 1
    `)
    console.log('Found account:', result.rows[0])
    if (result.rowCount === 0) {
      throw new Error('No agent account found for photomatt')
    }
    return result.rows[0].id
  } finally {
    client.release()
  }
}

// Create database adapter
const databaseAdapter = {
  async createMemory(memory: any, tableName: string) {
    const client = await pool.connect()
    try {
      await client.query(`
        INSERT INTO ${tableName} (id, type, content, embedding, "unique", "roomId", "agentId", "userId")
        VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        memory.id,
        memory.type,
        memory.content,
        memory.embedding ? `[${memory.embedding.join(',')}]` : null,
        memory.unique,
        memory.roomId,
        memory.agentId,
        memory.userId
      ])
    } finally {
      client.release()
    }
  },
  async getMemories(opts: any) {
    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT * FROM ${opts.tableName}
        WHERE "roomId" = $1
        ORDER BY "createdAt" DESC
        LIMIT $2
      `, [opts.roomId, opts.count])
      return result.rows
    } finally {
      client.release()
    }
  },
  async getCachedEmbeddings(text: string) {
    return []
  }
}

// Create memory managers
const messageManager = new MemoryManager({
  tableName: 'messages',
  runtime: null as any
})

const documentsManager = new MemoryManager({
  tableName: 'documents',
  runtime: null as any
})

const knowledgeManager = new MemoryManager({
  tableName: 'fragments',
  runtime: null as any
})

async function main() {
  const agentId = await getAgentId()
  console.log('Using agent ID:', agentId)

  // Create a minimal runtime implementation for embedding
  const runtime: IAgentRuntime = {
    openai,
    modelProvider: ModelProviderName.OPENAI,
    agentId,
    character: {
      id: agentId,
      name: 'Memory Updater',
      modelProvider: ModelProviderName.OPENAI,
      settings: {
        USE_OPENAI_EMBEDDING: 'true',
        USE_OPENAI_EMBEDDING_TYPE: 'string',
        MEMORY_MATCH_THRESHOLD: '0.05'
      }
    },
    messageManager,
    documentsManager,
    knowledgeManager,
    databaseAdapter
  } as unknown as IAgentRuntime;

  // Set runtime reference in managers
  messageManager.runtime = runtime
  documentsManager.runtime = runtime
  knowledgeManager.runtime = runtime

  // List all files in the agent_documents bucket
  const { data: files, error } = await supabase.storage
    .from('agent_documents')
    .list()

  if (error) {
    console.error('Error listing files:', error)
    process.exit(1)
  }

  if (!files || files.length === 0) {
    console.log('No files found in agent_documents bucket')
    return
  }

  console.log(`Found ${files.length} files in bucket`)

  for (const file of files) {
    try {
      // Skip if already processed
      if (await isProcessed(file.name)) {
        console.log(`Skipping already processed file: ${file.name}`)
        continue
      }

      // Download file content
      const { data, error: downloadError } = await supabase.storage
        .from('agent_documents')
        .download(file.name)

      if (downloadError) {
        console.error(`Error downloading file ${file.name}:`, downloadError)
        continue
      }

      const text = await data.text()
      await processFile(runtime, file.name, text)
      console.log(`Successfully processed: ${file.name}`)
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error)
      continue
    }
  }
}

async function processFile(runtime: IAgentRuntime, fileId: string, text: string) {
  const knowledgeId = stringToUuid(fileId)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Get the public URL for the existing file
    const { data: { publicUrl } } = supabase.storage
      .from('agent_documents')
      .getPublicUrl(fileId)

    // Store the full document with metadata
    const documentEmbedding = await embed(runtime, text)
    const documentVectorStr = `[${documentEmbedding.join(',')}]`

    await client.query(`
      INSERT INTO memories (id, type, content, embedding, "unique", "roomId", "agentId", "userId")
      VALUES ($1, $2, $3, $4::vector, $5, $6, $6, $6)
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `, [
      knowledgeId,
      'documents',
      { text, url: publicUrl, fileId },
      documentVectorStr,
      true,
      runtime.agentId
    ])

    console.log('Created document memory for:', fileId)

    // Now create fragments
    const fragments = await splitChunks(text)

    for (const fragment of fragments) {
      const fragmentId = stringToUuid(knowledgeId + fragment)
      const fragmentEmbedding = await embed(runtime, fragment)
      const fragmentVectorStr = `[${fragmentEmbedding.join(',')}]`

      await client.query(`
        INSERT INTO memories (id, type, content, embedding, "unique", "roomId", "agentId", "userId")
        VALUES ($1, $2, $3, $4::vector, $5, $6, $6, $6)
        ON CONFLICT (id) DO NOTHING
        RETURNING *
      `, [
        fragmentId,
        'fragments',
        { source: knowledgeId, text: fragment, documentUrl: publicUrl },
        fragmentVectorStr,
        true,
        runtime.agentId
      ])
    }

    await client.query('COMMIT')
    console.log('Successfully created fragments for:', fileId)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error processing file:', fileId, error)
    throw error
  } finally {
    client.release()
  }
}

async function isProcessed(fileId: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT id FROM memories
      WHERE type = 'documents' AND content->>'fileId' = $1
      LIMIT 1
    `, [fileId])
    return (result.rowCount ?? 0) > 0
  } finally {
    client.release()
  }
}

main().catch(console.error)