#!/usr/bin/env node

/**
 * Direct GitHub sync using the plugin's provider
 */

import { elizaLogger, stringToUuid } from "@elizaos/core";
import { GitHubClient } from "./packages/plugin-github/src/providers/githubProvider.js";
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    try {
        // Load character config
        const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
        
        const githubToken = character.settings?.secrets?.GITHUB_TOKEN || character.settings?.GITHUB_TOKEN;
        const repoUrl = character.settings?.GITHUB_REPO_URL || 'https://github.com/divydovy/ai10bro-gdelt';
        const targetPath = character.settings?.GITHUB_TARGET_PATH || 'Notes';
        
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN not found in character configuration');
        }
        
        console.log(`📦 Repository: ${repoUrl}`);
        console.log(`📁 Target path: ${targetPath}`);
        console.log('🔄 Starting GitHub sync...\n');
        
        // Initialize database
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        // Create minimal runtime
        const runtime = {
            getSetting: (key) => {
                if (key === 'GITHUB_TOKEN') return githubToken;
                if (key === 'GITHUB_REPO_URL') return repoUrl;
                if (key === 'GITHUB_TARGET_PATH') return targetPath;
                if (key === 'DASHBOARD_ENABLED') return 'true';
                if (key === 'DASHBOARD_STATE_PATH') return 'rag-state';
                return character.settings?.[key];
            },
            agentId: 'ai10bro',
            databaseAdapter: {
                db,
                getMemoryById: async (id) => {
                    const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
                    return row ? JSON.parse(row.content) : null;
                },
                createMemory: async (memory) => {
                    const stmt = db.prepare(`
                        INSERT OR REPLACE INTO memories (id, type, content, agentId, userId, roomId, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                    `);
                    stmt.run(
                        memory.id,
                        memory.type || 'documents',
                        JSON.stringify(memory.content),
                        memory.agentId || 'ai10bro',
                        memory.userId || 'system',
                        memory.roomId || 'github-sync'
                    );
                    return true;
                },
                updateMemory: async (memory) => {
                    const stmt = db.prepare(`
                        UPDATE memories SET content = ? WHERE id = ?
                    `);
                    stmt.run(JSON.stringify(memory.content), memory.id);
                    return true;
                },
                searchMemories: async () => [],
                getMemories: async () => []
            },
            knowledgeManager: {
                set: async (knowledge) => {
                    const stmt = db.prepare(`
                        INSERT OR REPLACE INTO memories (id, type, content, agentId, userId, roomId, createdAt)
                        VALUES (?, 'documents', ?, 'ai10bro', 'system', 'github', datetime('now'))
                    `);
                    stmt.run(knowledge.id, JSON.stringify(knowledge.content));
                    return true;
                }
            }
        };
        
        // Configure dashboard
        const dashboardConfig = {
            enabled: true,
            statePath: path.join(__dirname, 'rag-state')
        };
        
        // Create GitHub client
        const client = await GitHubClient.create(
            githubToken,
            repoUrl,
            targetPath,
            runtime,
            dashboardConfig
        );
        
        // Perform sync
        const processedCount = await client.syncKnowledge();
        
        console.log(`\n✅ Sync complete: ${processedCount} files processed`);
        
        // Get total document count
        const totalDocs = db.prepare(`
            SELECT COUNT(*) as count FROM memories 
            WHERE type = 'documents' 
            AND json_extract(content, '$.metadata.path') LIKE '%${targetPath}%'
        `).get();
        
        console.log(`📊 Total GitHub documents in database: ${totalDocs.count}`);
        
        db.close();
        return processedCount;
        
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main().catch(console.error);