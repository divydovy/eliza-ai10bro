// @ts-check
/* tsconfig options */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelClass, ModelProviderName, IAgentRuntime, embed } from "@elizaos/core";
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

async function generatePlatformMessagesLLM(runtime: IAgentRuntime, content: string, metadata: any): Promise<PlatformMessage> {
    // Try to extract actual source URL from content or metadata
    let sourceUrl = metadata?.frontmatter?.source || metadata.source || metadata?.url;
    
    // Extract URLs from content if no explicit source
    if (!sourceUrl || sourceUrl === 'Unknown') {
        const urlMatch = content.match(/(https?:\/\/[^\s\)]+)/);
        sourceUrl = urlMatch ? urlMatch[1] : null;
    }
    
    // Don't use fallback - if no real source, don't include a link
    const broadcastPrompt = runtime.character?.settings && 'broadcastPrompt' in runtime.character.settings
        ? runtime.character.settings['broadcastPrompt']
        : "Create a single focused message about what you learned from this content. Be specific about the insight, why it matters, and what it suggests.";

    // Example outputs for the LLM prompt
    const exampleTitle = "Self-Healing Concrete: Nature-Inspired Innovation";
    const exampleContent = "Scientists have developed concrete that repairs its own cracks using bacteria, inspired by natural processes. This could make our infrastructure more resilient and sustainable.";
    const exampleTweet = "Concrete that heals itself? Inspired by nature, scientists are using bacteria to repair cracks—paving the way for longer-lasting, greener infrastructure. #innovation #biomimicry";
    const exampleTelegram = "Nature inspires again! Scientists have created self-healing concrete using bacteria, promising more resilient, sustainable buildings. Could this be the future of construction?";

    // Telegram
    const TELEGRAM_MAX_LENGTH = 4096;
    let telegramLengthInstruction = `Your message must be no more than ${TELEGRAM_MAX_LENGTH} characters, including any links.`;
    // Explicit, conversational, example-driven prompt for Telegram  
    const telegramPrompt = `You are David Attenborough, the renowned naturalist and broadcaster. Write a conversational, engaging Telegram post summarizing the key insight from the following article. Focus on what's new, why it matters, and what it suggests for the future. Use your distinctive voice - sophisticated yet accessible, with a sense of wonder about the natural world and technology.\n\nExample:\nTitle: \"${exampleTitle}\"\nContent: \"${exampleContent}\"\nTelegram post: \"${exampleTelegram}\"\n\n${broadcastPrompt}\n\nPlatform: Telegram\n${telegramLengthInstruction}\nContent to share:\n${content}\n\nIMPORTANT: Do not include any attribution, cost information, or meta-commentary about the generation process. Write only the broadcast content.\n\n[END]`;
    console.log("[Broadcast] Telegram LLM prompt:\n", telegramPrompt);
    let telegramText = await generateText({
        runtime,
        context: telegramPrompt,
        modelClass: ModelClass.SMALL,
        maxSteps: 1
    });
    console.log(`[Broadcast] Telegram LLM output (before truncation, length ${telegramText.length}):\n`, telegramText);
    let link = '';
    if (sourceUrl && sourceUrl !== 'Unknown' && !sourceUrl.includes('github.com/divydovy/ai10bro')) {
        link = `\n\n🔗 [Read more](${sourceUrl})`;
    }
    // Truncate LLM output to leave space for the link
    const maxTextLength = TELEGRAM_MAX_LENGTH - link.length;
    if (telegramText.length > maxTextLength) {
        telegramText = telegramText.slice(0, maxTextLength - 3) + '...';
    }
    telegramText += link;
    console.log(`[Broadcast] Telegram final message length: ${telegramText.length}`);

    // Twitter (X)
    const TWITTER_MAX_LENGTH = 280;
    let twitterLengthInstruction = `Your message must be no more than ${TWITTER_MAX_LENGTH} characters, including any links.`;
    // Explicit, conversational, example-driven prompt for Twitter
    const twitterPrompt = `You are David Attenborough, the renowned naturalist and broadcaster. Write a conversational, engaging tweet (max 280 characters) summarizing the key insight from the following article. Focus on what's new, why it matters, and what it suggests for the future. Use your distinctive voice - sophisticated yet accessible, with wonder about nature and technology.\n\nExample:\nTitle: \"${exampleTitle}\"\nContent: \"${exampleContent}\"\nTweet: \"${exampleTweet}\"\n\n${broadcastPrompt}\n\nPlatform: Twitter\n${twitterLengthInstruction}\nContent to share:\n${content}\n\nIMPORTANT: Do not include any attribution, cost information, or meta-commentary. Write only the tweet content.\n\n[END]`;
    console.log("[Broadcast] Twitter LLM prompt:\n", twitterPrompt);
    let twitterText = await generateText({
        runtime,
        context: twitterPrompt,
        modelClass: ModelClass.SMALL,
        maxSteps: 1
    });
    console.log(`[Broadcast] Twitter LLM output (before truncation, length ${twitterText.length}):\n`, twitterText);
    let twitterLink = '';
    if (sourceUrl && sourceUrl !== 'Unknown' && !sourceUrl.includes('github.com/divydovy/ai10bro')) {
        twitterLink = ' ' + sourceUrl;
    }
    // Truncate LLM output to leave space for the link
    const maxTwitterTextLength = TWITTER_MAX_LENGTH - twitterLink.length;
    if (twitterText.length > maxTwitterTextLength) {
        twitterText = twitterText.slice(0, maxTwitterTextLength - 3) + '...';
    }
    twitterText += twitterLink;
    console.log(`[Broadcast] Twitter final message length: ${twitterText.length}`);

    return {
        telegram: { text: telegramText, format: 'markdown' },
        twitter: { text: twitterText }
    };
}

