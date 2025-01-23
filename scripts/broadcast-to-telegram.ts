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
        const characterPath = path.join(process.cwd(), '..', 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const botToken = characterSettings.settings.secrets.TELEGRAM_BOT_TOKEN;
        const chatId = characterSettings.settings.secrets.TELEGRAM_CHAT_ID;

        if (!chatId) {
            throw new Error('No chat ID found in character settings');
        }

        const bot = new Telegraf(botToken);
        await bot.telegram.sendMessage(chatId, message);
        console.log(`Message sent to chat ${chatId}`);
    } catch (error) {
        console.error("Error broadcasting to Telegram:", error);
        throw error;
    }
}

export { broadcastToTelegram };