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
    doc_embedding?: string;
    goal_embedding?: string;
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
    // Get the oldest document that hasn't been broadcast
    return db.prepare(`
        SELECT m.*
        FROM memories m
        WHERE m.type = 'documents'
        AND json_valid(m.content)
        AND json_extract(m.content, '$.text') NOT LIKE '%This is a test document%'
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m.id
            AND (b.status = 'pending' OR b.status = 'sent')
        )
        ORDER BY createdAt ASC
        LIMIT 1
    `).all() as DatabaseMemory[];
}

async function generatePlatformMessagesLLM(runtime: IAgentRuntime, content: string, metadata: any): Promise<PlatformMessage> {
    const sourceUrl = metadata?.frontmatter?.source || metadata.source || 'Unknown';
    const broadcastPrompt = runtime.character?.settings && 'broadcastPrompt' in runtime.character.settings
        ? runtime.character.settings['broadcastPrompt']
        : "Create a single focused message about what you learned from this content. Be specific about the insight, why it matters, and what it suggests.";

    // Example outputs for the LLM prompt
    const exampleTitle = "Self-Healing Concrete: Nature-Inspired Innovation";
    const exampleContent = "Scientists have developed concrete that repairs its own cracks using bacteria, inspired by natural processes. This could make our infrastructure more resilient and sustainable.";
    const exampleTweet = "Concrete that heals itself? Inspired by nature, scientists are using bacteria to repair cracks—paving the way for longer-lasting, greener infrastructure. #innovation #biomimicry";
    const exampleTelegram = "Nature inspires again! Scientists have created self-healing concrete using bacteria, promising more resilient, sustainable buildings. Could this be the future of construction?";

    // Add source URL to content if available
    const contentWithSource = sourceUrl !== 'Unknown'
        ? `${content}\n\nSource: ${sourceUrl}`
        : content;

    // Telegram
    const TELEGRAM_MAX_LENGTH = 4096;
    let telegramLengthInstruction = `Your message must be no more than ${TELEGRAM_MAX_LENGTH} characters, including any links.`;
    // Explicit, conversational, example-driven prompt for Telegram
    const telegramPrompt = `You are an expert science communicator. Write a conversational, engaging Telegram post summarizing the key insight from the following article. Do not just repeat the title or metadata. Focus on what's new, why it matters, and what it suggests for the future. If you find a source URL or reference anywhere in the content, include it as a link at the end of your message. Do not include any meta-instructions, character counts, or phrases like 'Here is a Telegram post'. Only return the final message as it should appear to the user. Always write the message in English, regardless of the source content language. If the source content is not in English, translate and summarize it in English. Never return the message in any language other than English.\n\nExample:\nTitle: "${exampleTitle}"\nContent: "${exampleContent}"\nTelegram post: "${exampleTelegram}"\n\n${broadcastPrompt}\n\nPlatform: Telegram\n${telegramLengthInstruction}\nContent to share:\n${contentWithSource}\n\n[END]`;
    console.log("[Broadcast] Telegram LLM prompt:\n", telegramPrompt);
    let telegramText = await generateText({
        runtime,
        context: telegramPrompt,
        modelClass: ModelClass.SMALL,
        maxSteps: 1
    });
    // Strip [END] from the end if present
    telegramText = telegramText.replace(/\[END\]\s*$/, '').trim();
    console.log(`[Broadcast] Telegram LLM output (before truncation, length ${telegramText.length}):\n`, telegramText);
    // Truncate if needed
    if (telegramText.length > TELEGRAM_MAX_LENGTH) {
        telegramText = telegramText.slice(0, TELEGRAM_MAX_LENGTH - 3) + '...';
    }
    console.log(`[Broadcast] Telegram final message length: ${telegramText.length}`);

    // Twitter (X)
    const TWITTER_MAX_LENGTH = 280;
    let twitterLengthInstruction = `Your message must be no more than ${TWITTER_MAX_LENGTH} characters, including any links.`;
    // Explicit, conversational, example-driven prompt for Twitter
    const twitterPrompt = `You are an expert science communicator. Write a conversational, engaging tweet (max 280 characters) summarizing the key insight from the following article. Do not just repeat the title or metadata. Focus on what's new, why it matters, and what it suggests for the future. If you find a source URL or reference anywhere in the content, include it as a link at the end of your tweet. Do not include any meta-instructions, character counts, or phrases like 'Here is a tweet'. Only return the final message as it should appear to the user. Always write the message in English, regardless of the source content language. If the source content is not in English, translate and summarize it in English. Never return the message in any language other than English.\n\nExample:\nTitle: "${exampleTitle}"\nContent: "${exampleContent}"\nTweet: "${exampleTweet}"\n\n${broadcastPrompt}\n\nPlatform: Twitter\n${twitterLengthInstruction}\nContent to share:\n${contentWithSource}\n\n[END]`;
    console.log("[Broadcast] Twitter LLM prompt:\n", twitterPrompt);
    let twitterText = await generateText({
        runtime,
        context: twitterPrompt,
        modelClass: ModelClass.SMALL,
        maxSteps: 1
    });
    // Strip [END] from the end if present
    twitterText = twitterText.replace(/\[END\]\s*$/, '').trim();
    console.log(`[Broadcast] Twitter LLM output (before truncation, length ${twitterText.length}):\n`, twitterText);
    // Twitter counts URLs as 23 characters regardless of length
    if (twitterText.length > TWITTER_MAX_LENGTH) {
        twitterText = twitterText.slice(0, TWITTER_MAX_LENGTH - 3) + '...';
    }
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
    const threshold = 0.6;

    try {
        // Get documents to broadcast
        const docs = getUnbroadcastDocuments(db);
        if (!docs.length) {
            console.log('No documents found that need to be prepared for broadcast');
            return;
        }

        // Process the single document we found
        const doc = docs[0];
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
            return;
        }
        if (/test|draft|cache/i.test(title)) {
            console.log(`Skipping doc "${title}" (unwanted title)`);
            return;
        }

        // Generate a summary of the document
        const summaryPrompt = `Please provide a concise summary of the following content, focusing on the key insights and their relevance to sustainable innovation and natural systems:\n\n${cleanedText}\n\nSummary:`;
        const summary = await generateText({
            runtime,
            context: summaryPrompt,
            modelClass: ModelClass.SMALL,
            maxSteps: 1
        });

        // Calculate alignment score using the summary
        const summaryEmbedding = await embed(runtime, summary);
        const similarities = goalEmbeddings.map(goalVec => cosineSimilarity(goalVec, summaryEmbedding));
        const alignmentScore = Math.max(...similarities);

        if (alignmentScore < threshold) {
            console.log(`Skipping doc "${title}" (alignment score: ${alignmentScore.toFixed(2)})`);
            return;
        }

        console.log(`Found suitable document: "${title}" (alignment score: ${alignmentScore.toFixed(2)})`);

        // Generate platform messages, using available metadata
        const messages = await generatePlatformMessagesLLM(runtime, cleanedText, { frontmatter: { title, source } });

        // --- Log broadcast messages to a file for debugging ---
        const logPath = path.resolve(process.cwd(), 'broadcast-message-log.txt');
        const timestamp = new Date().toISOString();
        if (messages.telegram) {
            fs.appendFileSync(logPath, `\n[${timestamp}] Document: ${doc.id} | Platform: Telegram\n${messages.telegram.text}\n`);
        }
        if (messages.twitter) {
            fs.appendFileSync(logPath, `\n[${timestamp}] Document: ${doc.id} | Platform: Twitter\n${messages.twitter.text}\n`);
        }
        // --- End log ---

        const status = 'pending';

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
    } catch (error) {
        console.error('Error creating broadcast message:', error);
        throw error;
    } finally {
        db.close();
    }
}