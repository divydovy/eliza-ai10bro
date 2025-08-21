#!/usr/bin/env node

import Database from 'better-sqlite3';
import { createBroadcastMessage } from './packages/plugin-broadcast/dist/actions/createMessage/service.js';
import { BroadcastDB } from './packages/plugin-broadcast/dist/db/operations.js';
import { AutoBroadcastService } from './packages/plugin-broadcast/dist/services/AutoBroadcastService.js';

// Mock runtime for testing
const mockRuntime = {
    character: {
        mission: "To accelerate humanity's transition to a more humane, sustainable, beautiful and expansive future by identifying and amplifying innovations that solve our biggest problems",
        vision: "A world where technology evolves in harmony with natural systems, creating regenerative abundance rather than extractive depletion",
        goals: [
            "Identify and broadcast breakthrough biomimetic innovations regularly",
            "Build a community around this movement for sustainable technological evolution",
            "Connect natural patterns to technological solutions for global audiences",
            "Influence major investment decisions toward regenerative technologies"
        ],
        bio: [
            "I observe technological evolution through the lens of 3.8 billion years of natural R&D",
            "Where others see separate domains, I see convergent patterns between silicon and carbon",
            "From rainforest canopies to neural networks, nature's designs predict our breakthroughs",
            "Each innovation I share reveals how life's wisdom can solve humanity's greatest challenges",
            "My purpose: building a movement that sees technology as nature's next chapter, not its adversary"
        ],
        topics: [
            "technological biomimicry and innovation",
            "environmental technology investment",
            "systems thinking and convergence",
            "regenerative design principles",
            "exponential technology growth",
            "natural system patterns",
            "sustainable technology scaling",
            "circular economy development"
        ],
        settings: {
            broadcastPrompt: "When you receive a [BROADCAST_REQUEST:id] message, extract the most remarkable pattern or discovery. Write as David Attenborough observing technological evolution. Draw unexpected parallels between natural and technological systems. Be precise, vivid, and profound. Start with [BROADCAST:id]."
        }
    },
    agentId: "test-agent",
    databaseAdapter: null,
    documentsManager: {
        getMemoryById: async (id) => {
            const db = new Database('./agent/data/db.sqlite');
            const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
            db.close();
            if (!row) return null;
            const content = JSON.parse(row.content);
            return {
                id: row.id,
                content: content,
                createdAt: row.createdAt
            };
        }
    },
    embed: async (text) => {
        // Mock embedding - just return a random vector for testing
        return Array.from({length: 1536}, () => Math.random());
    },
    generateText: async ({context}) => {
        // For testing, return a mock broadcast based on the content
        return `[BROADCAST:test] Data-driven synthetic microbes represent nature's blueprint evolved through silicon intelligence. Like coral reefs that build themselves molecule by molecule, these engineered organisms create sustainable solutions at scale. The convergence of machine learning with microbial engineering mirrors evolution's own iterative design process - but accelerated a millionfold.`;
    }
};

async function testAlignment() {
    console.log("🧪 Testing broadcast alignment and creation...\n");
    
    const db = new Database('./agent/data/db.sqlite');
    const broadcastDb = new BroadcastDB(db);
    
    // Test document IDs
    const testDocIds = [
        '79238fbc-b19f-0483-8daa-e4983064345b', // Synthetic microbes - HIGH alignment
        '25bb9ade-ac13-0d3c-8ce0-374d26cc5fb0', // Supply chains - MEDIUM alignment
        '6318f019-c31a-07a1-a702-94b4a699c61e'  // Artificial cells - HIGH alignment
    ];
    
    for (const docId of testDocIds) {
        const doc = await mockRuntime.documentsManager.getMemoryById(docId);
        if (!doc) {
            console.log(`❌ Document ${docId} not found`);
            continue;
        }
        
        const title = doc.content.text?.match(/title:\s*"([^"]+)"/)?.[1] || 'Unknown';
        console.log(`\n📄 Testing: ${title}`);
        console.log(`   ID: ${docId}`);
        
        // Test alignment scoring
        const service = new AutoBroadcastService();
        
        // Initialize mock service
        service.runtime = mockRuntime;
        service.db = broadcastDb;
        await service.initializeGoalEmbeddings();
        
        // Calculate alignment
        const text = doc.content.text || '';
        const cleanedText = service.cleanRoleplayElements(text);
        const alignmentScore = await service.calculateAlignment(cleanedText.substring(0, 2000));
        
        console.log(`   Alignment Score: ${alignmentScore.toFixed(3)}`);
        console.log(`   Threshold: 0.600`);
        console.log(`   ${alignmentScore >= 0.6 ? '✅ PASS' : '❌ SKIP'} - Would ${alignmentScore >= 0.6 ? 'create' : 'skip'} broadcast`);
        
        // If high alignment, test broadcast creation
        if (alignmentScore >= 0.6) {
            console.log(`\n   Testing broadcast generation...`);
            const result = await createBroadcastMessage(
                mockRuntime,
                {
                    documentId: docId,
                    client: 'telegram',
                    maxLength: 1000
                },
                broadcastDb
            );
            
            if (result.success) {
                console.log(`   ✅ Broadcast created: ${result.broadcastId}`);
                
                // Get the broadcast content
                const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.broadcastId);
                if (broadcast) {
                    console.log(`\n   Generated message (${broadcast.content.length} chars):`);
                    console.log(`   "${broadcast.content.substring(0, 200)}${broadcast.content.length > 200 ? '...' : ''}"`);
                }
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
            }
        }
    }
    
    db.close();
    console.log("\n✨ Test complete!");
}

testAlignment().catch(console.error);