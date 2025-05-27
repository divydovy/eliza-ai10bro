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

function getUnbroadcastDocuments(db: ReturnType<typeof Database>, batchSize: number = 5): DatabaseMemory[] {
    // Get documents that haven't been broadcast, up to the batch size
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
        LIMIT ?
    `).all(batchSize) as DatabaseMemory[];
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
    let twitterLengthInstruction = `Your message must be no more than ${TWITTER_MAX_LENGTH - 23} characters for the text content (URLs count as 23 characters regardless of length). Always include the source URL at the end of your message.`;
    // Explicit, conversational, example-driven prompt for Twitter
    const twitterPrompt = `You are an expert science communicator. Write a conversational, engaging tweet summarizing the key insight from the following article. Do not just repeat the title or metadata. Focus on what's new, why it matters, and what it suggests for the future. Always include the source URL at the end of your message. Your message text (excluding the URL) must be no more than ${TWITTER_MAX_LENGTH - 23} characters. Do not include any meta-instructions, character counts, or phrases like 'Here is a tweet'. Only return the final message as it should appear to the user. Always write the message in English, regardless of the source content language. If the source content is not in English, translate and summarize it in English. Never return the message in any language other than English.\n\nExample:\nTitle: "${exampleTitle}"\nContent: "${exampleContent}"\nTweet: "${exampleTweet}"\n\n${broadcastPrompt}\n\nPlatform: Twitter\n${twitterLengthInstruction}\nContent to share:\n${contentWithSource}\n\n[END]`;
    console.log("[Broadcast] Twitter LLM prompt:\n", twitterPrompt);
    let twitterText = await generateText({
        runtime,
        context: twitterPrompt,
        modelClass: ModelClass.SMALL,
        maxSteps: 1
    });
    // Strip [END] from the end if present and remove any timestamp prefix
    twitterText = twitterText.replace(/\[END\]\s*$/, '').replace(/^\[BROADCAST:\d+\]\s*/, '').trim();
    console.log(`[Broadcast] Twitter LLM output (before truncation, length ${twitterText.length}):\n`, twitterText);

    // Extract URL if present
    const urlMatch = twitterText.match(/(https?:\/\/[^\s]+)$/);
    const url = urlMatch ? urlMatch[0] : '';
    const textWithoutUrl = urlMatch ? twitterText.slice(0, urlMatch.index).trim() : twitterText;

    // Truncate text if needed, preserving URL
    if (textWithoutUrl.length > TWITTER_MAX_LENGTH - 23) {
        twitterText = textWithoutUrl.slice(0, TWITTER_MAX_LENGTH - 26) + '... ' + url;
    } else if (url) {
        twitterText = textWithoutUrl + ' ' + url;
    }

    // Final length check to ensure we're under the limit
    if (twitterText.length > TWITTER_MAX_LENGTH) {
        const maxTextLength = TWITTER_MAX_LENGTH - 23 - 4; // 23 for URL, 4 for "... "
        twitterText = textWithoutUrl.slice(0, maxTextLength) + '... ' + url;
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
  "Advancing synthetic biology and bioengineering innovations.",
  "Exploring the intersection of biology and manufacturing.",
  "Developing sustainable bio-based production methods.",
  "Harnessing cellular and molecular engineering for novel applications.",
  "Creating bio-inspired and bio-integrated technologies.",
  "Pioneering generative biology and programmable living systems.",
  "Building the future of bio-manufacturing and cellular factories.",
  "Engineering biological systems for sustainable solutions.",
  "Discovering how AI and bioengineering can amplify nature's resilience.",
  "Creating frameworks for evaluating technology through ecological lenses.",
  "Leading the convergence of natural wisdom and technological advancement.",
  "Developing biomimetic solutions for environmental challenges.",
  "Building investment ecosystems that mirror nature's resource allocation.",
  "Fostering technological solutions that support Earth's living systems.",
  "Advancing circular, waste-free processes inspired by nature.",
  "Developing sustainable alternatives to traditional materials.",
  "Creating circular economy solutions for material waste.",
  "Advancing bio-based materials and biodegradable alternatives.",
  "Building sustainable supply chains for green materials.",
  "Pioneering innovations in sustainable packaging and products."
];

// Add content filters
const excludedTopics = [
  'strike', 'union', 'labor', 'industrial action', 'protest',
  'politics', 'election', 'campaign', 'policy', 'government'
];

function isEnglishText(text: string): boolean {
  // Simple heuristic: check if text contains mostly ASCII characters
  const asciiChars = text.replace(/[^a-zA-Z0-9\s.,!?-]/g, '').length;
  return asciiChars / text.length > 0.8;
}

function containsExcludedTopics(text: string): boolean {
  const lowerText = text.toLowerCase();
  return excludedTopics.some(topic => lowerText.includes(topic));
}

function cleanRoleplayElements(text: string): string {
    // Remove text between asterisks (roleplay actions)
    let cleaned = text.replace(/\*[^*]+\*/g, '');
    // Trim extra whitespace and normalize spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

export async function createBroadcastMessage(runtime: IAgentRuntime, characterName: string = 'c3po'): Promise<void> {
    console.log('\n[Broadcast] Starting broadcast message creation...');

    // Get database path from runtime settings or use default
    const dbPath = runtime.getSetting('database.path') || path.join(process.cwd(), 'data', 'db.sqlite');
    console.log('[Broadcast] Database path:', dbPath);
    const db = new Database(dbPath);
    console.log('[Broadcast] Successfully connected to database');

    const broadcastDb = new BroadcastDB(db);

    try {
        // Get multiple unbroadcast documents
        const documents = getUnbroadcastDocuments(db, 5);
        console.log(`[Broadcast] Found ${documents.length} documents to process`);

        if (documents.length === 0) {
            console.log('[Broadcast] No new documents to broadcast');
            return;
        }

        for (const doc of documents) {
            console.log(`\n[Broadcast] Processing document ${doc.id}`);
            const content = JSON.parse(doc.content);
            const metadata = content.metadata || {};
            const frontmatter = metadata.frontmatter || {};
            const title = frontmatter.title || (content.text ? content.text.slice(0, 60) + (content.text.length > 60 ? '...' : '') : 'No title');
            const source = frontmatter.source || metadata.source || 'Unknown';
            const text = content.text || '';

            console.log(`Processing document: "${title}"`);
            console.log(`Source: ${source}`);

            // Clean roleplay elements from the text
            const cleanedText = cleanRoleplayElements(text);
            console.log(`Cleaned text length: ${cleanedText.length} characters`);

            // --- Heuristic filters ---
            if (cleanedText.length < 100) {
                console.log(`Skipping doc "${title}" (too short)`);
                continue;
            }
            if (/test|draft|cache/i.test(title)) {
                console.log(`Skipping doc "${title}" (unwanted title)`);
                continue;
            }
            if (!isEnglishText(cleanedText)) {
                console.log(`Skipping doc "${title}" (not English text)`);
                continue;
            }
            if (containsExcludedTopics(cleanedText)) {
                console.log(`Skipping doc "${title}" (contains excluded topics)`);
                continue;
            }

            // Generate a summary of the document
            console.log('Generating document summary...');
            const summaryPrompt = `Please provide a concise summary of the following content, focusing on the key insights and their relevance to sustainable innovation and natural systems. If the content is not primarily about technology, innovation, sustainability, or natural systems, respond with "NOT_RELEVANT".\n\n${cleanedText}\n\nSummary:`;
            const summary = await generateText({
                runtime,
                context: summaryPrompt,
                modelClass: ModelClass.SMALL,
                maxSteps: 1
            });
            console.log('Summary generated');

            if (summary.trim() === 'NOT_RELEVANT') {
                console.log(`Skipping doc "${title}" (content not relevant to our focus areas)`);
                continue;
            }

            // Calculate alignment score using the summary
            console.log('Calculating alignment score...');
            const summaryEmbedding = await embed(runtime, summary);
            const goalEmbeddings = await Promise.all(goalStatements.map(text => embed(runtime, text)));
            const similarities = goalEmbeddings.map(goalVec => cosineSimilarity(goalVec, summaryEmbedding));
            let alignmentScore = Math.max(...similarities);

            // Define threshold before analysis
            const threshold = 0.65; // Lowered threshold to allow more relevant content

            // Apply source-based weighting
            const isObsidian = source.toLowerCase().includes('obsidian');
            const sourceWeight = isObsidian ? 1.2 : 1.0;
            const originalScore = alignmentScore;
            alignmentScore = Math.min(1.0, alignmentScore * sourceWeight);

            // Detailed analysis logging
            console.log('\n[Broadcast] Alignment Score Analysis:');
            console.log(`Source: ${source}`);
            console.log(`Is Obsidian: ${isObsidian}`);
            console.log(`Original score: ${originalScore.toFixed(3)}`);
            console.log(`Source weight: ${sourceWeight}`);
            console.log(`Final score: ${alignmentScore.toFixed(3)}`);
            console.log(`Score boost: ${((sourceWeight - 1) * 100).toFixed(0)}%`);
            console.log(`Would pass threshold (${threshold}): ${alignmentScore >= threshold ? 'Yes' : 'No'}`);

            // Log top 3 most relevant goal statements
            const sortedSimilarities = similarities
                .map((score, index) => ({ score, statement: goalStatements[index] }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            console.log('\nTop 3 most relevant goal statements:');
            sortedSimilarities.forEach(({ score, statement }, index) => {
                console.log(`${index + 1}. Score: ${score.toFixed(3)} - "${statement}"`);
            });
            console.log(''); // Add blank line for readability

            if (alignmentScore < threshold) {
                console.log(`Skipping doc "${title}" (alignment score: ${alignmentScore.toFixed(2)} below threshold ${threshold})`);
                continue;
            }

            console.log(`Found suitable document: "${title}" (alignment score: ${alignmentScore.toFixed(2)})`);

            // Generate platform messages, using available metadata
            console.log('Generating platform messages...');
            const messages = await generatePlatformMessagesLLM(runtime, cleanedText, { frontmatter: { title, source } });
            console.log('Platform messages generated');

            // --- Log broadcast messages to a file for debugging ---
            const logPath = path.resolve(process.cwd(), 'broadcast-message-log.txt');
            const timestamp = new Date().toISOString();
            if (messages.telegram) {
                fs.appendFileSync(logPath, `\n[${timestamp}] Document: ${doc.id} | Platform: Telegram\n${messages.telegram.text}\n`);
                console.log('Telegram message logged');
            }
            if (messages.twitter) {
                fs.appendFileSync(logPath, `\n[${timestamp}] Document: ${doc.id} | Platform: Twitter\n${messages.twitter.text}\n`);
                console.log('Twitter message logged');
            }
            // --- End log ---

            const status = 'pending';

            // For each platform, create a memory and broadcast record
            if (messages.telegram) {
                console.log('Creating Telegram broadcast...');
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
                console.log('Telegram broadcast created');
            }
            if (messages.twitter) {
                console.log('Creating Twitter broadcast...');
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
                console.log('Twitter broadcast created');
            }

            console.log(`Successfully created broadcast messages for document: ${doc.id} (title: ${title})`);
        }
    } catch (error) {
        console.error('[Broadcast] Error creating broadcast messages:', error);
        throw error;
    } finally {
        db.close();
    }
}

export async function analyzeObsidianBatch(runtime: IAgentRuntime, batchSize: number = 10): Promise<void> {
    console.log('\n[Broadcast] Starting Obsidian batch analysis...');

    // Get database path from runtime settings or use default
    const dbPath = runtime.getSetting('database.path') || path.join(process.cwd(), 'data', 'db.sqlite');
    console.log('[Broadcast] Database path:', dbPath);
    const db = new Database(dbPath);
    console.log('[Broadcast] Successfully connected to database');

    try {
        // Get Obsidian documents that haven't been broadcast
        const documents = db.prepare(`
            SELECT m.*
            FROM memories m
            WHERE m.type = 'documents'
            AND json_valid(m.content)
            AND json_extract(m.content, '$.metadata.source') LIKE '%obsidian%'
            AND NOT EXISTS (
                SELECT 1 FROM broadcasts b
                WHERE b.documentId = m.id
                AND (b.status = 'pending' OR b.status = 'sent')
            )
            ORDER BY createdAt DESC
            LIMIT ?
        `).all(batchSize) as DatabaseMemory[];

        console.log(`\n[Broadcast] Found ${documents.length} Obsidian documents to analyze`);

        if (documents.length === 0) {
            console.log('[Broadcast] No Obsidian documents to analyze');
            return;
        }

        // Process each document
        for (const doc of documents) {
            console.log('\n' + '='.repeat(80));
            const content = JSON.parse(doc.content);
            const metadata = content.metadata || {};
            const frontmatter = metadata.frontmatter || {};
            const title = frontmatter.title || (content.text ? content.text.slice(0, 60) + (content.text.length > 60 ? '...' : '') : 'No title');
            const source = frontmatter.source || metadata.source || 'Unknown';
            const text = content.text || '';

            console.log(`\n[Broadcast] Analyzing document: "${title}"`);
            console.log(`Source: ${source}`);

            // Clean roleplay elements from the text
            const cleanedText = cleanRoleplayElements(text);

            // Generate a summary
            const summaryPrompt = `Please provide a concise summary of the following content, focusing on the key insights and their relevance to sustainable innovation and natural systems. If the content is not primarily about technology, innovation, sustainability, or natural systems, respond with "NOT_RELEVANT".\n\n${cleanedText}\n\nSummary:`;
            const summary = await generateText({
                runtime,
                context: summaryPrompt,
                modelClass: ModelClass.SMALL,
                maxSteps: 1
            });

            if (summary.trim() === 'NOT_RELEVANT') {
                console.log(`[Broadcast] Content not relevant to our focus areas`);
                continue;
            }

            // Calculate alignment score
            const summaryEmbedding = await embed(runtime, summary);
            const goalEmbeddings = await Promise.all(goalStatements.map(text => embed(runtime, text)));
            const similarities = goalEmbeddings.map(goalVec => cosineSimilarity(goalVec, summaryEmbedding));
            let alignmentScore = Math.max(...similarities);

            // Define threshold
            const threshold = 0.65;

            // Apply source-based weighting
            const isObsidian = source.toLowerCase().includes('obsidian');
            const sourceWeight = isObsidian ? 1.2 : 1.0;
            const originalScore = alignmentScore;
            alignmentScore = Math.min(1.0, alignmentScore * sourceWeight);

            // Detailed analysis logging
            console.log('\n[Broadcast] Alignment Score Analysis:');
            console.log(`Source: ${source}`);
            console.log(`Is Obsidian: ${isObsidian}`);
            console.log(`Original score: ${originalScore.toFixed(3)}`);
            console.log(`Source weight: ${sourceWeight}`);
            console.log(`Final score: ${alignmentScore.toFixed(3)}`);
            console.log(`Score boost: ${((sourceWeight - 1) * 100).toFixed(0)}%`);
            console.log(`Would pass threshold (${threshold}): ${alignmentScore >= threshold ? 'Yes' : 'No'}`);

            // Log top 3 most relevant goal statements
            const sortedSimilarities = similarities
                .map((score, index) => ({ score, statement: goalStatements[index] }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            console.log('\nTop 3 most relevant goal statements:');
            sortedSimilarities.forEach(({ score, statement }, index) => {
                console.log(`${index + 1}. Score: ${score.toFixed(3)} - "${statement}"`);
            });
            console.log(''); // Add blank line for readability
        }
    } catch (error) {
        console.error('[Broadcast] Error analyzing Obsidian batch:', error);
        throw error;
    } finally {
        db.close();
    }
}