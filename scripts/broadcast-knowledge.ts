import { readFileSync } from 'fs';
import path from 'path';
import { DirectClient } from '../packages/client-direct/src';
import { CacheManager, MemoryCacheAdapter, AgentRuntime } from '../packages/core/dist/index.js';
import { SqliteDatabaseAdapter } from '../packages/adapter-sqlite/dist/index.js';
import Database from 'better-sqlite3';
import fetch from 'node-fetch';

async function main() {
    // Get content path from command line arguments
    const contentPath = process.argv[2];
    if (!contentPath) {
        console.error('Usage: pnpm tsx scripts/broadcast-knowledge.ts <content-file>');
        process.exit(1);
    }

    // Load photomatt character
    const characterPath = path.join(process.cwd(), 'characters', 'photomatt.character.json');
    const character = JSON.parse(readFileSync(characterPath, 'utf-8'));

    // Create cache manager
    const cache = new CacheManager(new MemoryCacheAdapter());

    // Initialize SQLite database
    const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
    const sqliteDb = new Database(dbPath, {
        readonly: false,
        fileMustExist: true,
    });

    // Create database adapter
    const db = new SqliteDatabaseAdapter(sqliteDb);
    await db.init();

    // Create runtime
    const runtime = new AgentRuntime({
        databaseAdapter: db,
        cacheManager: cache,
        token: character.settings.secrets.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
        modelProvider: character.modelProvider,
        character,
        plugins: [],
        providers: [],
        actions: [],
        services: []
    });

    // Initialize runtime
    await runtime.initialize();

    // Create Direct client
    const client = new DirectClient();
    client.registerAgent(runtime);
    client.start(7998);

    // Read the file content
    const content = readFileSync(contentPath, 'utf-8');

    // Send the file to the agent
    const response = await fetch(`http://localhost:7998/${runtime.agentId}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: 'Please process this file and tell me what you learned from it.',
            attachments: [{
                type: path.extname(contentPath).slice(1) as 'txt' | 'md' | 'pdf',
                content,
                path: contentPath
            }]
        })
    });

    const messages = await response.json();
    console.log('Agent response:', messages[0].content.text);

    // Cleanup
    await db.close();
    client.stop();
    process.exit(0);
}

main().catch(console.error);