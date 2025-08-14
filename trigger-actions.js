#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'agent/data/db.sqlite');
const AGENT_ID = '7298724c-f4fa-0ff3-b2aa-3660e54108d4'; // Your agent ID

async function triggerAction(actionName) {
    const db = new Database(DB_PATH);
    
    try {
        const roomId = `${AGENT_ID}-direct`;
        const userId = 'system';
        
        // Ensure the user account exists
        const userCheck = db.prepare('SELECT id FROM accounts WHERE id = ?').get(userId);
        if (!userCheck) {
            const userStmt = db.prepare(`
                INSERT INTO accounts (id, name, username, email, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);
            userStmt.run(userId, 'System', 'system', 'system@local', Date.now());
            console.log(`Created user account: ${userId}`);
        }
        
        // Ensure the agent account exists
        const agentCheck = db.prepare('SELECT id FROM accounts WHERE id = ?').get(AGENT_ID);
        if (!agentCheck) {
            const agentStmt = db.prepare(`
                INSERT INTO accounts (id, name, username, email, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);
            agentStmt.run(AGENT_ID, 'AI10bro Agent', 'ai10bro', 'ai10bro@local', Date.now());
            console.log(`Created agent account: ${AGENT_ID}`);
        }
        
        // Ensure the room exists
        const roomCheck = db.prepare('SELECT id FROM rooms WHERE id = ?').get(roomId);
        if (!roomCheck) {
            const roomStmt = db.prepare(`
                INSERT INTO rooms (id, createdAt)
                VALUES (?, ?)
            `);
            roomStmt.run(roomId, Date.now());
            console.log(`Created room: ${roomId}`);
        }
        
        // Create a system message to trigger the action
        const message = {
            id: uuidv4(),
            userId: 'system',
            agentId: AGENT_ID,
            roomId: roomId,
            content: JSON.stringify({
                text: actionName,
                source: 'system',
                action: actionName,
                metadata: {
                    triggerType: 'manual',
                    timestamp: new Date().toISOString()
                }
            }),
            type: 'messages',
            createdAt: Date.now()
        };
        
        // Create a dummy embedding (1024 dimensions for mxbai-embed-large)
        const embedding = new Float32Array(1024).fill(0);
        const embeddingBuffer = Buffer.from(embedding.buffer);
        
        // Insert the trigger message with embedding
        const stmt = db.prepare(`
            INSERT INTO memories (id, userId, agentId, roomId, content, embedding, type, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
            message.id,
            message.userId,
            message.agentId,
            message.roomId,
            message.content,
            embeddingBuffer,
            message.type,
            message.createdAt
        );
        
        console.log(`✅ Triggered action: ${actionName}`);
        console.log(`   Message ID: ${message.id}`);
        
    } catch (error) {
        console.error(`❌ Failed to trigger ${actionName}:`, error);
    } finally {
        db.close();
    }
}

// Parse command line arguments
const action = process.argv[2];

if (!action) {
    console.log('Usage: node trigger-actions.js <ACTION_NAME>');
    console.log('Available actions:');
    console.log('  SYNC_GITHUB      - Sync GitHub repository documents');
    console.log('  CREATE_KNOWLEDGE - Import Obsidian knowledge base');
    console.log('  PROCESS_QUEUE    - Process pending broadcasts');
    process.exit(1);
}

// Trigger the action
triggerAction(action);