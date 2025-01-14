import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { DirectClient } from '../packages/client-direct/src';
import type { IAgentRuntime } from '../packages/core/src/types';
import { Telegraf } from 'telegraf';

const DB_PATH = path.join(process.cwd(), 'agent', 'data', 'db.sqlite');
const db = new Database(DB_PATH);

async function main() {
  const [characterPath, documentPath] = process.argv.slice(2);
  if (!characterPath || !documentPath) {
    console.error('Please provide character and document paths');
    process.exit(1);
  }

  const characterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
  const documentContent = fs.readFileSync(documentPath, 'utf-8');

  // Get all rooms for this agent
  const rooms = db.prepare(`
    SELECT DISTINCT r.id as roomId, m.content
    FROM rooms r
    INNER JOIN participants p ON r.id = p.roomId
    INNER JOIN memories m ON r.id = m.roomId
    WHERE p.userId = ?
    AND m.type = 'messages'
    AND m.content LIKE '%"source":"telegram"%'
  `).all(characterSettings.id);

  console.log(`Found ${rooms.length} rooms with Telegram messages`);

  // Target the specific chat ID we know works
  const chatId = 425347269;

  try {
    console.log(`Attempting to send message to chat ${chatId}`);
    // Create a new Telegraf instance with the bot token
    const bot = new Telegraf(characterSettings.settings?.secrets?.TELEGRAM_BOT_TOKEN);
    await bot.telegram.sendMessage(chatId.toString(), documentContent);
    console.log(`Successfully sent message to chat ${chatId}`);
  } catch (error) {
    if (error.message.includes('chat not found')) {
      console.error(`Failed to send message - chat ${chatId} not found or bot was removed`);
    } else {
      console.error(`Failed to send message to chat ${chatId}:`, error.message);
    }
    process.exit(1);
  }

  console.log('Broadcast complete.');
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});