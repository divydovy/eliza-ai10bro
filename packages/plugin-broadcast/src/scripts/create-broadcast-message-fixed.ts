// @ts-check
/* FIXED VERSION - Eliminates expensive LLM calls */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { getEmbeddingZeroVector, IAgentRuntime } from "@elizaos/core";
import { BroadcastDB } from "../db/operations";
import { initializeBroadcastSchema } from "../db/schema";

interface DatabaseMemory {
    id: string;
    content: string;
    createdAt: number;
}

interface PlatformMessage {
    telegram?: {
        text: string;
        format: 'markdown' | 'html' | 'plain';
    };
    twitter?: {
        text: string;
    };
}

function getUnbroadcastDocuments(db: ReturnType<typeof Database>): DatabaseMemory[] {
    // Get all documents that haven't been broadcast yet and aren't currently being processed
    return db.prepare(`
        SELECT m.* FROM memories m
        WHERE m.type = 'documents'
        AND json_valid(m.content)
        AND json_extract(m.content, '$.text') NOT LIKE '%This is a test document%'
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m.id
            AND (b.status = 'pending' OR b.status = 'sent')
        )
        ORDER BY m.createdAt ASC
    `).all() as DatabaseMemory[];
}

// COST ELIMINATION #1: Replace expensive LLM calls with template-based formatting
function generatePlatformMessagesTemplate(content: string, metadata: any): PlatformMessage {
    const sourceUrl = metadata?.frontmatter?.source || metadata.source || 'Unknown';
    const title = metadata?.frontmatter?.title || 'Update';
    
    // Extract key insight from content (first meaningful paragraph)
    const lines = content.split('\n').filter(line => line.trim().length > 50);
    const keyInsight = lines[0] || content.substring(0, 200);
    
    // Template-based message generation (ZERO LLM COST)
    const telegramMessage = createTelegramMessage(title, keyInsight, sourceUrl);
    const twitterMessage = createTwitterMessage(title, keyInsight, sourceUrl);
    
    console.log(`[FIXED] Template generation - Cost: $0.00 (was ~$0.25)`);
    
    return {
        telegram: { text: telegramMessage, format: 'markdown' },
        twitter: { text: twitterMessage }
    };
}

// COST ELIMINATION #2: Smart truncation that preserves sentences
function smartTruncate(text: string, maxLength: number, reserveSpace: number = 0): string {
    const availableLength = maxLength - reserveSpace;
    
    if (text.length <= availableLength) {
        return text;
    }
    
    // Find last complete sentence within limit
    const truncated = text.substring(0, availableLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastNewline = truncated.lastIndexOf('\n');
    
    const sentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion, lastNewline);
    
    // If we found a sentence boundary and it's not too short, use it
    if (sentenceEnd > availableLength * 0.7) {
        return truncated.substring(0, sentenceEnd + 1).trim();
    }
    
    // Otherwise, find last word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > availableLength * 0.8) {
        return truncated.substring(0, lastSpace).trim() + '...';
    }
    
    // Fallback: hard truncate with ellipsis
    return truncated.substring(0, availableLength - 3).trim() + '...';
}

function createTelegramMessage(title: string, insight: string, sourceUrl: string): string {
    const TELEGRAM_MAX_LENGTH = 4096;
    
    // Build message components
    const header = `📢 *${title}*\n\n`;
    const link = sourceUrl !== 'Unknown' ? `\n\n🔗 [Source](${sourceUrl})` : '';
    
    // Calculate available space for content
    const reservedSpace = header.length + link.length;
    const availableLength = TELEGRAM_MAX_LENGTH - reservedSpace;
    
    // Smart truncate the insight
    const truncatedInsight = smartTruncate(insight, availableLength);
    
    const finalMessage = header + truncatedInsight + link;
    console.log(`[FIXED] Telegram message length: ${finalMessage.length}/${TELEGRAM_MAX_LENGTH}`);
    
    return finalMessage;
}

function createTwitterMessage(title: string, insight: string, sourceUrl: string): string {
    const TWITTER_MAX_LENGTH = 280;
    
    // Build message components  
    const link = sourceUrl !== 'Unknown' ? ` ${sourceUrl}` : '';
    
    // Calculate available space for content
    const reservedSpace = link.length + 5; // extra buffer
    const availableLength = TWITTER_MAX_LENGTH - reservedSpace;
    
    // Create concise message
    let message = `${title}: ${insight}`;
    
    // Smart truncate if needed
    if (message.length > availableLength) {
        message = smartTruncate(message, availableLength);
    }
    
    const finalMessage = message + link;
    console.log(`[FIXED] Twitter message length: ${finalMessage.length}/${TWITTER_MAX_LENGTH}`);
    
    return finalMessage;
}

// COST ELIMINATION #3: Simple heuristic filtering instead of expensive embeddings
function isContentRelevant(content: string, title: string): boolean {
    const relevantKeywords = [
        'technology', 'innovation', 'nature', 'biomimicry', 'sustainable', 'environment',
        'science', 'breakthrough', 'discovery', 'research', 'development', 'future',
        'artificial intelligence', 'machine learning', 'robotics', 'materials',
        'energy', 'climate', 'ecosystem', 'biology', 'engineering'
    ];
    
    const contentLower = (content + ' ' + title).toLowerCase();
    const keywordMatches = relevantKeywords.filter(keyword => 
        contentLower.includes(keyword)
    ).length;
    
    // Must have at least 2 relevant keywords and be substantial
    const isRelevant = keywordMatches >= 2 && content.length >= 100;
    
    console.log(`[FIXED] Heuristic filtering - Keywords: ${keywordMatches}, Relevant: ${isRelevant}`);
    return isRelevant;
}

