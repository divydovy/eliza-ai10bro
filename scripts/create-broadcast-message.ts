import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import { encodingForModel } from "js-tiktoken";
import fetch from 'node-fetch';
import { getEmbeddingZeroVector, generateText, ModelClass, ModelProviderName } from "@elizaos/core";

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
        AND NOT EXISTS (
            SELECT 1 FROM broadcasts b
            WHERE b.documentId = m1.id
            AND b.status IN ('pending', 'sent')
        )
        ORDER BY m1.createdAt ASC
        LIMIT 1
    `).get() as DatabaseMemory | undefined;

    if (nextDocument) {
        const content = JSON.parse(nextDocument.content);
        console.log('\nDocument found:', {
            id: nextDocument.id,
            createdAt: new Date(nextDocument.createdAt).toISOString(),
            title: content.title || content.metadata?.title || 'No title',
            source: content.metadata?.frontmatter?.source ||
                   content.metadata?.source ||
                   content.source ||
                   content.metadata?.url ||
                   'Unknown'
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

async function recordBroadcast(documentId: string, messageId: string, client: string) {
    console.log(`\nRecording broadcast for ${client} in database...`);
    const id = crypto.randomUUID();

    db.prepare(`
        INSERT INTO broadcasts (id, documentId, client, message_id)
        VALUES (?, ?, ?, ?)
    `).run(id, documentId, client, messageId);

    console.log(`Successfully recorded ${client} broadcast`);
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
        console.log(`Character: ${characterName}`);

        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Set the Anthropic API key from character settings
        if (characterSettings.settings?.secrets?.ANTHROPIC_API_KEY) {
            process.env.ANTHROPIC_API_KEY = characterSettings.settings.secrets.ANTHROPIC_API_KEY;
        }

        // Get next document to broadcast
        const document = await getNextUnbroadcastDocument();
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

// Get character name from command line arguments
const characterName = process.argv[2] || 'c3po';
createBroadcastMessage(characterName).catch(console.error);