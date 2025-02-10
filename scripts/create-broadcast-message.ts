import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector } from "../packages/core/src/embedding.js";

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
        const encoding = encodingForModel("gpt-4");
        return encoding.encode(text).length;
    } catch (error) {
        // Fallback to rough estimation if tokenizer fails
        return Math.ceil(text.length / 4);
    }
}

async function getNextUnbroadcastDocument(): Promise<DatabaseMemory | undefined> {
    console.log('Looking for next unbroadcast document...');

    // Find the oldest document that hasn't been broadcast yet and isn't already being processed
    const nextDocument = db.prepare(`
        SELECT m1.id, m1.content, m1.createdAt
        FROM memories m1
        WHERE m1.type = 'documents'
        AND json_extract(m1.content, '$.source') = 'obsidian'
        AND json_extract(m1.content, '$.text') NOT LIKE '%ACTION: CREATE_KNOWLEDGE%'
        AND json_extract(m1.content, '$.text') NOT LIKE '%system%'
        AND json_extract(m1.content, '$.metadata.action') IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m1.id
            AND (b.status = 'pending' OR b.status = 'sent')
        )
        ORDER BY m1.createdAt ASC
        LIMIT 1
    `).get() as DatabaseMemory | undefined;

    if (nextDocument) {
        console.log(`Found document from ${new Date(nextDocument.createdAt).toISOString()}`);
        const content = JSON.parse(nextDocument.content);
        console.log('Document summary:', {
            id: nextDocument.id,
            title: content.title || 'No title',
            textLength: content.text?.length || 0
        });
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
        console.log(`\n=== Starting broadcast creation for character: ${characterName} ===`);

        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        console.log('Looking for character settings at:', characterPath);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        console.log('Successfully loaded character settings');

        // Get next document to broadcast
        const document = await getNextUnbroadcastDocument();
        if (!document) {
            console.log('No documents to broadcast');
            return [];
        }

        const documentContent = JSON.parse(document.content);

        // Log document stats before truncation
        console.log('\nDocument stats before truncation:', {
            title: documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled',
            source: documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown',
            originalLength: documentContent.text?.length || 0,
            hasMetadata: !!documentContent.metadata,
            hasFrontmatter: !!documentContent.metadata?.frontmatter
        });

        // Truncate document content if it's too long (limit to ~5k tokens which is roughly 20k characters)
        const maxContentLength = 20000;
        const truncatedText = documentContent.text.length > maxContentLength
            ? documentContent.text.slice(0, maxContentLength) + "... [truncated due to length]"
            : documentContent.text;

        console.log('Document stats after truncation:', {
            finalLength: truncatedText.length,
            wasTruncated: truncatedText.length !== documentContent.text.length,
            truncatedAmount: documentContent.text.length - truncatedText.length,
            estimatedTokens: countTokens(truncatedText)
        });

        // First, get a concise summary from Claude directly
        console.log('\nPreparing Claude summary request...');
        const apiKey = characterSettings.settings?.secrets?.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('No Anthropic API key found in character settings');
        }

        // Split content into smaller chunks for summarization (about 1k tokens per chunk)
        const chunkSize = 4000;
        const chunks = [];
        for (let i = 0; i < truncatedText.length; i += chunkSize) {
            chunks.push(truncatedText.slice(i, i + chunkSize));
        }
        console.log(`Split content into ${chunks.length} chunks for summarization`);

        // Get summary for each chunk
        const chunkSummaries = [];
        for (let i = 0; i < chunks.length; i++) {
            console.log(`\nProcessing chunk ${i + 1} of ${chunks.length}`);
            const chunk = chunks[i];

            const chunkPrompt = `Analyze this document section and extract a specific, investment-relevant insight in exactly 150 characters. Focus on the convergence of natural wisdom and technological innovation.

Title: ${documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled'}
Source: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}
Content: ${chunk}

Requirements:
1. Identify specific market opportunities, trends, or technological breakthroughs
2. Highlight how this connects to natural systems or sustainable principles
3. Include concrete metrics, growth rates, or market sizes when available
4. Frame the insight in terms of investment potential or strategic importance
5. Reference the specific source document/report`;

            const promptTokens = countTokens(chunkPrompt);
            console.log('Chunk summary request stats:', {
                promptLength: chunkPrompt.length,
                chunkLength: chunk.length,
                estimatedTokens: promptTokens,
                isWithinLimit: promptTokens < 15000
            });

            if (promptTokens >= 15000) {
                console.log('Warning: Chunk too large, splitting further');
                const subChunks = [];
                const subChunkSize = chunk.length / 2;
                for (let j = 0; j < chunk.length; j += subChunkSize) {
                    subChunks.push(chunk.slice(j, j + subChunkSize));
                }

                for (const subChunk of subChunks) {
                    const subPrompt = `Summarize this section of the document in exactly 75 characters. Focus on key insights and facts. Here's the section:

Title: ${documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled'}
Source: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}
Content: ${subChunk}`;

                    const subResponse = await fetch('https://api.anthropic.com/v1/messages', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01'
                        },
                        body: JSON.stringify({
                            model: 'claude-3-sonnet-20240229',
                            max_tokens: 100,
                            messages: [{
                                role: 'user',
                                content: subPrompt
                            }]
                        })
                    });

                    if (!subResponse.ok) {
                        throw new Error(`Claude API error: ${subResponse.status} ${subResponse.statusText}`);
                    }

                    const subSummaryData = await subResponse.json();
                    chunkSummaries.push(subSummaryData.content[0].text);
                }
                continue;
            }

            const summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 200,
                    messages: [{
                        role: 'user',
                        content: chunkPrompt
                    }]
                })
            });

            if (!summaryResponse.ok) {
                const errorText = await summaryResponse.text();
                let parsedError;
                try {
                    parsedError = JSON.parse(errorText);
                } catch {
                    parsedError = { raw: errorText.slice(0, 500) + '...' }; // Truncate raw error text
                }

                // Create a sanitized version of the error details
                const sanitizedError = {
                    status: summaryResponse.status,
                    statusText: summaryResponse.statusText,
                    headers: Object.fromEntries(
                        Object.entries(Object.fromEntries(summaryResponse.headers.entries()))
                            .filter(([key]) => !key.toLowerCase().includes('authorization'))
                    ),
                    error: typeof parsedError.error === 'string'
                        ? parsedError.error.slice(0, 500) + '...'
                        : parsedError.error
                };

                console.error('\nClaude API Error Details:', sanitizedError);
                throw new Error(`Claude API error (${summaryResponse.status}): ${sanitizedError.error || summaryResponse.statusText}`);
            }

            const summaryData = await summaryResponse.json();
            const chunkSummary = summaryData.content[0].text;
            chunkSummaries.push(chunkSummary);

            // Add a small delay between chunks to avoid rate limiting
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Combine chunk summaries and get final summary
        const combinedSummary = chunkSummaries.join('\n\n');
        console.log('\nChunk summaries combined:', {
            numberOfChunks: chunkSummaries.length,
            totalLength: combinedSummary.length,
            estimatedTokens: countTokens(combinedSummary)
        });

        // Get final summary from combined chunk summaries
        const finalSummaryPrompt = `Create a focused, specific 280-character summary that would work well as a social media post. Use these section summaries as input, but ensure the final summary:

1. Starts by clearly identifying the source document/report
2. Focuses on one specific, concrete insight or finding
3. Includes specific numbers, facts, or details if available
4. Explains why this insight matters
5. Maintains a professional tone while being engaging

Here are the section summaries:
${combinedSummary}`;

        console.log('\nFinal summary request stats:', {
            promptLength: finalSummaryPrompt.length,
            estimatedTokens: countTokens(finalSummaryPrompt)
        });

        const finalSummaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 500,
                messages: [{
                    role: 'user',
                    content: finalSummaryPrompt
                }]
            })
        });

        if (!finalSummaryResponse.ok) {
            const errorText = await finalSummaryResponse.text();
            let parsedError;
            try {
                parsedError = JSON.parse(errorText);
            } catch {
                parsedError = { raw: errorText.slice(0, 500) + '...' }; // Truncate raw error text
            }

            // Create a sanitized version of the error details
            const sanitizedError = {
                status: finalSummaryResponse.status,
                statusText: finalSummaryResponse.statusText,
                headers: Object.fromEntries(
                    Object.entries(Object.fromEntries(finalSummaryResponse.headers.entries()))
                        .filter(([key]) => !key.toLowerCase().includes('authorization'))
                ),
                error: typeof parsedError.error === 'string'
                    ? parsedError.error.slice(0, 500) + '...'
                    : parsedError.error
            };

            console.error('\nClaude API Error Details:', sanitizedError);
            throw new Error(`Claude API error (${finalSummaryResponse.status}): ${sanitizedError.error || finalSummaryResponse.statusText}`);
        }

        const finalSummaryData = await finalSummaryResponse.json();
        const summary = finalSummaryData.content[0].text;
        const truncatedSummary = summary.slice(0, 500) + (summary.length > 500 ? '...' : '');
        console.log('Summary stats:', {
            originalLength: summary.length,
            truncatedLength: truncatedSummary.length,
            wasTruncated: summary.length > 500
        });

        // After getting the final summary, save it directly
        const broadcastText = `${truncatedSummary}\n\nSource: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}`;

        // Save directly to memories
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
        console.error("\nERROR in createBroadcastMessage:", error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

// Get character name from command line arguments
const characterName = process.argv[2] || 'c3po';
createBroadcastMessage(characterName).catch(console.error);