function cleanRoleplayElements(text: string): string {
    // Remove text between asterisks (roleplay actions)
    let cleaned = text.replace(/\*[^*]+\*/g, '');
    // Trim extra whitespace and normalize spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

export async function createBroadcastMessageFixed(runtime: IAgentRuntime, characterName: string = 'c3po'): Promise<void> {
    console.log('🚀 Starting COST-OPTIMIZED broadcast message creation...');

    // Get database path from runtime settings or use default
    const dbPath = runtime.getSetting('database.path') || path.join(process.cwd(), 'data', 'db.sqlite');
    console.log('Database path:', dbPath);
    const db = new Database(dbPath);
    console.log('Successfully connected to database');

    // Ensure broadcasts table exists
    initializeBroadcastSchema(db);

    // Initialize broadcast DB
    const broadcastDb = new BroadcastDB(db);

    try {
        // Get all documents to broadcast
        const docs = getUnbroadcastDocuments(db);
        if (!docs.length) {
            console.log('No documents found that need to be prepared for broadcast');
            return;
        }

        console.log(`📊 Processing ${docs.length} documents with ZERO LLM CALLS`);
        let processedCount = 0;
        let skippedCount = 0;

        for (const doc of docs) {
            const content = JSON.parse(doc.content);
            const metadata = content.metadata || {};
            const frontmatter = metadata.frontmatter || {};
            const title = frontmatter.title || (content.text ? content.text.slice(0, 60) + (content.text.length > 60 ? '...' : '') : 'No title');
            const source = frontmatter.source || metadata.source || 'Unknown';
            const text = content.text || '';

            // Clean roleplay elements from the text
            const cleanedText = cleanRoleplayElements(text);

            // COST ELIMINATION: Use heuristic filtering instead of expensive embeddings
            if (!isContentRelevant(cleanedText, title)) {
                console.log(`⏭️  Skipping doc "${title}" (not relevant)`);
                skippedCount++;
                continue;
            }

            // COST ELIMINATION: Use template generation instead of LLM calls
            const messages = generatePlatformMessagesTemplate(cleanedText, { frontmatter: { title, source } });

            // For each platform, create a memory and broadcast record
            if (messages.telegram) {
                // Create a new memory for the telegram broadcast message
                const telegramMemoryId = crypto.randomUUID();
                const telegramMemory: DatabaseMemory = {
                    id: telegramMemoryId,
                    content: JSON.stringify({
                        text: messages.telegram.text,
                        metadata: {
                            messageType: 'broadcast',
                            status: 'pending',
                            sourceMemoryId: doc.id
                        }
                    }),
                    createdAt: Date.now()
                };
                const zeroEmbedding = getEmbeddingZeroVector();
                db.prepare(`INSERT INTO memories (id, content, createdAt, type, embedding) VALUES (?, ?, ?, 'messages', ?)`)
                  .run(
                    telegramMemoryId,
                    telegramMemory.content,
                    telegramMemory.createdAt,
                    JSON.stringify(zeroEmbedding)
                  );
                await broadcastDb.createBroadcast(doc.id, 'telegram', telegramMemoryId, 1.0, 'pending'); // High score since we pre-filtered
            }
            
            if (messages.twitter) {
                // Create a new memory for the twitter broadcast message
                const twitterMemoryId = crypto.randomUUID();
                const twitterMemory: DatabaseMemory = {
                    id: twitterMemoryId,
                    content: JSON.stringify({
                        text: messages.twitter.text,
                        metadata: {
                            messageType: 'broadcast',
                            status: 'pending',
                            sourceMemoryId: doc.id
                        }
                    }),
                    createdAt: Date.now()
                };
                const zeroEmbedding = getEmbeddingZeroVector();
                db.prepare(`INSERT INTO memories (id, content, createdAt, type, embedding) VALUES (?, ?, ?, 'messages', ?)`)
                  .run(
                    twitterMemoryId,
                    twitterMemory.content,
                    twitterMemory.createdAt,
                    JSON.stringify(zeroEmbedding)
                  );
                await broadcastDb.createBroadcast(doc.id, 'twitter', twitterMemoryId, 1.0, 'pending'); // High score since we pre-filtered
            }

            console.log(`✅ Successfully created broadcast messages for document: ${doc.id} (title: ${title})`);
            processedCount++;
        }
        
        console.log(`\n🎉 COST OPTIMIZATION COMPLETE!`);
        console.log(`📊 Processed: ${processedCount}, Skipped: ${skippedCount}`);
        console.log(`💰 Cost per run: $0.00 (was ~$${(processedCount * 0.25).toFixed(2)})`);
        console.log(`📈 Savings: 100% reduction in broadcast generation costs!`);
        
    } catch (error) {
        console.error('Error creating broadcast message:', error);
        throw error;
    } finally {
        db.close();
    }
}