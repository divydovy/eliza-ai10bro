import { broadcastToTelegram } from './broadcast-to-telegram.js';
import { broadcastToTwitter } from './broadcast-to-twitter.js';
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(dbPath);

interface Broadcast {
    id: string;
    documentId: string;
    client: string;
    message_id: string;
    messageId?: string;  // For backward compatibility
    status: string;
    sent_at: number | null;
    createdAt: number;
}

interface Memory {
    id: string;
    content: string;
}

// Debug function to show database state
function showDatabaseState() {
    console.log('\nAnalyzing database state...');

    // Check total number of broadcasts
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts').get() as { count: number };
    console.log(`Total broadcasts in database: ${totalCount.count}`);

    // Look for pending broadcasts
    console.log('\nPending broadcasts:');
    const pendingBroadcasts = db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.documentId
        WHERE b.status = 'pending'
        ORDER BY b.createdAt DESC
        LIMIT 3
    `).all() as (Broadcast & { content: string })[];

    pendingBroadcasts.forEach(broadcast => {
        const content = JSON.parse(broadcast.content);
        console.log('\nPending Broadcast:', {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString(),
            title: content.title || content.metadata?.frontmatter?.title || 'No title',
            source: content.source || content.metadata?.frontmatter?.source || 'Unknown'
        });
    });

    // Look for recently sent broadcasts
    console.log('\nRecently sent broadcasts:');
    const sentBroadcasts = db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.documentId
        WHERE b.status = 'sent'
        ORDER BY b.createdAt DESC
        LIMIT 3
    `).all() as (Broadcast & { content: string })[];

    sentBroadcasts.forEach(broadcast => {
        const content = JSON.parse(broadcast.content);
        console.log('\nSent Broadcast:', {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString(),
            title: content.title || content.metadata?.frontmatter?.title || 'No title',
            source: content.source || content.metadata?.frontmatter?.source || 'Unknown'
        });
    });
}

// Get next pending broadcast for a specific client
function getNextPendingBroadcast(client: string): (Broadcast & { content: string }) | undefined {
    return db.prepare(`
        SELECT b.*, m.content
        FROM broadcasts b
        JOIN memories m ON m.id = b.message_id
        WHERE b.client = ? AND b.status = 'pending'
        ORDER BY b.createdAt ASC
        LIMIT 1
    `).get(client) as (Broadcast & { content: string }) | undefined;
}

// Mark a broadcast as sent
function markAsSent(id: string) {
    db.prepare(`
        UPDATE broadcasts
        SET status = 'sent',
            sent_at = unixepoch() * 1000
        WHERE id = ?
    `).run(id);
}

// Process one message from the queue for a specific client
async function processNextBroadcast(client: string, characterName: string) {
    const broadcast = getNextPendingBroadcast(client);
    if (!broadcast) {
        console.log(`No pending broadcasts found for ${client}`);
        return false;
    }

    try {
        console.log(`\nProcessing ${client} broadcast:`, {
            id: broadcast.id,
            documentId: broadcast.documentId,
            messageId: broadcast.messageId,
            createdAt: new Date(broadcast.createdAt).toISOString()
        });

        // Get the message content
        const message = db.prepare(`
            SELECT content FROM memories
            WHERE id = ?
        `).get(broadcast.message_id) as Memory | undefined;

        if (!message) {
            console.error('Could not find message content for broadcast');
            return false;
        }

        const messageContent = JSON.parse(message.content);
        let success = false;

        // Get the source document content to check for source
        const sourceDoc = db.prepare(`
            SELECT content
            FROM memories
            WHERE id = ?
        `).get(broadcast.documentId) as { content: string };

        let messageText = messageContent.text;

        // If source document has source, append it to the message
        if (sourceDoc) {
            const sourceContent = JSON.parse(sourceDoc.content);
            const sourceUrl = sourceContent.metadata?.frontmatter?.source;
            if (sourceUrl) {
                messageText = `${messageText}\n\nSource: ${sourceUrl}`;
            }
        }

        // Send to appropriate client
        if (client === 'telegram') {
            try {
                await broadcastToTelegram(messageText, characterName);
                console.log('Successfully sent broadcast to Telegram');
                success = true;
            } catch (error) {
                console.error('Error sending to Telegram:', error);
            }
        } else if (client === 'twitter') {
            try {
                await broadcastToTwitter(messageText, characterName);
                console.log('Successfully sent broadcast to Twitter');
                success = true;
            } catch (error) {
                console.error('Error sending to Twitter:', error);
            }
        }

        if (success) {
            markAsSent(broadcast.id);
            console.log(`Marked ${client} broadcast as sent`);
        }

        return success;
    } catch (error) {
        console.error(`Error processing ${client} broadcast:`, error);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // Process one message for each client
    const clients = ['telegram', 'twitter'];
    for (const client of clients) {
        console.log(`\nProcessing ${client} queue...`);
        await processNextBroadcast(client, characterName);
    }
    console.log('\nFinished processing broadcast messages');
    process.exit(0);
}

// Run if called directly
const characterName = process.argv[2] || 'c3po';
processQueue(characterName).catch(console.error);