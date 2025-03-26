// @ts-check
/* tsconfig options */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelProviderName, ModelClass, Character, embed } from "@elizaos/core";

console.log('Starting broadcast message creation...');

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
console.log('Database path:', dbPath);
const db = new Database(dbPath);
console.log('Successfully connected to database');

// Ensure broadcasts table exists
await db.exec(`
  CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    documentId TEXT NOT NULL,
    createdAt INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    messageId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (documentId) REFERENCES memories(id)
  );

  CREATE INDEX IF NOT EXISTS idx_broadcasts_documentid ON broadcasts(documentId);
  CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
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
    settings?: {
        broadcastPrompt?: string;
        secrets?: {
            ANTHROPIC_API_KEY?: string;
        };
        serverPort?: number;
    };
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

async function getNextUnbroadcastDocument(): Promise<DatabaseMemory | undefined> {
    console.log('\n=== Finding Next Document ===');

    // Find the oldest document that hasn't been broadcast yet and isn't already being processed
    const nextDocument = db.prepare(`
        SELECT m1.id, m1.content, m1.createdAt
        FROM memories m1
        WHERE m1.type = 'documents'
        AND json_extract(m1.content, '$.metadata.frontmatter.source') IS NOT NULL
        AND json_extract(m1.content, '$.text') NOT LIKE '%ACTION:%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%Instructions:%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%system%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%Response format%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%\`\`\`json%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%<sup>%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%###%'
        AND json_extract(m1.content, '$.metadata.action') IS NULL
        AND length(json_extract(m1.content, '$.text')) < 50000
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m1.id
            AND (b.status = 'pending' OR b.status = 'sent')
        )
        ORDER BY m1.createdAt ASC
        LIMIT 1
    `).get() as DatabaseMemory | undefined;

    if (nextDocument) {
        const content = JSON.parse(nextDocument.content);
        const text = content.text || '';
        const tokenCount = countTokens(text);

        console.log('\nDocument found:', {
            id: nextDocument.id,
            createdAt: new Date(nextDocument.createdAt).toISOString(),
            title: content.title || 'No title',
            textLength: text.length,
            tokenCount,
            hasMetadata: !!content.metadata,
            hasFrontmatter: !!content.metadata?.frontmatter,
            source: content.metadata?.frontmatter?.source || content.source || 'Unknown'
        });

        // Skip if token count is too high
        if (tokenCount > 100000) {
            console.log('Document token count too high, skipping');
            return undefined;
        }

        // Log first 200 chars of content to see what we're dealing with
        console.log('\nContent preview:', text.slice(0, 200) + '...');
    } else {
        console.log('No unbroadcast documents found');
    }

    return nextDocument;
}

async function saveMessageToMemories(text: string): Promise<string> {
    console.log('\nSaving message to memories...');
    const id = crypto.randomUUID();
    const content = JSON.stringify({
        text,
        type: 'broadcast',
        source: 'agent'
    });

    // Use the core utility function for zero embeddings
    const zeroEmbedding = getEmbeddingZeroVector();

    db.prepare(`
        INSERT INTO memories (id, type, content, createdAt, embedding)
        VALUES (?, 'messages', ?, unixepoch() * 1000, ?)
    `).run(id, content, JSON.stringify(zeroEmbedding));

    console.log('Successfully saved message to memories');
    return id;
}

async function recordBroadcast(documentId: string, messageId: string) {
    console.log('\nRecording broadcast in database...');
    const id = crypto.randomUUID();

    db.prepare(`
        INSERT INTO broadcasts (id, documentId, messageId)
        VALUES (?, ?, ?)
    `).run(id, documentId, messageId);

    console.log('Successfully recorded broadcast');
}

async function sendMessageToAgent(characterName: string, message: any, document: DatabaseMemory) {
    let serverUrl = process.env.AGENT_SERVER_URL;
    console.log('\nServer URL debug:', {
        fromEnv: process.env.AGENT_SERVER_URL,
        envVars: process.env
    });

    if (!serverUrl) {
        // Only use character settings if no AGENT_SERVER_URL is provided
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        const serverPort = characterSettings.settings?.serverPort || 3000;
        serverUrl = `http://localhost:${serverPort}`;
        console.log('\nUsing fallback server URL from character settings:', {
            serverPort,
            serverUrl
        });
    }

    console.log('\nFinal server URL configuration:', {
        serverUrl,
        characterName,
        messageType: message.type
    });

    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageLength: message.text.length,
        metadata: message.metadata,
        serverUrl
    });

    const response = await fetch(`${serverUrl}/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Message-Type': 'system',
            'X-Exclude-History': 'true'
        },
        body: JSON.stringify(message)
    });

    if (!response.ok) {
        const errorText = await response.text();
        let parsedError;
        try {
            parsedError = JSON.parse(errorText);
            // Extract just the essential error info
            const errorMessage = parsedError.error?.message || parsedError.message || 'Unknown error';
            const errorType = parsedError.error?.type || parsedError.type || 'error';
            console.error('\nAgent API Error:', {
                status: response.status,
                type: errorType,
                message: errorMessage.slice(0, 200) // Truncate long error messages
            });
        } catch {
            // If JSON parsing fails, just show truncated error text
            console.error('\nAgent API Error:', {
                status: response.status,
                text: errorText.slice(0, 200) + '...'
            });
        }
        throw new Error(`Agent API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    console.log('\nReceived response:', {
        status: response.status,
        responseLength: data.length,
        messages: data.map((msg: any) => ({
            textLength: msg.text?.length,
            type: msg.type,
            metadata: msg.metadata,
            messageId: msg.messageId,
            id: msg.id
        }))
    });

    if (data && Array.isArray(data) && data.length > 0) {
        console.log("\nBroadcast message created successfully");

        // Find the first valid message with text
        const validMessage = data.find(msg => msg && msg.text && msg.text.trim().length > 0);

        if (validMessage) {
            console.log("Message text:", validMessage.text);

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

            await recordBroadcast(document.id, broadcastMessage.id);
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

        // Get next document to broadcast
        const document = await getNextUnbroadcastDocument();
        if (!document) {
            console.log('❌ No documents to broadcast');
            return [];
        }

        const documentContent = JSON.parse(document.content);

        console.log('\n🔍 PROCESSING DOCUMENT');
        console.log('=====================');
        console.log('Document ID:', document.id);
        console.log('Initial content stats:', {
            totalLength: documentContent.text?.length || 0,
            estimatedTokens: countTokens(documentContent.text || ''),
            containsAction: documentContent.text?.includes('ACTION:'),
            containsInstructions: documentContent.text?.includes('Instructions:'),
            containsSystem: documentContent.text?.includes('system'),
            containsJson: documentContent.text?.includes('```json')
        });

        // Filter out action commands and system content from the text
        const cleanedText = documentContent.text
            .split('\n')
            .filter((line: string) => {
                const l = line.trim().toLowerCase();
                const keep = !l.startsWith('action:') &&
                       !l.startsWith('instructions:') &&
                       !l.includes('response format') &&
                       !l.includes('```json') &&
                       !l.includes('system message');

                if (!keep) {
                    console.log('Filtering out line:', line.slice(0, 100) + '...');
                }
                return keep;
            })
            .join('\n');

        console.log('\nAfter filtering:', {
            originalLength: documentContent.text?.length || 0,
            cleanedLength: cleanedText.length,
            removedCharacters: (documentContent.text?.length || 0) - cleanedText.length
        });

        // Split into paragraphs/sections
        const sections = cleanedText.split('\n\n').filter((s: string) => s.trim().length > 0);
        console.log(`\nSplit into ${sections.length} sections`);

        // Create runtime object for embeddings
        const runtime = {
            agentId: crypto.randomUUID(),
            serverUrl: process.env.AGENT_SERVER_URL || 'http://localhost:3000',
            databaseAdapter: null as any,
            token: null,
            modelProvider: ModelProviderName.ANTHROPIC,
            imageModelProvider: ModelProviderName.ANTHROPIC,
            imageVisionModelProvider: ModelProviderName.ANTHROPIC,
            character: {
                name: characterName,
                modelProvider: ModelProviderName.ANTHROPIC,
                bio: "",
                lore: [],
                messageExamples: [],
                postExamples: [],
                topics: [],
                adjectives: [],
                clients: [],
                plugins: [],
                style: {
                    all: [],
                    chat: [],
                    post: []
                }
            },
            providers: [],
            actions: [],
            evaluators: [],
            plugins: [],
            fetch: fetch as any,
            messageManager: null as any,
            descriptionManager: null as any,
            documentsManager: null as any,
            knowledgeManager: null as any,
            ragKnowledgeManager: null as any,
            loreManager: null as any,
            cacheManager: null as any,
            services: new Map(),
            clients: {},
            initialize: async () => {},
            registerMemoryManager: () => {},
            getMemoryManager: () => null,
            getService: () => null,
            registerService: () => {},
            getSetting: (key: string): string | null => {
                if (key === "ANTHROPIC_API_KEY") {
                    const apiKey = characterSettings.settings?.secrets?.ANTHROPIC_API_KEY;
                    return apiKey || null;
                }
                return null;
            },
            getConversationLength: () => 0,
            processActions: async () => {},
            evaluate: async () => null,
            ensureParticipantExists: async () => {},
            ensureUserExists: async () => {},
            registerAction: () => {},
            ensureConnection: async () => {},
            ensureParticipantInRoom: async () => {},
            ensureRoomExists: async () => {},
            composeState: async () => ({
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                roomId: crypto.randomUUID(),
                actors: "",
                recentMessages: "",
                recentMessagesData: []
            }),
            updateRecentMessageState: async () => ({
                bio: "",
                lore: "",
                messageDirections: "",
                postDirections: "",
                roomId: crypto.randomUUID(),
                actors: "",
                recentMessages: "",
                recentMessagesData: []
            })
        };

        // Generate embeddings for each section
        console.log('\n=== Generating Section Embeddings ===');
        const sectionEmbeddings = await Promise.all(
            sections.map(async (section: string) => {
                const embedding = await embed(runtime, section);
                return {
                    text: section,
                    embedding
                };
            })
        );

        // Generate embedding for entire document to use as reference
        console.log('\nGenerating document-level embedding');
        const documentEmbedding = await embed(runtime, cleanedText);

        // Calculate similarity scores between document and each section
        const sectionScores = sectionEmbeddings.map((section, index) => {
            const similarity = cosineSimilarity(documentEmbedding, section.embedding);
            return {
                index,
                text: section.text,
                similarity,
                length: section.text.length
            };
        });

        // Sort sections by similarity score
        const sortedSections = sectionScores
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5); // Take top 5 most relevant sections

        console.log('\n=== Most Relevant Sections ===');
        sortedSections.forEach((section, i) => {
            console.log(`\nSection ${i + 1}:`, {
                similarity: section.similarity,
                length: section.length,
                preview: section.text.slice(0, 100) + '...'
            });
        });

        // Combine top sections into a summary
        const relevantContent = sortedSections
            .map(s => s.text)
            .join('\n\n');

        // Calculate tokens for relevant content
        const contentTokens = countTokens(relevantContent);
        console.log('\nToken count breakdown:', {
            relevantContentLength: relevantContent.length,
            relevantContentTokens: contentTokens,
            sectionsCount: sortedSections.length,
            sectionsLengths: sortedSections.map(s => s.text.length),
            sectionsTokenCounts: sortedSections.map(s => countTokens(s.text))
        });

        // If content is too long, take only the most relevant sections that fit within limits
        let truncatedContent = relevantContent;
        if (contentTokens > 10000) { // More conservative limit for Claude
            console.log('Content too long, truncating to fit token limits...');
            truncatedContent = sortedSections
                .reduce((acc, section) => {
                    const potentialContent = acc + '\n\n' + section.text;
                    const potentialTokens = countTokens(potentialContent);
                    console.log('Section addition check:', {
                        currentLength: acc.length,
                        sectionLength: section.text.length,
                        potentialLength: potentialContent.length,
                        currentTokens: countTokens(acc),
                        sectionTokens: countTokens(section.text),
                        potentialTokens
                    });
                    if (potentialTokens < 10000) { // More conservative limit
                        return potentialContent;
                    }
                    return acc;
                }, '');
            console.log('Truncation results:', {
                originalLength: relevantContent.length,
                truncatedLength: truncatedContent.length,
                originalTokens: contentTokens,
                truncatedTokens: countTokens(truncatedContent)
            });
        }

        console.log('\n=== Creating Final Summary ===');
        const apiKey = characterSettings.settings?.secrets?.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('No Anthropic API key found in character settings');
        }

        // Use our core text generation with proper token management
        const finalPrompt = `Create a concise insight in exactly 250 characters that captures the key points from this content:

${truncatedContent}

Requirements:
- Focus on specific facts and metrics
- Keep it clear and direct
- Do not include any prefixes or source information`;

        // Double check token count before sending
        const promptTokens = countTokens(finalPrompt);
        console.log('\nFinal prompt analysis:', {
            promptLength: finalPrompt.length,
            promptTokens,
            contentLength: truncatedContent.length,
            contentTokens: countTokens(truncatedContent),
            requirementsLength: finalPrompt.length - truncatedContent.length,
            requirementsTokens: countTokens(finalPrompt.slice(truncatedContent.length))
        });

        if (promptTokens > 10000) {
            console.log('Warning: Prompt still too long, truncating further...');
            truncatedContent = truncatedContent.slice(0, 40000); // Roughly 10000 tokens
            console.log('Further truncation results:', {
                newLength: truncatedContent.length,
                newTokens: countTokens(truncatedContent)
            });
        }

        console.log('\nGenerating summary using text generation...');
        try {
            console.log('Runtime settings:', {
                modelProvider: runtime.modelProvider,
                maxInputTokens: runtime.getSetting('maxInputTokens'),
                maxOutputTokens: runtime.getSetting('maxOutputTokens'),
                temperature: runtime.getSetting('temperature'),
                maxPromptTokens: runtime.getSetting('maxPromptTokens')
            });
            console.log('Prompt length:', finalPrompt.length);
            console.log('Estimated tokens:', countTokens(finalPrompt));

            const finalSummary = await generateText({
                runtime: {
                    ...runtime,
                    agentId: crypto.randomUUID() // Generate a new agent ID for this call
                },
                context: finalPrompt,
                modelClass: ModelClass.SMALL,
                maxSteps: 1
            });
            console.log('Summary generation successful:', {
                summaryLength: finalSummary.length,
                summaryTokens: countTokens(finalSummary)
            });
        } catch (error) {
            console.error('Error in generateText:', error);
            console.error('Error context:', {
                promptLength: finalPrompt.length,
                promptTokens: countTokens(finalPrompt),
                truncatedContentLength: truncatedContent.length,
                truncatedContentTokens: countTokens(truncatedContent),
                runtimeSettings: {
                    modelProvider: runtime.modelProvider,
                    maxInputTokens: runtime.getSetting('maxInputTokens'),
                    maxOutputTokens: runtime.getSetting('maxOutputTokens'),
                    temperature: runtime.getSetting('temperature'),
                    maxPromptTokens: runtime.getSetting('maxPromptTokens')
                }
            });
            throw error;
        }

        // Get the source information
        const sourceUrl = documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown';
        const sourceName = documentContent.metadata?.frontmatter?.title ||
                         documentContent.metadata?.frontmatter?.newsletter ||
                         documentContent.title ||
                         (sourceUrl.includes('exponentialview.co') ? 'Exponential View' : 'Unknown');

        // Format broadcast text with source
        const broadcastText = sourceUrl === 'Unknown'
            ? truncatedContent
            : `${truncatedContent} Source: ${sourceName} [${sourceUrl}]`;

        // Save to memories
        const messageId = await saveMessageToMemories(broadcastText);
        await recordBroadcast(document.id, messageId);

        console.log('Successfully created broadcast:', {
            documentId: document.id,
            messageId,
            textLength: broadcastText.length
        });

        return [{
            text: broadcastText,
            type: 'broadcast',
            metadata: {
                messageType: 'broadcast',
                status: 'pending',
                sourceMemoryId: document.id
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