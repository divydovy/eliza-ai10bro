import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  AgentRuntime,
  ModelProviderName,
  CacheManager,
  DbCacheAdapter,
  UUID,
  Account,
} from '../packages/core/dist/index.js';
import { SqliteDatabaseAdapter } from '../packages/adapter-sqlite/dist/index.js';

// Load character settings
const characterPath = process.argv[2] || 'characters/photomatt.character.json';
const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// Initialize SQLite database - use the agent's database
const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const sqliteDb = new Database(dbPath, {
  readonly: false,
  fileMustExist: false,
});

// Initialize SQLite database adapter
const db = new SqliteDatabaseAdapter(sqliteDb);

async function getAgentId(): Promise<UUID | null> {
  const sql = 'SELECT * FROM accounts LIMIT 1';
  const account = sqliteDb.prepare(sql).get() as Account | undefined;

  if (!account) {
    console.error('No account found in database');
    return null;
  }

  return account.id;
}

async function cleanMemories() {
  try {
    await db.init();

    const agentId = await getAgentId();
    if (!agentId) {
      console.error('Failed to get agent ID');
      process.exit(1);
    }

    // Delete document memories and any messages with broadcast action or system type
    const deleteDocsSql = `DELETE FROM memories
      WHERE agentId = ?
      AND (
        (type = 'documents' AND json_extract(content, '$.source') IS NOT NULL)
        OR json_extract(content, '$.action') = 'BROADCAST'
        OR json_extract(content, '$.type') = 'system'
      )`;
    sqliteDb.prepare(deleteDocsSql).run(agentId);

    // Delete fragments that are linked to documents we just deleted
    // (preserve fragments linked to startup documents)
    const deleteFragmentsSql = `DELETE FROM memories
      WHERE type = 'fragments'
      AND agentId = ?
      AND json_extract(content, '$.source') NOT IN (
        SELECT id FROM memories
        WHERE type = 'documents'
      )`;
    sqliteDb.prepare(deleteFragmentsSql).run(agentId);

    console.log('Successfully deleted document, broadcast, system notification, and fragment memories from database (preserving startup memories)');
  } catch (error) {
    console.error('Error cleaning memories:', error);
    process.exit(1);
  }
}

cleanMemories().catch(console.error);