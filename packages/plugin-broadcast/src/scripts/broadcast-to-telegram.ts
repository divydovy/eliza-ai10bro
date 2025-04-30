import fs from 'fs';
import path from 'path';
import { Telegraf } from 'telegraf';

interface CharacterSettings {
    name: string;
    settings: {
        secrets: {
            TELEGRAM_BOT_TOKEN: string;
            TELEGRAM_CHAT_ID: string;
        };
    };
}

async function broadcastToTelegram(message: string, characterName: string = 'c3po'): Promise<void> {
    try {
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const botToken = characterSettings.settings.secrets.TELEGRAM_BOT_TOKEN;
        const chatIds = characterSettings.settings.secrets.TELEGRAM_CHAT_ID.split(',').map(id => id.trim());

        if (!chatIds.length) {
            throw new Error('No chat IDs found in character settings');
        }

        const cleanMessage = message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');

        const bot = new Telegraf(botToken);

        for (const chatId of chatIds) {
            await bot.telegram.sendMessage(chatId, cleanMessage);
            console.log(`Message sent to chat ${chatId}`);
        }
    } catch (error) {
        console.error("Error broadcasting to Telegram:", error);
        throw error;
    }
}

export { broadcastToTelegram };