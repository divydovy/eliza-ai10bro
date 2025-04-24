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

function getNextUnbroadcastDocument(db: ReturnType<typeof Database>): DatabaseMemory | undefined {
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
            AND (b.status = 'pending' OR b.status = 'sent')
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

export async function createBroadcastMessage(runtime: IAgentRuntime, characterName: string = 'c3po'): Promise<void> {
    console.log('Starting broadcast message creation...');

    // Get database path from runtime settings or use default
    const dbPath = runtime.getSetting('database.path') || path.join(process.cwd(), 'data', 'db.sqlite');
    console.log('Database path:', dbPath);
    const db = new Database(dbPath);
    console.log('Successfully connected to database');

    // Initialize broadcast DB
    const broadcastDb = new BroadcastDB(db);

    try {
        // Get next document to broadcast
        const doc = getNextUnbroadcastDocument(db);
        if (!doc) {
            console.log('No documents to broadcast');
            return;
        }

        const content = JSON.parse(doc.content);
        const messages = await generatePlatformMessages(content.text, content.metadata);

        // Create broadcast records
        if (messages.telegram) {
            await broadcastDb.createBroadcast(doc.id, 'telegram', messages.telegram.text);
        }
        if (messages.twitter) {
            await broadcastDb.createBroadcast(doc.id, 'twitter', messages.twitter.text);
        }

        console.log('Successfully created broadcast messages');
    } catch (error) {
        console.error('Error creating broadcast message:', error);
        throw error;
    } finally {
        db.close();
    }
}