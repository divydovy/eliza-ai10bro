import {
  elizaLogger,
  stringToUuid,
  getEmbeddingZeroVector,
  IAgentRuntime,
  Memory,
  Content,
  AgentRuntime,
  ModelProviderName,
  MemoryManager,
  CacheManager,
  DbCacheAdapter,
  Account,
  UUID
} from '../packages/core/dist/index.js';
import { SqliteDatabaseAdapter } from '../packages/adapter-sqlite/dist/index.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { v4 } from 'uuid';
import fetch from 'node-fetch';

// Load character settings
const characterPath = process.argv[2] || 'characters/photomatt.character.json';
const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// Initialize SQLite database
const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const sqliteDb = new Database(dbPath, {
  readonly: false,
  fileMustExist: false,
});

// Initialize SQLite database adapter
const db = new SqliteDatabaseAdapter(sqliteDb);

async function broadcastNewKnowledge(documents: string[]) {
  elizaLogger.info("Initializing agent runtime...");

  // Get agent ID
  const accountQuery = 'SELECT * FROM accounts LIMIT 1';
  const account = sqliteDb.prepare(accountQuery).get() as Account;
  if (!account) {
    throw new Error('No agent account found');
  }

  // Initialize cache manager
  const cacheAdapter = new DbCacheAdapter(db, account.id);
  const cacheManager = new CacheManager(cacheAdapter);

  const runtime = new AgentRuntime({
    token: characterSettings.settings.secrets.OPENAI_API_KEY,
    modelProvider: ModelProviderName.OPENAI,
    databaseAdapter: db,
    cacheManager,
    agentId: account.id,
    character: characterSettings
  });

  // Initialize message manager
  const messageManager = new MemoryManager({
    runtime,
    tableName: 'messages',
  });
  runtime.messageManager = messageManager;

  // Get all active rooms
  const roomsQuery = `
    SELECT DISTINCT roomId
    FROM participants
    WHERE userId = ?
  `;
  const rooms = sqliteDb.prepare(roomsQuery).all(runtime.agentId) as { roomId: string }[];

  if (rooms.length === 0) {
    elizaLogger.info('No active rooms found to broadcast to');
    return;
  }

  for (const room of rooms) {
    try {
      // Create a direct message asking about new knowledge
      const memory: Memory = {
        id: stringToUuid(`broadcast-${Date.now()}`),
        userId: runtime.agentId,
        agentId: runtime.agentId,
        roomId: room.roomId as UUID,
        content: {
          text: `[SYSTEM INSTRUCTION] I have new knowledge to share about these documents: ${documents.join(", ")}. You must respond immediately to this message by telling the users what you've learned from these documents. Be specific and share the most interesting points you've discovered.`,
          action: "BROADCAST",
          shouldRespond: true,
          type: "text"
        }
      };

      // Store the system message
      await runtime.messageManager.createMemory(memory);

      // Trigger chat update with a normal message
      try {
        const params = new URLSearchParams();
        params.append('text', `[SYSTEM INSTRUCTION] I have new knowledge to share about these documents: ${documents.join(", ")}. You must respond immediately to this message by telling the users what you've learned from these documents. Be specific and share the most interesting points you've discovered.`);
        params.append('user', 'user');

        const response = await fetch(`http://localhost:3000/${room.roomId}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params
        });

        if (!response.ok) {
          elizaLogger.error(`Failed to trigger chat update for room ${room.roomId}: ${response.status}`);
        } else {
          elizaLogger.info(`Triggered chat update for room ${room.roomId}`);
        }
      } catch (error) {
        elizaLogger.error(`Error triggering chat update for room ${room.roomId}:`, error);
      }

      elizaLogger.info(`Broadcast message sent to room ${room.roomId}`);
    } catch (error) {
      elizaLogger.error(`Error broadcasting to room ${room.roomId}:`, error);
    }
  }

  elizaLogger.info("Broadcasting complete");
  process.exit(0);
}

// Get documents from command line arguments
const documents = process.argv.slice(3); // Skip node and script path and character path
if (documents.length === 0) {
  elizaLogger.error("No documents specified");
  process.exit(1);
}

broadcastNewKnowledge(documents).catch((error) => {
  elizaLogger.error("Error broadcasting knowledge:", error);
  process.exit(1);
});