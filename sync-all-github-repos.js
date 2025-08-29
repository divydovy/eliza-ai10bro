#!/usr/bin/env node

/**
 * Script to sync multiple GitHub repositories into the knowledge base
 * Each repo is processed sequentially with its content properly tagged
 */

import { AgentRuntime, elizaLogger, knowledge, stringToUuid } from "@elizaos/core";
import { GitHubClient } from "./packages/plugin-github/src/providers/githubProvider.js";
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub repositories to sync
const GITHUB_REPOS = [
    { url: 'https://github.com/divydovy/ai10bro-gdelt', path: 'Notes', name: 'GDELT News' },
    { url: 'https://github.com/divydovy/ai10bro-youtube', path: 'transcripts', name: 'YouTube Transcripts' },
    { url: 'https://github.com/divydovy/ai10bro-arxiv', path: 'papers', name: 'ArXiv Papers' },
    { url: 'https://github.com/divydovy/ai10bro', path: 'docs', name: 'Main Docs' }
];

async function loadCharacterConfig() {
    const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
    const characterData = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
    return characterData;
}

async function syncRepository(repo, token, runtime) {
    elizaLogger.info(`\n=== Syncing ${repo.name} from ${repo.url} ===`);
    
    try {
        // Configure dashboard state
        const dashboardConfig = {
            enabled: true,
            statePath: path.join(__dirname, 'rag-state', repo.name.toLowerCase().replace(/\s+/g, '-'))
        };
        
        // Create GitHub client for this repo
        const client = await GitHubClient.create(
            token,
            repo.url,
            repo.path || '',
            runtime,
            dashboardConfig
        );
        
        // Sync knowledge from this repository
        const processedCount = await client.syncKnowledge();
        
        elizaLogger.success(`✅ ${repo.name}: Processed ${processedCount} files`);
        return { repo: repo.name, success: true, count: processedCount };
        
    } catch (error) {
        elizaLogger.error(`❌ ${repo.name}: Sync failed - ${error.message}`);
        return { repo: repo.name, success: false, error: error.message };
    }
}

async function main() {
    elizaLogger.info('🚀 Starting GitHub multi-repository sync...');
    
    try {
        // Load character config for settings
        const characterConfig = await loadCharacterConfig();
        const githubToken = characterConfig.settings?.secrets?.GITHUB_TOKEN;
        
        if (!githubToken) {
            throw new Error('GITHUB_TOKEN not found in character configuration');
        }
        
        // Initialize database connection
        const dbPath = path.join(__dirname, 'agent/data/db.sqlite');
        const db = new Database(dbPath);
        
        // Create a minimal runtime for the GitHub provider
        const runtime = {
            getSetting: (key) => {
                if (key === 'GITHUB_TOKEN') return githubToken;
                if (key === 'DASHBOARD_ENABLED') return 'true';
                if (key === 'DASHBOARD_STATE_PATH') return 'rag-state';
                return characterConfig.settings?.[key];
            },
            databaseAdapter: {
                db,
                getMemoryById: async (id) => {
                    const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
                    return row ? JSON.parse(row.content) : null;
                },
                createMemory: async (memory) => {
                    const stmt = db.prepare(`
                        INSERT INTO memories (id, type, content, agentId, userId, roomId)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);
                    stmt.run(
                        memory.id,
                        memory.type || 'documents',
                        JSON.stringify(memory.content),
                        memory.agentId || 'ai10bro',
                        memory.userId || 'system',
                        memory.roomId || 'github-sync'
                    );
                },
                updateMemory: async (memory) => {
                    const stmt = db.prepare(`
                        UPDATE memories SET content = ? WHERE id = ?
                    `);
                    stmt.run(JSON.stringify(memory.content), memory.id);
                },
                searchMemories: async (params) => {
                    return [];
                }
            }
        };
        
        // Sync each repository
        const results = [];
        let totalProcessed = 0;
        let totalSuccess = 0;
        
        for (const repo of GITHUB_REPOS) {
            const result = await syncRepository(repo, githubToken, runtime);
            results.push(result);
            
            if (result.success) {
                totalSuccess++;
                totalProcessed += result.count;
            }
            
            // Add a small delay between repos to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Print summary
        elizaLogger.info('\n📊 Sync Summary:');
        elizaLogger.info('=================');
        results.forEach(result => {
            const status = result.success ? '✅' : '❌';
            const message = result.success 
                ? `${result.count} files processed`
                : `Failed: ${result.error}`;
            elizaLogger.info(`${status} ${result.repo}: ${message}`);
        });
        
        elizaLogger.info(`\n🎯 Total: ${totalProcessed} files from ${totalSuccess}/${GITHUB_REPOS.length} repos`);
        
        // Update the database with sync statistics
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO metadata (key, value, updated_at)
            VALUES ('last_github_sync', ?, datetime('now'))
        `);
        stmt.run(JSON.stringify({
            timestamp: new Date().toISOString(),
            repos_synced: totalSuccess,
            files_processed: totalProcessed,
            results: results
        }));
        
        db.close();
        
    } catch (error) {
        elizaLogger.error('Fatal error during sync:', error);
        process.exit(1);
    }
}

// Run the sync
main().catch(console.error);