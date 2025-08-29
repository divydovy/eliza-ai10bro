#!/usr/bin/env node

/**
 * Script to trigger the GitHub sync action through the agent
 * Uses the configured GitHub plugin to sync from the repository
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load character to get agent ID
const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));

async function triggerGitHubSync() {
    try {
        console.log('🔄 Triggering GitHub sync through agent...');
        
        // Send a message to the agent to trigger SYNC_GITHUB action
        const response = await fetch('http://localhost:3000/ai10bro/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: 'SYNC_GITHUB',
                userId: 'system',
                roomId: 'github-sync'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Agent request failed: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log('✅ GitHub sync triggered successfully');
        return result;
        
    } catch (error) {
        console.error('❌ Failed to trigger GitHub sync:', error.message);
        throw error;
    }
}

// Run the sync
triggerGitHubSync()
    .then(result => {
        console.log('Sync result:', result);
        process.exit(0);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });