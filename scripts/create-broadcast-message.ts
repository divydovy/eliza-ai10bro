// @ts-check
/* tsconfig options */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelProviderName, ModelClass, Character, embed } from "../packages/core/dist/index.js";
import { Anthropic } from "@anthropic-ai/sdk";

console.log('Starting broadcast message creation...');

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
console.log('Database path:', dbPath);
const db = new Database(dbPath);
console.log('Successfully connected to database');

// Ensure broadcasts table exists with new schema
await db.exec(`
    DROP TABLE IF EXISTS broadcasts;

    CREATE TABLE IF NOT EXISTS broadcasts (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        telegram_message_id TEXT,
        telegram_status TEXT DEFAULT 'pending',
        telegram_sent_at INTEGER,
        twitter_message_id TEXT,
        twitter_status TEXT DEFAULT 'pending',
        twitter_sent_at INTEGER,
        FOREIGN KEY (documentId) REFERENCES memories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_broadcasts_documentid ON broadcasts(documentId);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_telegram_status ON broadcasts(telegram_status);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_twitter_status ON broadcasts(twitter_status);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_createdat ON broadcasts(createdAt);
`);

interface MessageContent {
    text: string;
    metadata: {
        messageType: 'broadcast';
        status: 'pending';
        sourceMemoryId?: string;
    };
}

interface DatabaseMemory {
    id: string;
    content: string;
    createdAt: number;
}

interface BroadcastMessage {
    id: string;
}

interface CharacterSettings {
    name: string;
    modelProvider?: ModelProviderName;
    bio?: string[];
    lore?: string[];
    messageExamples?: any[];
    postExamples?: string[];
    topics?: string[];
    adjectives?: string[];
    clients?: string[];
    plugins?: string[];
    style?: {
        all: string[];
        chat: string[];
        post: string[];
    };
    settings?: {
        broadcastPrompt?: string;
        secrets?: {
            ANTHROPIC_API_KEY?: string;
        };
        serverPort?: number;
        maxInputTokens?: number;
        maxOutputTokens?: number;
        temperature?: number;
        maxPromptTokens?: number;
    };
}

interface Memory {
    type: 'messages' | 'documents' | 'fragments';
    content: string;
}

interface PlatformMessage {
    telegram?: {
        text: string;
        format: 'markdown' | 'html' | 'plain';
    };
    twitter?: {
        text: string;
        threadId?: string;
    };
}

interface BroadcastResult {
    telegramId?: string;
    twitterId?: string;
}

interface BroadcastRecord {
    id: string;
    documentId: string;
    platforms: {
        telegram?: {
            messageId: string;
            status: 'pending' | 'sent' | 'failed';
            sentAt?: number;
        };
        twitter?: {
            messageId: string;
            status: 'pending' | 'sent' | 'failed';
            sentAt?: number;
        };
    };
    createdAt: number;
}

function countTokens(text: string): number {
    try {
        // Use Claude's tokenizer which is roughly 1 token per 4 characters
        return Math.ceil(text.length / 4);
    } catch (error) {
        // Fallback to even more conservative estimation if tokenizer fails
        return Math.ceil(text.length / 3);
    }
}

function getNextUnbroadcastDocument(): DatabaseMemory | undefined {
    // Get the oldest document that hasn't been broadcast yet and isn't currently being processed
    const doc = db.prepare(`
        SELECT m.* FROM memories m
        WHERE m.type = 'documents'
        AND json_valid(m.content)
        AND json_extract(m.content, '$.metadata.frontmatter') IS NOT NULL
        AND json_extract(m.content, '$.metadata.frontmatter.title') IS NOT NULL
        AND json_extract(m.content, '$.metadata.frontmatter.source') IS NOT NULL
        AND json_extract(m.content, '$.text') NOT LIKE '%This is a test document%'
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m.id
            AND (b.telegram_status = 'pending' OR b.telegram_status = 'sent'
                 OR b.twitter_status = 'pending' OR b.twitter_status = 'sent')
        )
        ORDER BY m.createdAt ASC
        LIMIT 1
    `).get() as DatabaseMemory | undefined;

    return doc;
}

async function generatePlatformMessages(content: string, metadata: any): Promise<PlatformMessage> {
    const sourceUrl = metadata?.frontmatter?.source || metadata.source || 'Unknown';

    // For Telegram, we can include more formatting and detail
    const telegramText = content + (sourceUrl !== 'Unknown' ? `\n\n🔗 [Read more](${sourceUrl})` : '');

    // For Twitter, we need to ensure we're within limits
    const twitterMaxLength = 280 - (sourceUrl !== 'Unknown' ? sourceUrl.length + 1 : 0);
    let twitterText = content;
    if (sourceUrl !== 'Unknown') {
        if (twitterText.length > twitterMaxLength) {
            twitterText = twitterText.slice(0, twitterMaxLength - 4) + '... ' + sourceUrl;
        } else {
            twitterText = twitterText + ' ' + sourceUrl;
        }
    }

    return {
        telegram: {
            text: telegramText,
            format: 'markdown'
        },
        twitter: {
            text: twitterText
        }
    };
}

