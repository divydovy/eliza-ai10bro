import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';
import fetch from 'node-fetch';

console.log('Starting simplified broadcast message creation...');

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

interface DatabaseMemory {
    id: string;
    content: string;
    createdAt: number;
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

    // Create a simple zero embedding (array of 1536 zeros)
    const zeroEmbedding = new Array(1536).fill(0);

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
    `).run(id, documentId, messageId, client);

    console.log(`Successfully recorded ${client} broadcast`);
}

async function createBroadcastMessage(characterName: string = 'c3po') {
    try {
        console.log(`\n🔊 SIMPLIFIED BROADCAST MESSAGE CREATION STARTING 🔊`);
        console.log(`Character: ${characterName}`);

        // Load character settings
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

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

        // Create broadcast messages for each client
        const broadcasts = [];
        const clients = ['telegram', 'twitter'] as const;

        for (const client of clients) {
            const maxLength = client === 'telegram' ? 1000 : 250;
            const broadcastId = crypto.randomUUID();

            // Create a simple broadcast message based on the document content
            const title = documentContent.title || documentContent.metadata?.title || 'Content Update';
            const text = documentContent.text || documentContent.content || '';

            // Create a simple broadcast message
            let broadcastText = `📢 ${title}\n\n`;

            // Add a summary of the content (truncated to fit length limits)
            const summary = text.length > maxLength - 100 ?
                text.substring(0, maxLength - 150) + '...' :
                text;

            broadcastText += summary;

            // Add source if available
            if (sourceUrl) {
                broadcastText += `\n\nSource: ${sourceUrl}`;
            }

            // Ensure it fits within the character limit
            if (broadcastText.length > maxLength) {
                broadcastText = broadcastText.substring(0, maxLength - 3) + '...';
            }

            const messageId = await saveMessageToMemories(broadcastText);
            await recordBroadcast(document.id, messageId, client);

            broadcasts.push({
                text: broadcastText,
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
                length: broadcastText.length,
                text: broadcastText,
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