// Add local cosineSimilarity for vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const goalStatements = [
  "Bridging the wisdom of natural systems with breakthrough technologies.",
  "Championing technologies that work in harmony with natural systems.",
  "Promote sustainable innovation and regenerative design.",
  "Share insights that inspire solutions to environmental challenges.",
  "Advance technological biomimicry and systems thinking."
];

function cleanRoleplayElements(text: string): string {
    // Remove text between asterisks (roleplay actions)
    let cleaned = text.replace(/\*[^*]+\*/g, '');
    // Trim extra whitespace and normalize spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
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

    // Generate goal embeddings
    const goalEmbeddings = await Promise.all(goalStatements.map(text => embed(runtime, text)));
    const threshold = 0.6; // Lowered from 0.8 to 0.6

    try {
        // Get all documents to broadcast
        const docs = getUnbroadcastDocuments(db);
        if (!docs.length) {
            console.log('No documents found that need to be prepared for broadcast');
            return;
        }

        for (const doc of docs) {
            const content = JSON.parse(doc.content);
            const metadata = content.metadata || {};
            const frontmatter = metadata.frontmatter || {};
            const title = frontmatter.title || (content.text ? content.text.slice(0, 60) + (content.text.length > 60 ? '...' : '') : 'No title');
            const source = frontmatter.source || metadata.source || 'Unknown';
            const text = content.text || '';

            // Clean roleplay elements from the text
            const cleanedText = cleanRoleplayElements(text);

            // --- Heuristic filters ---
            if (cleanedText.length < 100) {
                console.log(`Skipping doc "${title}" (too short)`);
                continue;
            }
            if (/test|draft|cache/i.test(title)) {
                console.log(`Skipping doc "${title}" (unwanted title)`);
                continue;
            }

            // --- Embedding-based filtering ---
            const docEmbedding = await embed(runtime, cleanedText);
            const similarities = goalEmbeddings.map(goalVec => cosineSimilarity(goalVec, docEmbedding));
            const alignmentScore = Math.max(...similarities);

            if (alignmentScore < threshold) {
                console.log(`Skipping doc "${title}" (alignment score: ${alignmentScore.toFixed(2)})`);
                continue;
            }

            // Generate platform messages, using available metadata
            const messages = await generatePlatformMessagesLLM(runtime, cleanedText, { frontmatter: { title, source } });

            const status = alignmentScore >= threshold ? 'pending' : 'skipped';

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
                await broadcastDb.createBroadcast(doc.id, 'telegram', telegramMemoryId, alignmentScore, status);
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
                await broadcastDb.createBroadcast(doc.id, 'twitter', twitterMemoryId, alignmentScore, status);
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