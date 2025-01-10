import { createClient } from '@supabase/supabase-js'
import pkg from 'pg';
const { Pool } = pkg;
import OpenAI from 'openai'
import fs from 'fs';
import path from 'path';
import {
  stringToUuid,
  splitChunks,
  embed,
  IAgentRuntime,
  ModelProviderName,
  MemoryManager,
  Memory,
  getEmbeddingZeroVector,
  composeContext,
  generateMessageResponse,
  ModelClass,
  messageCompletionFooter,
  CacheManager,
  DbCacheAdapter,
  AgentRuntime,
  UUID,
  DatabaseAdapter,
  IDatabaseCacheAdapter,
  settings,
  Clients
} from '../packages/core/dist/index.js'
import { PostgresDatabaseAdapter } from '../packages/adapter-postgres/dist/index.js'

// Load character settings
const characterPath = process.argv[2] || 'characters/photomatt.character.json';
const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// Extract credentials from character settings
const secrets = characterSettings.settings.secrets;

// Type guard to ensure all required credentials are present
function hasRequiredCredentials(secrets: any): secrets is {
  POSTGRES_URL: string;
  OPENAI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
} {
  return Boolean(
    secrets.POSTGRES_URL &&
    secrets.OPENAI_API_KEY &&
    secrets.SUPABASE_URL &&
    secrets.SUPABASE_SERVICE_KEY
  );
}

if (!hasRequiredCredentials(secrets)) {
  console.error('Missing required credentials in character file');
  process.exit(1);
}

// Create PostgreSQL pool with the correct connection string
const pool = new Pool({
  connectionString: secrets.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY });

// Initialize Postgres database adapter with connection config
const db = new PostgresDatabaseAdapter({
  connectionString: secrets.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Configure settings to use OpenAI
settings.MODEL_PROVIDER = ModelProviderName.OPENAI;
settings.SMALL_OPENAI_MODEL = "gpt-4";
settings.MEDIUM_OPENAI_MODEL = "gpt-4";
settings.LARGE_OPENAI_MODEL = "gpt-4";

async function main() {
  const agentId = await getAgentId();
  console.log('Using agent ID:', agentId);

  // Initialize the database adapter
  await db.init();

  // Initialize cache manager
  const cacheAdapter = new DbCacheAdapter(db, agentId as UUID);
  const cacheManager = new CacheManager(cacheAdapter);

  // Create runtime instance
  const runtime = new AgentRuntime({
    databaseAdapter: db,
    cacheManager,
    token: secrets.OPENAI_API_KEY,
    modelProvider: ModelProviderName.OPENAI,
    agentId: agentId as UUID,
    character: characterSettings
  });

  // Initialize runtime
  await runtime.initialize();

  // Create memory managers
  const messageManager = new MemoryManager({
    tableName: 'messages',
    runtime: runtime
  })

  const documentsManager = new MemoryManager({
    tableName: 'documents',
    runtime: runtime
  })

  const knowledgeManager = new MemoryManager({
    tableName: 'fragments',
    runtime: runtime
  })

  // Create Supabase client
  const supabase = createClient(secrets.SUPABASE_URL, secrets.SUPABASE_SERVICE_KEY);

  // List files in the Supabase storage bucket
  try {
    const { data: files, error } = await supabase.storage.from('agent_documents').list();

    if (error) {
      console.error('Error listing files:', error);
      throw error;
    }

    console.log('Files in bucket:', files);

    if (!files || files.length === 0) {
      console.log('No files found in the bucket');
      return;
    }

    // Process each file
    let processedFiles = [];
    for (const file of files) {
      console.log('Processing file:', file.name);

      // Check if file was already processed
      if (await isProcessed(file.name)) {
        console.log('File already processed, skipping:', file.name);
        continue;
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('agent_documents')
        .download(file.name);

      if (downloadError) {
        console.error('Error downloading file:', downloadError);
        continue;
      }

      const text = await fileData.text();
      console.log('File content:', text);

      // Process the file content
      await processFile(text, file.name, agentId, runtime, documentsManager);
      processedFiles.push(file.name);
    }

    // Only notify if we actually processed new files
    if (processedFiles.length > 0) {
      // Ensure agent is in their own room
      await pool.query(`
        INSERT INTO rooms (id)
        VALUES ($1)
        ON CONFLICT (id) DO NOTHING
      `, [agentId]);

      await pool.query(`
        INSERT INTO participants (id, "userId", "roomId")
        VALUES ($1, $2, $3)
        ON CONFLICT ("userId", "roomId") DO NOTHING
      `, [stringToUuid(Date.now().toString()), agentId, agentId]);

      const message = {
        id: stringToUuid(Date.now().toString()) as UUID,
        type: 'messages' as const,
        content: {
          text: `I've just processed some new documents that I can now reference in our conversations. The documents include: ${processedFiles.join(', ')}`
        },
        embedding: await embed(runtime, `New documents processed notification`),
        agentId,
        roomId: agentId,
        userId: agentId,
        unique: true
      };

      await messageManager.createMemory(message);
      console.log('Notification sent to room:', agentId);
    } else {
      console.log('No new files were processed');
    }
  } catch (error) {
    console.error('Error accessing storage:', error);
    throw error;
  }
}

async function getAgentId(): Promise<UUID> {
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
    return result.rows[0].id as UUID
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
  async getMemoryById(id: string, tableName?: string) {
    const client = await pool.connect()
    try {
      if (tableName) {
        // Try to find the memory in the specified table
        const result = await client.query(`
          SELECT * FROM ${tableName}
          WHERE id = $1
          LIMIT 1
        `, [id])

        if (result.rows[0]) {
          return result.rows[0]
        }
      }

      // If not found or no table specified, try to find it in the memories table
      const memoryResult = await client.query(`
        SELECT * FROM memories
        WHERE id = $1
        LIMIT 1
      `, [id])

      return memoryResult.rows[0] || null
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
  },
  async getRoomsForParticipant(agentId: string) {
    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT "roomId" FROM memories
        WHERE "agentId" = $1 AND type = 'messages'
        GROUP BY "roomId"
      `, [agentId])
      return result.rows.map(row => row.roomId)
    } finally {
      client.release()
    }
  }
}

// Add environment variables for EchoChambers
process.env.ECHOCHAMBERS_API_URL = "http://127.0.0.1:3333";
process.env.ECHOCHAMBERS_API_KEY = "testingkey0011";
process.env.ECHOCHAMBERS_DEFAULT_ROOM = "general";

// Update the processFile function to handle text content directly
async function processFile(content: string, filename: string, agentId: UUID, runtime: AgentRuntime, documentsManager: MemoryManager) {
  // Create chunks from the content
  const chunks = await splitChunks(content, 1000);

  // Process each chunk
  for (const chunk of chunks) {
    // Get embedding for the chunk
    const embedding = await embed(runtime, chunk);

    // Create a memory for the chunk
    const memory = {
      id: stringToUuid(Buffer.from(chunk).toString('hex').slice(0, 32)) as UUID,
      type: 'documents' as const,
      content: {
        text: chunk,
        fileId: filename,
        type: 'text'
      },
      embedding,
      agentId,
      roomId: agentId,
      userId: agentId,
      unique: false
    };

    // Store the memory
    await documentsManager.createMemory(memory);
  }
}

async function isProcessed(filename: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    const result = await client.query(`
      SELECT id FROM memories
      WHERE type = 'documents' AND content->>'fileId' = $1
      LIMIT 1
    `, [filename])
    return (result.rowCount ?? 0) > 0
  } finally {
    client.release()
  }
}

// Run the main function
main().catch(console.error);