import fs from 'fs';
import { fileURLToPath } from 'url';
// import { processQueue } from './process-broadcast-queue';  // Commented out
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import Database from 'better-sqlite3';

// Initialize database connection
const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface BroadcastMessage {
    id: string;
    text?: string;
}

interface Message {
    id?: string;
    text?: string;
    action?: string;
    type?: string;
}

interface Document {
    id: string;
    content: string;
    metadata: {
        title: string;
        path: string;
        source: string;
        created: string;
    };
}

// Store broadcast responses for later processing
let broadcastResponses: Message[] = [];

async function sendMessageToAgent(characterName: string, message: any) {
    console.log('\nSending message to agent:', {
        characterName,
        messageType: message.type,
        messageText: message.text.substring(0, 100) + '...',
        metadata: message.metadata
    });

    const response = await fetch(`http://localhost:3000/${characterName}/message`, {
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
            text: msg.text?.substring(0, 100) + '...',
            action: msg.action,
            type: msg.type,
            metadata: msg.metadata,
            parentMessageId: msg.parentMessageId
        }))
    });

    return data;
}

async function getUnprocessedDocuments(db: any): Promise<Document[]> {
    const query = `
        SELECT m.* FROM memories m
        WHERE m.type = 'documents'
        AND NOT EXISTS (
            SELECT 1 FROM memories b
            WHERE b.type = 'messages'
            AND json_extract(b.content, '$.metadata.documentId') = m.id
            AND json_extract(b.content, '$.text') LIKE '[BROADCAST_REQUEST:%'
        )
        ORDER BY m.createdAt DESC
    `;

    const documents = db.prepare(query).all();
    console.log(`Found ${documents.length} unprocessed documents`);

    return documents.map((doc: any) => {
        const content = JSON.parse(doc.content);
        return {
            id: doc.id,
            content: content.text,
            metadata: {
                title: content.metadata?.frontmatter?.title || path.basename(content.metadata?.path || '', '.md'),
                path: content.metadata?.path || '',
                source: content.source || 'obsidian',
                created: content.metadata?.frontmatter?.created || new Date(doc.createdAt).toISOString()
            }
        };
    });
}

async function createBroadcastForDocument(document: Document, characterName: string) {
    const broadcastId = `broadcast_${Date.now()}_${document.id}`;
    console.log(`Creating broadcast for document: ${document.metadata.title} (${document.metadata.path})`);

    const text = `[BROADCAST_REQUEST:${broadcastId}]
I have processed a new document titled "${document.metadata.title}" from ${document.metadata.path}.
Please review the following content and share any relevant insights or key takeaways:

${document.content}

If you have gained new knowledge from this document, please start your response with [BROADCAST:${broadcastId}] followed by a concise summary of the key insights. If you have no new insights to share, you may ignore this request.`;

    return sendMessageToAgent(characterName, {
        text,
        type: "system",
        userId: "system",
        userName: "system",
        metadata: {
            broadcastId,
            documentId: document.id,
            documentTitle: document.metadata.title,
            documentPath: document.metadata.path
        }
    });
}

// Simplify getNextPendingBroadcast to just process messages from the current run
async function getNextPendingBroadcast(): Promise<BroadcastMessage[]> {
    const broadcasts: BroadcastMessage[] = [];
    const broadcastRegex = /^\[BROADCAST:([^\]]+)\]/;

    // Process messages from the current run
    const messages = await getLatestMessages();
    for (const msg of messages) {
        if (!msg.text) continue;

        const match = msg.text.match(broadcastRegex);
        if (match) {
            const broadcastId = match[1];
            const cleanText = msg.text.replace(broadcastRegex, '').trim();

            broadcasts.push({
                id: broadcastId,
                text: cleanText
            });
        }
    }

    return broadcasts;
}

// Helper function to get latest messages
async function getLatestMessages(): Promise<Message[]> {
    // Return the stored broadcast responses
    return broadcastResponses;
}

async function processDocumentBatch(documents: Document[], characterName: string, batchSize: number = 10) {
    console.log(`\nProcessing batch of ${Math.min(documents.length, batchSize)} documents`);

    for (let i = 0; i < Math.min(documents.length, batchSize); i++) {
        const doc = documents[i];
        try {
            console.log('\nProcessing document:', {
                id: doc.id,
                title: doc.metadata.title,
                path: doc.metadata.path,
                createdAt: doc.metadata.created
            });

            // Send broadcast request for this document
            await createBroadcastForDocument(doc, characterName);

            // Small delay between documents to avoid overwhelming the agent
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`Error processing document ${doc.metadata.title}:`, error);
            // Continue with next document instead of failing the entire batch
        }
    }
}

async function updateObsidianKnowledge() {
    try {
        // Load character settings
        const characterPath = process.argv[2] || 'characters/c3po.character.json';
        const characterName = characterPath.split('/').pop()?.replace('.character.json', '') || 'c3po';
        console.log(`\nStarting update for character: ${characterName}`);
        console.log(`Loading settings from: ${characterPath}`);
        const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        // Send system message to create knowledge base
        console.log('\nSending knowledge base creation request...');
        const data = await sendMessageToAgent(characterName, {
            text: "Create knowledge base",
            type: "system",
            userId: "system",
            userName: "system",
            action: "CREATE_KNOWLEDGE"
        });

        if (!data || !Array.isArray(data)) {
            throw new Error('Invalid response from agent: ' + JSON.stringify(data));
        }

        console.log('\nAnalyzing response:', {
            messageCount: data.length,
            hasKnowledgeMessages: data.some(msg => msg.action === 'CREATE_KNOWLEDGE'),
            hasCompletionMessage: data.some(msg => msg.text?.includes("Finished creating knowledge base")),
            messages: data.map(msg => ({
                action: msg.action,
                type: msg.type,
                textPreview: msg.text?.substring(0, 100) + '...'
            }))
        });

        // Check if knowledge base creation is complete
        const completionMessage = data.find(msg => msg.text?.includes("Finished creating knowledge base"));
        if (completionMessage) {
            console.log("\nKnowledge base update completed successfully.");
            console.log("Completion message:", completionMessage.text);
        }

        /* Commenting out broadcast-related functionality
        // Find unprocessed documents
        const recentDocuments = await getUnprocessedDocuments(db);

        // Process documents in batches
        const batchSize = 10;
        for (let i = 0; i < recentDocuments.length; i += batchSize) {
            const batch = recentDocuments.slice(i);
            await processDocumentBatch(batch, characterName, batchSize);

            // Check for pending broadcasts after each batch
            const pendingBroadcasts = await getNextPendingBroadcast();
            if (pendingBroadcasts.length > 0) {
                console.log('\nPending broadcasts:', pendingBroadcasts.length);
                for (const broadcast of pendingBroadcasts) {
                    console.log('Broadcast:', {
                        id: broadcast.id,
                        textPreview: broadcast.text?.substring(0, 100) + '...'
                    });
                }
            }

            // Add a delay between batches
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        */

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the update
updateObsidianKnowledge();