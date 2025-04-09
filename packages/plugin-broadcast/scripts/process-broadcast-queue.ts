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

// Debug function to show database state
function showDatabaseState() {
    console.log('\nAnalyzing database state...');

    // Get total count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM broadcasts').get() as { count: number };
    console.log(`Total broadcasts in database: ${totalCount.count}`);

    // Get pending broadcasts
    console.log('\nPending broadcasts:');
    const pendingBroadcasts = db.prepare(`
        SELECT b.id, b.documentId, b.telegram_status, b.twitter_status,
               json_extract(d.content, '$.metadata.frontmatter.title') as title,
               json_extract(d.content, '$.metadata.frontmatter.source') as source
        FROM broadcasts b
        JOIN memories d ON d.id = b.documentId
        WHERE b.telegram_status = 'pending' OR b.twitter_status = 'pending'
        ORDER BY b.createdAt DESC
    `).all() as Array<{
        id: string;
        documentId: string;
        telegram_status: string;
        twitter_status: string;
        title: string;
        source: string;
    }>;

    for (const broadcast of pendingBroadcasts) {
        console.log(`\nBroadcast ID: ${broadcast.id}`);
        console.log(`Document ID: ${broadcast.documentId}`);
        console.log(`Title: ${broadcast.title || 'No title'}`);
        console.log(`Source: ${broadcast.source || 'Unknown'}`);
        console.log(`Telegram Status: ${broadcast.telegram_status}`);
        console.log(`Twitter Status: ${broadcast.twitter_status}`);
    }
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
        console.error('Error processing broadcast:', error);
        return false;
    }
}

// Main queue processing function
async function processQueue(characterName: string) {
    // First show database state
    showDatabaseState();

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