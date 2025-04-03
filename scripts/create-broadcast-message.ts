// @ts-check
/* tsconfig options */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelClass, ModelProviderName } from "@elizaos/core";

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
        client TEXT NOT NULL,
        message_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sent_at INTEGER,
        createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
        FOREIGN KEY (documentId) REFERENCES memories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_client ON broadcasts(client);
    CREATE INDEX IF NOT EXISTS idx_broadcasts_document_id ON broadcasts(documentId);
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

    if (doc) {
        const content = JSON.parse(doc.content);
        console.log('\nDocument found:', {
            id: doc.id,
            createdAt: new Date(doc.createdAt).toISOString(),
            title: content.metadata?.frontmatter?.title || 'No title',
            source: content.metadata?.frontmatter?.source || 'Unknown'
        });
    } else {
        console.log('No unbroadcast documents found');
    }

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
        console.log(`Character: ${characterName}`);

        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Set the Anthropic API key from character settings
        if (characterSettings.settings?.secrets?.ANTHROPIC_API_KEY) {
            process.env.ANTHROPIC_API_KEY = characterSettings.settings.secrets.ANTHROPIC_API_KEY;
            // Find the newly created message in the memories table
            const broadcastMessage = db.prepare(`
                SELECT id
                FROM memories
                WHERE type = 'messages'
                AND json_extract(content, '$.text') LIKE ?
                ORDER BY createdAt DESC
                LIMIT 1
            `).get(`%${validMessage.text}%`) as BroadcastMessage;

            if (!broadcastMessage) {
                throw new Error("Could not find broadcast message in memories table");
            }

            await recordBroadcast(document.id, broadcastMessage.id, 'telegram');
            await recordBroadcast(document.id, broadcastMessage.id, 'twitter');
            return data;
        } else {
            console.error("\nERROR: No valid message text found in response");
            console.error("Response data:", JSON.stringify(data, null, 2));
            throw new Error("No valid message text in response");
        }
    } else {
        console.error("\nERROR: Invalid or empty response from agent");
        console.error("Response data:", JSON.stringify(data, null, 2));
        throw new Error("Invalid or empty response from agent");
    }
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
        const sourceUrl = documentContent.metadata?.frontmatter?.source ||
                         documentContent.metadata?.source ||
                         documentContent.source ||
                         documentContent.metadata?.url;

        // Create runtime for text generation
        const runtime = {
            modelProvider: characterSettings.modelProvider || ModelProviderName.ANTHROPIC,
            getSetting: (key: string): string | null => {
                if (key === "ANTHROPIC_API_KEY") {
                    return characterSettings.settings?.secrets?.ANTHROPIC_API_KEY || null;
                }
                // Only return known settings
                switch(key) {
                    case "maxInputTokens":
                    case "maxOutputTokens":
                    case "temperature":
                    case "maxPromptTokens":
                        return characterSettings.settings?.[key]?.toString() || null;
                    default:
                        return null;
                }
            }
        };

        // Client-specific broadcast generation
        const broadcasts = [];
        const clients = ['telegram', 'twitter'] as const;

        for (const client of clients) {
            const maxLength = client === 'telegram' ? 1000 : 250;
            const broadcastId = crypto.randomUUID();

            // Use character's broadcast prompt if available, otherwise fallback to default
            const basePrompt = characterSettings.settings?.broadcastPrompt ||
                `Create a single focused message about what you learned from this content. Be specific about the insight, why it matters, and what it suggests.`;

            const prompt = `${basePrompt}

Content to analyze:
${documentContent.text}

Additional requirements:
- Message must be exactly ${maxLength} characters${client === 'telegram' ? '\n- You may include more detail and context' : ''}
- If a source is available, include it at the end in brackets: ${sourceUrl || 'no source available'}

[BROADCAST_REQUEST:${broadcastId}]`;

            const broadcastText = await generateText({
                runtime: runtime as any,
                context: prompt,
                modelClass: ModelClass.SMALL,
                maxSteps: 1
            });

            // Extract the actual broadcast message from between the tags if present
            const messageMatch = broadcastText.match(/\[BROADCAST:.*?\](.*?)(?=\[|$)/s);
            const finalText = messageMatch ? messageMatch[1].trim() : broadcastText.trim();

            const messageId = await saveMessageToMemories(finalText);
            await recordBroadcast(document.id, messageId, client);

            broadcasts.push({
                text: finalText,
                type: 'broadcast',
                metadata: {
                    messageType: 'broadcast',
                    status: 'pending',
                    sourceMemoryId: document.id,
                    client,
                    broadcastId
                }
            });

            console.log(`Successfully created ${client} broadcast:`, {
                documentId: document.id,
                client,
                length: finalText.length,
                text: finalText,
                broadcastId
            });
        }

        return broadcasts;
    } catch (error) {
        console.error("❌ ERROR:", error);
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