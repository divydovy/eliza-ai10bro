import OpenAI from 'openai'
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 } from 'uuid';
import {
  stringToUuid,
  splitChunks,
  embed,
  ModelProviderName,
  MemoryManager,
  CacheManager,
  DbCacheAdapter,
  AgentRuntime,
  UUID,
  settings,
  DatabaseAdapter,
  IDatabaseCacheAdapter,
  Memory,
  Account,
  Goal,
  GoalStatus,
  Actor,
  Participant,
  Relationship,
  Content,
} from '../packages/core/dist/index.js';
import { SqliteDatabaseAdapter } from '../packages/adapter-sqlite/dist/index.js';

// Load character settings
const characterPath = process.argv[2] || 'characters/photomatt.character.json';
const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// Extract credentials from character settings
const secrets = characterSettings.settings.secrets;

// Type guard to ensure all required credentials are present
function hasRequiredCredentials(secrets: any): secrets is {
  OPENAI_API_KEY: string;
} {
  return Boolean(secrets.OPENAI_API_KEY);
}

if (!hasRequiredCredentials(secrets)) {
  console.error('Missing required credentials in character file');
  process.exit(1);
}

const documentsDir = path.join(process.cwd(), 'documents');

// Create documents directory if it doesn't exist
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: secrets.OPENAI_API_KEY,
});

// Initialize SQLite database - use the agent's database
const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const sqliteDb = new Database(dbPath, {
  readonly: false,
  fileMustExist: false,
});

// Initialize SQLite database adapter
const db = new SqliteDatabaseAdapter(sqliteDb);

// Track processed files
const processedFiles: string[] = [];

async function processFile(content: string, filename: string, agentId: UUID, runtime: AgentRuntime) {
  // Check if document already exists by querying the database
  const sql = `SELECT id FROM memories WHERE type = 'documents' AND json_extract(content, '$.source') = ? AND agentId = ?`;
  const existingDoc = sqliteDb.prepare(sql).get(filename, agentId);

  if (existingDoc) {
    console.log(`Skipping ${filename} - already processed`);
    return;
  }

  // Create the full document memory
  const documentId = v4() as UUID;
  await runtime.documentsManager.createMemory({
    id: documentId,
    agentId: runtime.agentId,
    roomId: runtime.agentId,
    userId: runtime.agentId,
    createdAt: Date.now(),
    content: {
      text: content,
      source: filename
    },
    embedding: await embed(runtime, content),
  });

  // Split into fragments and store them
  const fragments = await splitChunks(content);

  for (const fragment of fragments) {
    const embedding = await embed(runtime, fragment);

    await runtime.knowledgeManager.createMemory({
      id: stringToUuid(documentId + fragment) as UUID,
      content: {
        text: fragment,
        source: documentId
      },
      embedding,
      userId: agentId,
      roomId: agentId,
      agentId: agentId,
      createdAt: Date.now()
    });
  }

  // Add to processed files list
  processedFiles.push(filename);
}

async function broadcastNewKnowledge(runtime: AgentRuntime) {
  if (processedFiles.length === 0) {
    console.log('No new files processed, skipping broadcast');
    return;
  }

  // Get all active rooms - using userState FOLLOWED
  const sql = `
    SELECT DISTINCT roomId
    FROM participants
    WHERE userId = ? AND userState = 'FOLLOWED'
  `;
  const rooms = sqliteDb.prepare(sql).all(runtime.agentId) as { roomId: string }[];

  if (rooms.length === 0) {
    console.log('No active rooms found to broadcast to');
    return;
  }

  // Create broadcast message
  const message = `I've just learned new information from ${processedFiles.length} document${processedFiles.length > 1 ? 's' : ''}: ${processedFiles.join(', ')}. Feel free to ask me about this new knowledge!`;

  // Broadcast to each room
  for (const room of rooms) {
    const memory: Memory = {
      id: v4() as UUID,
      agentId: runtime.agentId,
      userId: runtime.agentId,
      roomId: room.roomId as UUID,
      content: {
        text: message,
        source: 'system',
      },
      createdAt: Date.now(),
      embedding: await embed(runtime, message),
    };

    await runtime.messageManager.createMemory(memory);
  }

  console.log(`Broadcasted new knowledge message to ${rooms.length} room(s)`);
}

async function main() {
  await db.init();

  const agentId = await getAgentId();
  if (!agentId) {
    console.error('Failed to get agent ID');
    process.exit(1);
  }

  // Initialize cache manager
  const cacheAdapter = new DbCacheAdapter(db, agentId);
  const cacheManager = new CacheManager(cacheAdapter);

  const runtime = new AgentRuntime({
    token: secrets.OPENAI_API_KEY,
    modelProvider: ModelProviderName.OPENAI,
    databaseAdapter: db,
    cacheManager,
    agentId,
    character: characterSettings
  });

  // Initialize memory managers
  const documentsManager = new MemoryManager({
    runtime,
    tableName: 'documents',
  });

  const knowledgeManager = new MemoryManager({
    runtime,
    tableName: 'fragments',
  });

  const messageManager = new MemoryManager({
    runtime,
    tableName: 'messages',
  });

  runtime.documentsManager = documentsManager;
  runtime.knowledgeManager = knowledgeManager;
  runtime.messageManager = messageManager;

  try {
    // Read all files from the documents directory
    const files = await fs.promises.readdir(documentsDir);

    for (const file of files) {
      // Skip .DS_Store files
      if (file === '.DS_Store') {
        console.log('Skipping .DS_Store file');
        continue;
      }

      const filePath = path.join(documentsDir, file);
      const content = await fs.promises.readFile(filePath, 'utf-8');

      console.log(`Processing file: ${file}`);
      await processFile(content, file, agentId, runtime);
    }

    // Broadcast new knowledge to all active rooms
    await broadcastNewKnowledge(runtime);

    console.log('Finished processing all documents');
  } catch (error) {
    console.error('Error processing files:', error);
    throw error;
  }

  process.exit(0);
}

async function getAgentId(): Promise<UUID | null> {
  const sql = 'SELECT * FROM accounts LIMIT 1';
  const account = sqliteDb.prepare(sql).get() as Account | undefined;

  if (!account) {
    const newAccount: Account = {
      id: v4() as UUID,
      name: characterSettings.name || 'Agent',
      username: characterSettings.name || 'agent',
      email: 'agent@example.com',
      avatarUrl: '',
      details: {},
    };

    const success = await db.createAccount(newAccount);
    if (!success) {
      return null;
    }

    return newAccount.id;
  }

  return account.id;
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});