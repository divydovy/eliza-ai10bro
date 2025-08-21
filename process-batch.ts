#!/usr/bin/env npx ts-node

import Database from 'better-sqlite3';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { AgentRuntime, embed, generateText, ModelClass } from '@elizaos/core';
import { SqliteDatabaseAdapter } from '@elizaos/adapter-sqlite';
import { BroadcastDB } from './packages/plugin-broadcast/src/db/operations';

// Load environment variables
config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function processBatch() {
    console.log("🚀 Processing batch of 10 unbroadcasted documents...\n");
    
    // Connect to database
    const db = new Database('./agent/data/db.sqlite');
    const broadcastDb = new BroadcastDB(db);
    
    // Get 10 unbroadcasted documents
    const docs = db.prepare(`
        SELECT m.* 
        FROM memories m
        WHERE m.type = 'documents'
        AND m.id NOT IN (SELECT DISTINCT documentId FROM broadcasts WHERE documentId IS NOT NULL)
        AND json_extract(m.content, '$.text') IS NOT NULL
        AND length(json_extract(m.content, '$.text')) > 100
        ORDER BY m.createdAt DESC
        LIMIT 10
    `).all();
    
    console.log(`Found ${docs.length} documents to process\n`);
    
    // Initialize runtime for alignment checking
    const characterPath = path.join(__dirname, 'characters/ai10bro.character.json');
    const character = JSON.parse(require('fs').readFileSync(characterPath, 'utf-8'));
    
    // Create minimal runtime for embedding and text generation
    const dbAdapter = new SqliteDatabaseAdapter(db);
    const runtime = new AgentRuntime({
        databaseAdapter: dbAdapter,
        token: process.env.OPENAI_API_KEY || '',
        modelProvider: 'ollama',
        character: character,
        plugins: [],
        providers: [],
        actions: [],
        services: [],
        managers: []
    });
    
    // Initialize goal embeddings for alignment
    const goalStatements = [
        character.mission,
        character.vision,
        ...(character.goals || []),
        ...(character.bio || []),
        ...(character.topics || [])
    ].filter(Boolean);
    
    console.log(`Generating embeddings for ${goalStatements.length} goal statements...\n`);
    const goalEmbeddings = await Promise.all(
        goalStatements.map(text => embed(runtime, text))
    );
    
    // Process each document
    let created = 0;
    let skipped = 0;
    const results = [];
    
    for (const doc of docs) {
        const content = JSON.parse(doc.content);
        const text = content.text || '';
        
        // Extract title
        const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/i);
        const title = titleMatch ? titleMatch[1].trim() : text.substring(0, 50) + '...';
        
        console.log(`\n📄 Processing: ${title}`);
        console.log(`   ID: ${doc.id}`);
        
        // Clean text
        const cleanedText = text.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim();
        
        // Skip test/draft documents
        if (/test|draft|cache/i.test(title)) {
            console.log(`   ⏭️  Skipped (unwanted title)`);
            skipped++;
            continue;
        }
        
        // Calculate alignment
        const docEmbedding = await embed(runtime, cleanedText.substring(0, 2000));
        const similarities = goalEmbeddings.map(goalVec => {
            let dot = 0.0;
            let normA = 0.0;
            let normB = 0.0;
            for (let i = 0; i < goalVec.length; i++) {
                dot += goalVec[i] * docEmbedding[i];
                normA += goalVec[i] * goalVec[i];
                normB += docEmbedding[i] * docEmbedding[i];
            }
            if (normA === 0 || normB === 0) return 0;
            return dot / (Math.sqrt(normA) * Math.sqrt(normB));
        });
        const alignmentScore = Math.max(...similarities);
        
        console.log(`   Alignment: ${alignmentScore.toFixed(3)}`);
        
        if (alignmentScore < 0.6) {
            console.log(`   ⏭️  Skipped (low alignment)`);
            skipped++;
            continue;
        }
        
        // Extract source URL
        const sourceMatch = text.match(/source:\s*(https?:\/\/[^\s]+)/i);
        const sourceUrl = sourceMatch ? sourceMatch[1] : null;
        
        // Generate broadcast
        const prompt = `${character.settings?.broadcastPrompt || 'Extract the most remarkable pattern or discovery. Write as David Attenborough observing technological evolution. Draw unexpected parallels between natural and technological systems. Be precise, vivid, and profound.'}

Content to analyze:
${cleanedText.substring(0, 3000)}

Critical requirements:
- Maximum 1000 characters for Telegram
- Write as yourself, from your perspective  
- Focus on ONE remarkable insight or pattern
- Be specific with numbers, names, or concrete examples
- Connect to larger implications when relevant
- Start directly with the insight
${sourceUrl ? '- Source URL will be added automatically, don\'t include it' : ''}

[BROADCAST_REQUEST:${doc.id}]`;

        const broadcastText = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.SMALL
        });
        
        // Extract broadcast message
        const messageMatch = broadcastText.match(/\[BROADCAST:.*?\](.*?)$/s);
        let finalText = messageMatch ? messageMatch[1].trim() : broadcastText.trim();
        
        // Add source URL
        if (sourceUrl) {
            finalText = `${finalText}\n\n🔗 Source: ${sourceUrl}`;
        }
        
        // Store broadcast
        const broadcastId = broadcastDb.createBroadcast(
            doc.id,
            'telegram',
            finalText,
            alignmentScore,
            'pending'
        );
        
        console.log(`   ✅ Created broadcast ${broadcastId}`);
        console.log(`   Preview: "${finalText.substring(0, 150)}..."`);
        
        results.push({
            title,
            alignmentScore,
            broadcastId,
            content: finalText
        });
        
        created++;
    }
    
    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`✅ Created: ${created} broadcasts`);
    console.log(`⏭️  Skipped: ${skipped} documents`);
    
    if (results.length > 0) {
        console.log("\n📢 GENERATED BROADCASTS:");
        console.log("-".repeat(80));
        
        results.forEach((r, i) => {
            console.log(`\n${i + 1}. ${r.title}`);
            console.log(`   Alignment: ${r.alignmentScore.toFixed(3)}`);
            console.log(`   Length: ${r.content.length} chars`);
            console.log(`   Message:\n   "${r.content}"\n`);
        });
    }
    
    db.close();
    console.log("\n✨ Batch processing complete!");
}

processBatch().catch(console.error);