async function saveMessageToMemories(message: Memory): Promise<string> {
    const id = crypto.randomUUID();
    db.prepare(`
        INSERT INTO memories (id, type, content, createdAt, embedding)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, message.type, message.content, Date.now(), JSON.stringify(getEmbeddingZeroVector()));
    return id;
}

async function savePlatformMessages(messages: PlatformMessage): Promise<BroadcastResult> {
    const result: BroadcastResult = {};

    if (messages.telegram) {
        result.telegramId = await saveMessageToMemories({
            type: 'messages',
            content: JSON.stringify({
                text: messages.telegram.text,
                format: messages.telegram.format
            })
        });
    }

    if (messages.twitter) {
        result.twitterId = await saveMessageToMemories({
            type: 'messages',
            content: JSON.stringify({
                text: messages.twitter.text,
                threadId: messages.twitter.threadId
            })
        });
    }

    return result;
}

async function recordBroadcast(documentId: string, messageIds: BroadcastResult): Promise<string> {
    const broadcastId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO broadcasts (
            id,
            documentId,
            telegram_message_id,
            twitter_message_id,
            telegram_status,
            twitter_status,
            createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        broadcastId,
        documentId,
        messageIds.telegramId,
        messageIds.twitterId,
        messageIds.telegramId ? 'pending' : 'failed',
        messageIds.twitterId ? 'pending' : 'failed',
        Date.now()
    );

    return broadcastId;
}

async function createBroadcastMessage(characterName: string = 'c3po') {
    try {
        console.log(`\n🔊 BROADCAST MESSAGE CREATION STARTING 🔊`);
        console.log(`====================================`);
        console.log(`Process ID: ${process.pid}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`Character: ${characterName}`);
        console.log(`====================================\n`);

        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        console.log('📂 Looking for character settings at:', characterPath);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        console.log('✅ Successfully loaded character settings');

        // Set the Anthropic API key from character settings
        if (characterSettings.settings?.secrets?.ANTHROPIC_API_KEY) {
            process.env.ANTHROPIC_API_KEY = characterSettings.settings.secrets.ANTHROPIC_API_KEY;
            console.log('✅ Successfully set Anthropic API key from character settings');
        }

        // Get next document to broadcast
        const document = getNextUnbroadcastDocument();
        if (!document) {
            console.log('❌ No documents to broadcast');
            return [];
        }

        const documentContent = JSON.parse(document.content);
        const broadcastId = crypto.randomUUID();

        // Use the character's broadcast prompt
        const broadcastPrompt = characterSettings.settings?.broadcastPrompt ||
            'Create a focused message (under 280 characters) about the key insight from this content. Be specific about what was learned, why it matters, and what it suggests.';

        const prompt = `${broadcastPrompt.replace('[BROADCAST_REQUEST:id]', `[BROADCAST_REQUEST:${broadcastId}]`)}

Content to analyze:
${documentContent.text}

Source: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}`;

        // Let Claude generate the message directly
        const anthropic = new Anthropic({
            apiKey: characterSettings.settings?.secrets?.ANTHROPIC_API_KEY
        });

        const response = await anthropic.messages.create({
            model: "claude-3-sonnet-20240229",
            max_tokens: 1024,
            temperature: 0.3,
            messages: [{ role: "user", content: prompt }]
        });

        // Handle the response content type correctly
        const content = response.content[0];
        const summary = content.type === 'text' ? content.text : '';

        // Extract the broadcast message if using the ID format
        const broadcastMatch = summary.match(/\[BROADCAST:.*?\](.*?)(?=\[|$)/s);
        const cleanSummary = (broadcastMatch ? broadcastMatch[1] : summary).trim();

        // Generate platform-specific messages
        const platformMessages = await generatePlatformMessages(cleanSummary, documentContent.metadata);

        // Save to memories and record broadcast
        const messageIds = await savePlatformMessages(platformMessages);
        await recordBroadcast(document.id, messageIds);

        console.log('Successfully created broadcast:', {
            documentId: document.id,
            messageIds,
            telegramLength: platformMessages.telegram?.text.length,
            twitterLength: platformMessages.twitter?.text.length
        });

        return [{
            text: platformMessages.telegram?.text || platformMessages.twitter?.text || '',
            type: 'broadcast',
            metadata: {
                messageType: 'broadcast',
                status: 'pending',
                sourceMemoryId: document.id,
                platforms: {
                    telegram: messageIds.telegramId ? { status: 'pending' } : undefined,
                    twitter: messageIds.twitterId ? { status: 'pending' } : undefined
                }
            }
        }];
    } catch (error) {
        console.error("\n❌ ERROR IN BROADCAST MESSAGE CREATION ❌");
        console.error("==========================================");
        console.error("Process ID:", process.pid);
        console.error("Timestamp:", new Date().toISOString());
        console.error("Error:", error instanceof Error ? error.message : 'Unknown error');
        console.error("Stack:", error instanceof Error ? error.stack : 'No stack trace');
        console.error("==========================================\n");
        throw error;
    }
}

// Helper function to calculate cosine similarity between embeddings
function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    const dotProduct = embedding1.reduce((sum, a, i) => sum + a * embedding2[i], 0);
    const norm1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
    const norm2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));
    return dotProduct / (norm1 * norm2);
}

// Get character name from command line arguments
const characterName = process.argv[2] || 'c3po';
createBroadcastMessage(characterName).catch(console.error);