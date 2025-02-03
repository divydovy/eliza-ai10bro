import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import net from 'net';
import { encodingForModel } from "js-tiktoken";

console.log('Starting broadcast message creation...');

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
console.log('Database path:', dbPath);
const db = new Database(dbPath);
console.log('Successfully connected to database');

// Function to check if a port is in use
async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

// Function to find the active agent port
async function findActivePort(startPort: number = 3000, endPort: number = 3010): Promise<number> {
    console.log('Scanning for active agent port...');
    for (let port = startPort; port <= endPort; port++) {
        if (await isPortInUse(port)) {
            console.log(`Found active port: ${port}`);
            return port;
        }
    }
    console.log('No active port found, using default port 3000');
    return startPort;
}

// Get the port before we need it
let SERVER_PORT: number;

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

    // Find the oldest document that hasn't been broadcast yet
    const nextDocument = db.prepare(`
        SELECT m1.id, m1.content, m1.createdAt
        FROM memories m1
        WHERE m1.type = 'documents'
        AND json_extract(m1.content, '$.source') = 'obsidian'
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m1.id
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

    db.prepare(`
        INSERT INTO memories (id, type, content, createdAt)
        VALUES (?, 'messages', ?, unixepoch() * 1000)
    `).run(id, content);

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

async function sendMessageToAgent(characterName: string, message: any) {
    // Ensure we have the port
    if (!SERVER_PORT) {
        SERVER_PORT = await findActivePort();
    }

    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageLength: message.text.length,
        metadata: message.metadata,
        port: SERVER_PORT
    });

    const response = await fetch(`http://localhost:${SERVER_PORT}/${characterName}/message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}\n${errorText}`);
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

    return data;
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

        // Truncate document content if it's too long (limit to ~25k tokens which is roughly 100k characters)
        const maxContentLength = 100000;
        const truncatedText = documentContent.text.length > maxContentLength
            ? documentContent.text.slice(0, maxContentLength) + "... [truncated due to length]"
            : documentContent.text;

        console.log('Document stats after truncation:', {
            finalLength: truncatedText.length,
            wasTruncated: truncatedText.length !== documentContent.text.length,
            truncatedAmount: documentContent.text.length - truncatedText.length
        });

        // First, get a concise summary from Claude directly
        console.log('\nPreparing Claude summary request...');
        const apiKey = characterSettings.settings?.secrets?.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error('No Anthropic API key found in character settings');
        }

        const summaryPrompt = `Summarize the key insights and significance of this document in exactly 500 characters. Focus on what's most important and impactful. Here's the document:

Title: ${documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled'}
Source: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}
Content: ${truncatedText}`;

        console.log('Summary request stats:', {
            promptLength: summaryPrompt.length,
            titleLength: (documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled').length,
            sourceLength: (documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown').length
        });

        console.log('\nClaude API request parameters:', {
            model: 'claude-3-sonnet-20240229',
            maxTokens: 500,
            promptTokens: countTokens(summaryPrompt),
            totalEstimatedTokens: countTokens(summaryPrompt) + 500
        });

        const summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
                    content: summaryPrompt
                }]
            })
        });

        if (!summaryResponse.ok) {
            const errorText = await summaryResponse.text();
            let parsedError;
            try {
                parsedError = JSON.parse(errorText);
            } catch {
                parsedError = { raw: errorText };
            }

            console.error('\nClaude API Error Details:', {
                status: summaryResponse.status,
                statusText: summaryResponse.statusText,
                headers: Object.fromEntries(summaryResponse.headers.entries()),
                error: parsedError
            });

            // Throw a truncated version of the error
            throw new Error(`Claude API error: ${summaryResponse.status} ${summaryResponse.statusText}`);
        }

        const summaryData = await summaryResponse.json();
        const summary = summaryData.content[0].text;
        const truncatedSummary = summary.slice(0, 500) + (summary.length > 500 ? '...' : '');
        console.log('Summary stats:', {
            originalLength: summary.length,
            truncatedLength: truncatedSummary.length,
            wasTruncated: summary.length > 500
        });

        // Now create the broadcast prompt with the summary
        console.log('\nPreparing broadcast prompt...');
        const defaultPrompt = "Create a single social media style message about this summary. Focus on what's most significant and impactful. Keep it under 280 characters, be specific about what was learned, and cite the source if available. Here's the summary:\n\n";

        const broadcastPrompt = `[BROADCAST_REQUEST:${document.id}]\n\n` +
            (characterSettings.settings?.broadcastPrompt || defaultPrompt) +
            `\nTitle: ${documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled'}\n` +
            `Source: ${documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown'}\n` +
            `Content: ${truncatedSummary}`;

        console.log('Broadcast prompt stats:', {
            totalLength: broadcastPrompt.length,
            estimatedTokens: countTokens(broadcastPrompt),
            components: {
                requestTag: `[BROADCAST_REQUEST:${document.id}]`.length,
                prompt: (characterSettings.settings?.broadcastPrompt || defaultPrompt).length,
                title: (documentContent.metadata?.frontmatter?.title || documentContent.title || 'Untitled').length,
                source: (documentContent.metadata?.frontmatter?.source || documentContent.source || 'Unknown').length,
                summary: truncatedSummary.length
            }
        });

        // Send system message to the agent's API with retries
        console.log("\nSending request to agent API...");
        let retryCount = 0;
        const maxRetries = 3;
        const retryDelay = 2000;

        while (retryCount < maxRetries) {
            try {
                const data = await sendMessageToAgent(characterName, {
                    text: broadcastPrompt,
                    type: "system",
                    userId: "system",
                    userName: "system",
                    metadata: {
                        messageType: "broadcast",
                        status: "pending",
                        sourceMemoryId: document.id,
                        silent: true
                    }
                });

                if (data && Array.isArray(data) && data.length > 0 && data[0].text) {
                    console.log("\nBroadcast message created successfully");
                    console.log("Message text:", data[0].text);

                    // Find the newly created message in the memories table
                    const broadcastMessage = db.prepare(`
                        SELECT id
                        FROM memories
                        WHERE type = 'messages'
                        AND json_extract(content, '$.text') LIKE ?
                        ORDER BY createdAt DESC
                        LIMIT 1
                    `).get(`%${data[0].text}%`) as BroadcastMessage;

                    if (!broadcastMessage) {
                        throw new Error("Could not find broadcast message in memories table");
                    }

                    await recordBroadcast(document.id, broadcastMessage.id);
                    return data;
                } else {
                    console.error("\nERROR: No valid message text found in response");
                    console.error("Response data:", data);
                }
            } catch (error) {
                console.error(`\nERROR in retry ${retryCount + 1}:`, error);
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        console.error("\nERROR: All retries failed");
        throw new Error("All retries failed");
    } catch (error) {
        console.error("\nERROR in createBroadcastMessage:", error);
        throw error;
    }
}

// Get character name from command line arguments
const characterName = process.argv[2] || 'c3po';
createBroadcastMessage(characterName).catch(console.error);