// @ts-check
/* tsconfig options */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelClass, ModelProviderName, IAgentRuntime } from "@elizaos/core";
import { BroadcastDB } from "../db/operations";
import { initializeBroadcastSchema } from "../db/schema";
import { BroadcastClient } from "../types";

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

export async function createBroadcastMessage(runtime: IAgentRuntime, characterName: string = 'c3po'): Promise<void> {
    console.log('Starting broadcast message creation...');

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

        for (const doc of docs) {
            const content = JSON.parse(doc.content);
            // Use frontmatter if it exists, otherwise fallback
            const metadata = content.metadata || {};
            const frontmatter = metadata.frontmatter || {};
            const title = frontmatter.title || 'No title';
            const source = frontmatter.source || metadata.source || 'Unknown';
            const text = content.text || '';

            // Generate platform messages, using available metadata
            const messages = await generatePlatformMessages(text, { frontmatter: { title, source } });

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
                    telegramMemory.id,
                    telegramMemory.content,
                    telegramMemory.createdAt,
                    JSON.stringify(zeroEmbedding)
                  );
                await broadcastDb.createBroadcast(doc.id, 'telegram', telegramMemoryId);
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
                    twitterMemory.id,
                    twitterMemory.content,
                    twitterMemory.createdAt,
                    JSON.stringify(zeroEmbedding)
                  );
                await broadcastDb.createBroadcast(doc.id, 'twitter', twitterMemoryId);
            }

            console.log(`Successfully created broadcast messages for document: ${doc.id} (title: ${title})`);
        }
    } catch (error) {
        console.error('Error creating broadcast message:', error);
        throw error;
    } finally {
        db.close();
    }
}