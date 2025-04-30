import fs from 'fs';
import path from 'path';
import { Scraper } from 'agent-twitter-client';

interface CharacterSettings {
    name: string;
    settings: {
        secrets: {
            TWITTER_USERNAME: string;
            TWITTER_PASSWORD: string;
            TWITTER_EMAIL: string;
            TWITTER_2FA_SECRET: string;
        };
    };
}

async function broadcastToTwitter(message: string, characterName: string = 'c3po'): Promise<void> {
    try {
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const {
            TWITTER_USERNAME,
            TWITTER_PASSWORD,
            TWITTER_EMAIL,
            TWITTER_2FA_SECRET
        } = characterSettings.settings.secrets;

        // Clean the message by removing broadcast tags and ensuring it's within Twitter's character limit
        const cleanMessage = message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');
        const truncatedMessage = cleanMessage.length > 280 ? cleanMessage.slice(0, 277) + '...' : cleanMessage;

        // Initialize Twitter client
        const scraper = new Scraper();
        await scraper.login(TWITTER_USERNAME, TWITTER_PASSWORD, TWITTER_EMAIL, TWITTER_2FA_SECRET);

        if (await scraper.isLoggedIn()) {
            // Post the tweet
            await scraper.sendTweet(truncatedMessage);
            console.log('Tweet posted successfully');
        } else {
            throw new Error('Failed to log in to Twitter');
        }

    } catch (error) {
        console.error("Error broadcasting to Twitter:", error);
        throw error;
    }
}

export { broadcastToTwitter };
