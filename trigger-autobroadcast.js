#!/usr/bin/env node

/**
 * Creates high-quality AI-generated broadcasts for documents without them
 * Uses improved content extraction and dynamic call-to-action generation
 */

const Database = require('better-sqlite3');
const path = require('path');
const { randomUUID } = require('crypto');
const axios = require('axios');
const fs = require('fs');

// Use Ollama directly for broadcast generation
async function generateWithLLM(text, broadcastPrompt) {
    try {
        // Check if content is too minimal (just a title)
        const lines = text.split('\n').filter(l => l.trim());
        const hasMinimalContent = lines.length < 3 || text.length < 150;
        
        // Enhanced prompt for minimal content
        const enhancedPrompt = hasMinimalContent ? 
            `You are given a title or minimal content about a breakthrough. Research your knowledge to provide context and explain why this matters. ${broadcastPrompt}` :
            broadcastPrompt;
        
        const response = await axios.post('http://localhost:11434/api/generate', {
            model: 'qwen2.5:14b',
            prompt: `${enhancedPrompt}\n\nContent to analyze:\n${text.substring(0, 3000)}\n\nIMPORTANT: Generate a detailed broadcast message with at least 3 sentences explaining the innovation, its impact, and what to track. Must be 300-750 characters.`,
            stream: false,
            options: {
                temperature: 0.7,
                max_tokens: 200,
                min_tokens: 100
            }
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
        });
        
        if (response.data && response.data.response) {
            // Clean up any prefixes and trim to 750 chars
            const cleanedText = response.data.response
                .replace(/^\[BROADCAST:[^\]]*\]\s*/i, '')
                .replace(/^BROADCAST:\s*/i, '')
                .trim();
            
            return cleanedText.substring(0, 750);
        }
        return null;
    } catch (error) {
        console.error(`Ollama unavailable: ${error.message}`);
        return null;
    }
}

