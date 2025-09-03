#!/usr/bin/env node

/**
 * Generates AI-powered broadcasts using the local Eliza agent's LLM
 * This leverages the running agent's AI capabilities for broadcast generation
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const axios = require('axios');

const AGENT_URL = 'http://localhost:3000'; // Eliza agent REST API

async function generateWithLocalLLM(documentText, broadcastPrompt) {
    try {
        // Call the local Eliza agent's API to generate broadcast content
        const response = await axios.post(`${AGENT_URL}/api/message`, {
            text: `${broadcastPrompt}\n\nContent to analyze:\n${documentText.substring(0, 3000)}\n\nGenerate a broadcast message (max 750 characters).`,
            userId: 'broadcast-generator',
            roomId: `broadcast-${Date.now()}`
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        // Extract the generated text from response
        if (response.data && response.data.text) {
            return response.data.text;
        }
        return null;
    } catch (error) {
        console.error(`Error calling local LLM: ${error.message}`);
        return null;
    }
}

async function generateAIBroadcasts() {
    try {
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = Database(dbPath);
        
        // Load character configuration to get broadcast prompt
        const characterPath = path.join(process.cwd(), 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        
        // Get the character's broadcast prompt
        const broadcastPrompt = character.settings?.broadcastPrompt || 
            "Write a sharp, direct broadcast about this breakthrough. State the core innovation first, then explain why it matters. End with ONE concrete action (researcher/company/platform to track). Skip metaphors and flowery language. Be specific and factual. Use actual HTTPS source URLs. Max 750 chars.";
        
        // Get documents without broadcasts (limit to 3 for AI generation)
        const docsWithoutBroadcasts = db.prepare(`
            SELECT m.id, m.content 
            FROM memories m 
            LEFT JOIN broadcasts b ON m.id = b.documentId 
            WHERE m.type = 'documents' 
            AND b.documentId IS NULL 
            LIMIT 3
        `).all();
        
        console.log(`🤖 Found ${docsWithoutBroadcasts.length} documents for local AI broadcast generation`);
        
        if (docsWithoutBroadcasts.length === 0) {
            console.log('✅ All documents already have broadcasts!');
            return { created: 0, total: 0 };
        }
        
        // Check if agent is available
        try {
            await axios.get(`${AGENT_URL}/api/agents`, { timeout: 2000 });
            console.log('✅ Connected to local Eliza agent on port 3000');
        } catch (error) {
            console.log('⚠️  Local agent not available, using enhanced fallback');
        }
        
        let created = 0;
        let aiGenerated = 0;
        
        for (const doc of docsWithoutBroadcasts) {
            const content = JSON.parse(doc.content);
            const text = content.text || content.title || 'No content';
            
            // Extract title for logging
            const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/i) || 
                             text.match(/^#\s*(.+)/m) ||
                             text.match(/^(.{0,100})/);
            const title = titleMatch ? titleMatch[1].trim() : 'Untitled';
            
            console.log(`\n🔄 Generating broadcast for: ${title.substring(0, 60)}...`);
            
            // Try to generate with local LLM
            let broadcastContent = await generateWithLocalLLM(text, broadcastPrompt);
            
            if (broadcastContent) {
                console.log(`   ✨ AI generated with local LLM`);
                aiGenerated++;
                
                // Clean up any prefixes that might have been added
                broadcastContent = broadcastContent
                    .replace(/^\[BROADCAST:[^\]]*\]\s*/i, '')
                    .replace(/^BROADCAST:\s*/i, '')
                    .trim();
            } else {
                // Enhanced fallback when LLM is not available
                console.log(`   ⚠️  Using enhanced fallback`);
                
                // Extract key information from document
                const lines = text.split('\n').filter(l => l.trim());
                const descMatch = text.match(/## Description\s*\n([\s\S]*?)(?:\n##|\n\*\*|$)/);
                
                if (descMatch) {
                    const description = descMatch[1].trim()
                        .replace(/\n/g, ' ')
                        .replace(/\s+/g, ' ')
                        .replace(/https?:\/\/[^\s]+/g, '')
                        .substring(0, 400);
                    
                    // Create a focused message
                    const keyPoints = description.split('.').slice(0, 2).join('.').trim();
                    broadcastContent = `${title}: ${keyPoints}. Track this breakthrough in sustainable technology for immediate impact insights.`;
                } else {
                    // Basic fallback
                    broadcastContent = `${title} - Critical advancement in sustainable technology. This innovation disrupts traditional approaches with measurable environmental impact. Monitor for deployment updates.`;
                }
            }
            
            // Create the broadcast entry
            const broadcastId = randomUUID();
            db.prepare(`
                INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                broadcastId,
                doc.id,
                broadcastContent.substring(0, 750),
                'telegram',
                'pending',
                Date.now(),
                broadcastContent.includes('AI generated') ? 0.95 : 0.8
            );
            
            created++;
            console.log(`   ✅ Created broadcast ${broadcastId.substring(0, 8)}...`);
        }
        
        console.log(`\n🎉 Created ${created} broadcasts (${aiGenerated} with AI, ${created - aiGenerated} with fallback)`);
        
        db.close();
        return { created, aiGenerated, total: created };
        
    } catch (error) {
        console.error('❌ Error creating broadcasts:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    generateAIBroadcasts()
        .then(result => {
            console.log(`\n✅ Process complete: ${result.created} broadcasts created`);
            process.exit(0);
        })
        .catch(err => {
            console.error('Failed:', err.message);
            process.exit(1);
        });
}

module.exports = generateAIBroadcasts;