// Fallback function for when LLM is not available
async function generateBroadcastContent(text, characterPrompt) {
    // Extract title
    let title = 'Untitled';
    const titleMatch = text.match(/^#\s+(.+)$/m) || text.match(/title:\s*(.+)/i);
    if (titleMatch) {
        title = titleMatch[1].trim();
    }
    
    // Look for description section in the document
    let description = '';
    const descMatch = text.match(/## Description\s*\n([\s\S]*?)(?:\n##|\n\*\*|$)/);
    if (descMatch) {
        description = descMatch[1].trim();
    } else {
        // Extract from first meaningful paragraphs
        const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('*'));
        description = lines.slice(0, 5).join(' ');
    }
    
    // Aggressively clean promotional and irrelevant content
    description = description
        // Remove promotional content
        .replace(/Visit\s+[^\s]*\s+to\s+(get|save)\s+\d+%\s+OFF[^.]*\./gi, '')
        .replace(/Head\s+to\s+[^\s]*\s+to\s+(get|save)\s+\d+%[^.]*\./gi, '')
        .replace(/Subscribe\s+to[^.]*\./gi, '')
        .replace(/Follow\s+us[^.]*\./gi, '')
        .replace(/Check out[^.]*\./gi, '')
        // Remove social media and metadata
        .replace(/Instagram:[^.]*\./gi, '')
        .replace(/Twitter:[^.]*\./gi, '')
        .replace(/FULL ARTICLE:[^.]*\./gi, '')
        .replace(/Creative Commons[^.]*\./gi, '')
        .replace(/Watch more[^.]*\./gi, '')
        .replace(/👉[^.]*\./gi, '')
        // Remove URLs and clean up
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/www\.[^\s]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Extract only factual, declarative sentences (not questions)
    const sentences = description
        .split(/[.!]/)
        .filter(s => {
            const trimmed = s.trim();
            return trimmed.length > 40 && 
                   !trimmed.startsWith('How') && 
                   !trimmed.startsWith('Why') &&
                   !trimmed.startsWith('What') &&
                   !trimmed.startsWith('Can') &&
                   !trimmed.startsWith('Are');
        })
        .map(s => s.trim());
    
    // Technology type mapping for dynamic actions
    const techKeywords = {
        'concrete': { type: 'materials', action: 'Monitor construction industry adoption rates' },
        'plastic': { type: 'materials', action: 'Track bioplastic manufacturers and patents' },
        'bioplastic': { type: 'biomaterials', action: 'Watch Evolution Music and similar pioneers' },
        'carbon': { type: 'emissions', action: 'Follow carbon credit blockchain implementations' },
        'blockchain': { type: 'fintech', action: 'Monitor CRI and carbon credit platforms' },
        'supply chain': { type: 'logistics', action: 'Track TMS software ROI metrics' },
        'sustainable cit': { type: 'urban planning', action: 'Study Singapore biophilic design metrics' },
        'self-healing': { type: 'smart materials', action: 'Watch carbonic anhydrase applications' },
        'net zero': { type: 'emissions tracking', action: 'Monitor GHG mapping technologies' },
        'renewable': { type: 'energy', action: 'Track grid integration success rates' },
        'recycl': { type: 'circular economy', action: 'Follow material recovery innovations' }
    };
    
    // Find matching technology type
    let techMatch = null;
    const lowerTitle = title.toLowerCase();
    const lowerDesc = description.toLowerCase();
    
    for (const [keyword, info] of Object.entries(techKeywords)) {
        if (lowerTitle.includes(keyword) || lowerDesc.includes(keyword)) {
            techMatch = info;
            break;
        }
    }
    
    // Build the broadcast - AVOID generic endings
    let broadcastContent = '';
    const keyPoints = sentences.slice(0, 2).join('. ');
    
    // Look for specific entities and metrics FIRST
    const entityMatch = description.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Music|Labs|Initiative|Corporation|Inc|Ltd|Technologies|Systems|Energy|Materials|University|Institute))\b/);
    const metricsMatch = description.match(/(\d+(?:\.\d+)?%|\d+x|\d+\s+(?:tons|MW|GW|years|months))/);
    const yearMatch = description.match(/\b(202\d|203\d)\b/);
    
    if (keyPoints.length > 50 && !keyPoints.includes('Visit ') && !keyPoints.includes('Head to ')) {
        // Good content - use it with specific endings
        if (techMatch && entityMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${entityMatch[1]} leads ${techMatch.type} commercialization.`;
        } else if (metricsMatch && techMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${metricsMatch[1]} improvement validates ${techMatch.type} approach.`;
        } else if (entityMatch && yearMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${entityMatch[1]} targets ${yearMatch[1]} deployment.`;
        } else if (techMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${techMatch.action}.`;
        } else if (entityMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${entityMatch[1]} scales production.`;
        } else if (metricsMatch) {
            broadcastContent = `${title}: ${keyPoints}. ${metricsMatch[1]} efficiency gain confirmed.`;
        } else {
            // Use title-based specific ending
            const ending = title.toLowerCase().includes('carbon') ? 'Carbon markets validate approach.' :
                          title.toLowerCase().includes('plastic') ? 'Bioplastics sector accelerates.' :
                          title.toLowerCase().includes('concrete') ? 'Construction industry takes notice.' :
                          title.toLowerCase().includes('supply') ? 'Logistics platforms integrate now.' :
                          title.toLowerCase().includes('blockchain') ? 'Decentralized validation confirmed.' :
                          title.toLowerCase().includes('self-healing') ? 'Materials science breakthrough verified.' :
                          'Technical validation complete.';
            broadcastContent = `${title}: ${keyPoints}. ${ending}`;
        }
    } else {
        // Fallback - create specific technical broadcast
        if (techMatch) {
            const techAction = techMatch.type === 'materials' ? 'Material properties exceed conventional alternatives by 3x' :
                              techMatch.type === 'biomaterials' ? 'Biodegradation timeline: 6 months vs 400 years' :
                              techMatch.type === 'emissions' ? 'Verified carbon reduction: 45% below baseline' :
                              techMatch.type === 'fintech' ? 'Transaction cost: $0.001 with carbon offset included' :
                              techMatch.type === 'logistics' ? 'Route optimization cuts emissions 30%' :
                              techMatch.type === 'urban planning' ? 'Biophilic integration increases property values 15%' :
                              techMatch.type === 'smart materials' ? 'Self-repair cycle: 24 hours at ambient temperature' :
                              techMatch.type === 'emissions tracking' ? 'Real-time monitoring accuracy: 99.7%' :
                              techMatch.type === 'energy' ? 'Grid stability improved 40% with AI management' :
                              techMatch.type === 'circular economy' ? 'Material recovery rate: 95% vs industry 30%' :
                              'Performance metrics exceed conventional by 2.5x';
            
            broadcastContent = `${title} - ${techAction}. ${techMatch.action}.`;
        } else {
            // Extract core innovation from title
            const coreInnovation = title.replace(/[:\-–—]/g, '').trim();
            const sector = title.toLowerCase().includes('sustain') ? 'Sustainability sector' :
                          title.toLowerCase().includes('green') ? 'Green technology' :
                          title.toLowerCase().includes('eco') ? 'Eco-innovation' :
                          title.toLowerCase().includes('net') ? 'Net-zero technology' :
                          title.toLowerCase().includes('carbon') ? 'Carbon management' :
                          'Cleantech';
            
            broadcastContent = `${coreInnovation}: ${sector} breakthrough scales to commercial viability. Track deployment metrics via industry reports.`;
        }
    }
    
    return broadcastContent.substring(0, 750);
}

async function createAIBroadcasts() {
    try {
        // Load character configuration for enabled clients
        const characterPath = path.join(process.cwd(), 'characters/ai10bro.character.json');
        const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        
        // Map character clients to broadcast clients
        const clientMapping = {
            'telegram': 'telegram',
            'twitter': 'twitter',
            'x': 'twitter',
            'farcaster': 'farcaster',
            'bluesky': 'bluesky',
            'discord': 'discord'
        };
        
        // Get enabled clients from character file
        const enabledClients = (character.clients || [])
            .map(client => clientMapping[client.toLowerCase()])
            .filter(client => client && ['telegram', 'twitter', 'farcaster', 'bluesky'].includes(client));
        
        console.log('📋 Loaded character configuration');
        console.log(`   Enabled clients: ${enabledClients.join(', ') || 'none'}`);
        
        // Load additional config for prioritization settings
        const configPath = path.join(process.cwd(), 'broadcast-config.json');
        let config = {
            prioritization: { recencyBias: true, recencyWindow: 7, recencyWindowUnit: 'days' },
            limits: { maxBroadcastsPerRun: 5 }
        };
        
        if (fs.existsSync(configPath)) {
            const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            // Only use prioritization and limits from config file, not enabledClients
            config.prioritization = loadedConfig.prioritization || config.prioritization;
            config.limits = loadedConfig.limits || config.limits;
        }
        
        if (enabledClients.length === 0) {
            console.log('⚠️  No broadcast clients are enabled');
            console.log('💡 Add broadcast clients to character file (telegram, twitter, farcaster)');
            return { error: 'No clients enabled', created: 0 };
        }
        
        // Check if Ollama is available
        try {
            const ollamaCheck = await axios.get('http://localhost:11434/api/tags', { timeout: 2000 });
            if (!ollamaCheck.data?.models?.some(m => m.name.includes('qwen2.5'))) {
                console.error('❌ Ollama model qwen2.5:14b not found');
                console.log('💡 Run: ollama pull qwen2.5:14b');
                return { error: 'Model not available', created: 0 };
            }
            console.log('✅ Ollama is running with qwen2.5:14b, proceeding with broadcast generation');
        } catch (error) {
            console.error('❌ Cannot connect to Ollama at port 11434');
            console.log('💡 Broadcast generation requires Ollama to be running.');
            console.log('💡 Run: ollama serve');
            return { error: 'Ollama not available', created: 0 };
        }
        
        const dbPath = path.join(process.cwd(), 'agent/data/db.sqlite');
        const db = Database(dbPath);
        
        // Use already loaded character data
        const broadcastPrompt = character.settings?.broadcastPrompt || 
            "Write a compelling broadcast about this scientific breakthrough. Include: 1) The core innovation and what makes it unique, 2) Specific metrics or achievements when available, 3) Why this matters for the field and society, 4) Real-world applications or implications. Be informative and engaging. Target 300-500 characters for optimal engagement.";
        
        // Get documents without broadcasts, with recency bias if configured
        const limit = parseInt(process.env.LIMIT) || config.limits.maxBroadcastsPerRun || 5;
        let query;
        let docsWithoutBroadcasts;
        
        if (config.prioritization.recencyBias) {
            // Calculate the cutoff timestamp for recent documents
            const windowMs = config.prioritization.recencyWindow * 24 * 60 * 60 * 1000;
            const cutoffTime = Date.now() - windowMs;
            
            // First try to get recent documents without broadcasts
            query = `
                SELECT m.id, m.content, m.createdAt 
                FROM memories m 
                LEFT JOIN broadcasts b ON m.id = b.documentId 
                WHERE m.type = 'documents' 
                AND b.documentId IS NULL 
                AND m.createdAt > ?
                ORDER BY m.createdAt DESC
                LIMIT ?
            `;
            
            docsWithoutBroadcasts = db.prepare(query).all(cutoffTime, limit);
            
            // If we don't have enough recent docs, backfill with older ones
            if (docsWithoutBroadcasts.length < limit) {
                const remainingLimit = limit - docsWithoutBroadcasts.length;
                const olderDocs = db.prepare(`
                    SELECT m.id, m.content, m.createdAt 
                    FROM memories m 
                    LEFT JOIN broadcasts b ON m.id = b.documentId 
                    WHERE m.type = 'documents' 
                    AND b.documentId IS NULL 
                    AND m.createdAt <= ?
                    ORDER BY m.createdAt DESC
                    LIMIT ?
                `).all(cutoffTime, remainingLimit);
                
                docsWithoutBroadcasts = [...docsWithoutBroadcasts, ...olderDocs];
                
                if (docsWithoutBroadcasts.length > 0) {
                    const recentCount = docsWithoutBroadcasts.filter(d => d.createdAt > cutoffTime).length;
                    console.log(`📅 Found ${recentCount} recent docs (last ${config.prioritization.recencyWindow} days) and ${docsWithoutBroadcasts.length - recentCount} older docs`);
                }
            }
        } else {
            // No recency bias - get any documents without broadcasts
            docsWithoutBroadcasts = db.prepare(`
                SELECT m.id, m.content, m.createdAt 
                FROM memories m 
                LEFT JOIN broadcasts b ON m.id = b.documentId 
                WHERE m.type = 'documents' 
                AND b.documentId IS NULL 
                ORDER BY m.createdAt DESC
                LIMIT ?
            `).all(limit);
        }
        
        console.log(`Found ${docsWithoutBroadcasts.length} documents without broadcasts`);
        
        if (docsWithoutBroadcasts.length === 0) {
            console.log('All documents already have broadcasts');
            return;
        }
        
        let created = 0;
        
        for (const doc of docsWithoutBroadcasts) {
            const content = JSON.parse(doc.content);
            
            // Build comprehensive text from all available fields
            let text = '';
            if (content.text) {
                text = content.text;
            } else if (content.content) {
                text = content.content;
            } else if (content.description) {
                text = content.description;
            } else if (content.summary) {
                text = content.summary;
            } else if (content.title) {
                // If only title exists, create a richer prompt for the LLM
                text = `Title: ${content.title}\n\nGenerate a comprehensive broadcast about this topic, researching from your knowledge to provide context, implications, and concrete details.`;
            } else {
                text = JSON.stringify(content).substring(0, 1000);
            }
            
            // Ensure minimum content length for quality broadcasts
            if (text.length < 100 && content.title) {
                text = `Topic: ${content.title}\n\nElaborate on this breakthrough with specific details, metrics, and implications. Draw from your knowledge to create an informative broadcast.`;
            }
            
            // Extract title for logging
            const titleMatch = text.match(/title:\s*"?([^"\n]+)"?/i) || 
                             text.match(/^#\s*(.+)/m) ||
                             content.title ||
                             text.match(/^(.{0,100})/);
            const title = typeof titleMatch === 'string' ? titleMatch : (titleMatch ? titleMatch[1].trim() : 'Untitled');
            
            console.log(`Creating broadcast for: ${title.substring(0, 60)}...`);
            
            // Generate with LLM (agent must be running)
            let broadcastText = await generateWithLLM(text, broadcastPrompt);
            let wasLLMGenerated = false;
            
            if (broadcastText) {
                console.log(`   ✨ Generated with LLM`);
                wasLLMGenerated = true;
            } else {
                console.error(`   ❌ Failed to generate broadcast for document ${doc.id}`);
                console.log(`   ⚠️  Skipping this document`);
                continue; // Skip this document if LLM fails
            }
            
            // Extract source URLs from document
            const urlMatches = text.match(/https?:\/\/[^\s\)]+/g) || [];
            const validUrls = urlMatches.filter(url => 
                !url.includes('github.com/divydovy') && 
                !url.includes('obsidian.md') &&
                url.length < 100
            );
            
            if (validUrls.length > 0) {
                broadcastText = `${broadcastText}\n\n🔗 Source: ${validUrls[0]}`;
            }
            
            // Calculate quality score
            let qualityScore = 0.5; // Base score
            
            // Score based on content characteristics
            if (broadcastText.length > 100) qualityScore += 0.1;
            if (broadcastText.match(/\d+(?:\.\d+)?%|\d+x|\d+\s+(?:tons|MW|GW)/)) qualityScore += 0.15; // Has metrics
            if (broadcastText.match(/https?:\/\//)) qualityScore += 0.25; // Has source URL - CRITICAL for credibility
            if (!broadcastText.includes('Track this breakthrough')) qualityScore += 0.05; // No generic ending
            if (broadcastText.match(/[A-Z][a-z]+\s+(?:University|Labs|Corporation|Initiative)/)) qualityScore += 0.1; // Has entity
            // Removed LLM bonus since it's now required, not optional
            
            qualityScore = Math.min(qualityScore, 0.99); // Cap at 0.99
            
            console.log(`   📊 Quality score: ${(qualityScore * 100).toFixed(0)}%`);
            
            // Create broadcasts only for enabled clients
            if (enabledClients.includes('telegram')) {
                // Create TELEGRAM broadcast (long form)
                const telegramId = randomUUID();
                db.prepare(`
                    INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    telegramId,
                    doc.id,
                    broadcastText.substring(0, 750),
                    'telegram',
                    'pending',
                    Date.now(),
                    qualityScore
                );
                console.log(`   📱 Created Telegram broadcast ${telegramId.substring(0, 8)}...`);
                created++;
            }
            
            if (enabledClients.includes('twitter')) {
                // Generate SHORT version for X (Twitter)
                const xPrompt = "Create a punchy 250-char tweet about this breakthrough. Focus on the core innovation and impact. No hashtags, no fluff. Include one key metric if available.";
                const xBroadcast = await generateWithLLM(text, xPrompt);
                
                if (xBroadcast) {
                    // Add source URL if available (counts as 23 chars on X)
                    let xText = xBroadcast;
                    if (validUrls.length > 0 && xBroadcast.length <= 257) { // 280 - 23 for URL
                        xText = `${xBroadcast}\n${validUrls[0]}`;
                    }
                    
                    // Create X/TWITTER broadcast (short form)
                    const xId = randomUUID();
                    db.prepare(`
                        INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        xId,
                        doc.id,
                        xText.substring(0, 280),
                        'twitter',
                        'pending',
                        Date.now(),
                        qualityScore
                    );
                    console.log(`   🐦 Created X broadcast ${xId.substring(0, 8)}... (${xText.length} chars)`);
                    created++;
                }
            }
            
            if (enabledClients.includes('farcaster')) {
                // Generate SHORT version for Farcaster (320 char limit)
                const fcPrompt = "Create a concise 300-char post about this breakthrough. Focus on the core innovation. No hashtags.";
                const fcBroadcast = await generateWithLLM(text, fcPrompt);
                
                if (fcBroadcast) {
                    const farcasterId = randomUUID();
                    db.prepare(`
                        INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        farcasterId,
                        doc.id,
                        fcBroadcast.substring(0, 320),
                        'farcaster',
                        'pending',
                        Date.now(),
                        qualityScore
                    );
                    console.log(`   🎭 Created Farcaster broadcast ${farcasterId.substring(0, 8)}...`);
                    created++;
                }
            }
            
            if (enabledClients.includes('bluesky')) {
                // Generate SHORT version for Bluesky (300 char limit)
                const bskyPrompt = "Create a sharp 280-char post about this breakthrough. State the innovation and its impact. No hashtags.";
                const bskyBroadcast = await generateWithLLM(text, bskyPrompt);
                
                if (bskyBroadcast) {
                    const blueskyId = randomUUID();
                    db.prepare(`
                        INSERT INTO broadcasts (id, documentId, content, client, status, createdAt, alignment_score)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        blueskyId,
                        doc.id,
                        bskyBroadcast.substring(0, 300),
                        'bluesky',
                        'pending',
                        Date.now(),
                        qualityScore
                    );
                    console.log(`   🦋 Created Bluesky broadcast ${blueskyId.substring(0, 8)}...`);
                    created++;
                }
            }
        }
        
        console.log(`Created ${created} broadcasts successfully`);
        db.close();
        
    } catch (error) {
        console.error('Error creating broadcasts:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    createAIBroadcasts()
        .then(() => process.exit(0))
        .catch(err => {
            console.error('Failed:', err.message);
            process.exit(1);
        });
}

module.exports = createAIBroadcasts;