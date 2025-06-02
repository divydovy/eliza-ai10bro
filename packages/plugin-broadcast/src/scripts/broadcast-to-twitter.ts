import path from "path";
import fs from "fs";
import { TwitterBroadcastClient } from "../clients/twitter";

interface CharacterSettings {
    name: string;
    settings: {
        secrets?: {
            TWITTER_BEARER_TOKEN?: string;
        };
    };
}

export async function broadcastToTwitter(message: string, characterName: string = 'ai10bro'): Promise<void> {
    try {
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const bearerToken = characterSettings.settings?.secrets?.TWITTER_BEARER_TOKEN;
        if (!bearerToken) {
            throw new Error('TWITTER_BEARER_TOKEN not found in character settings');
        }

        // Initialize Twitter client
        const client = new TwitterBroadcastClient(bearerToken);

        // Post the tweet
        const result = await client.broadcast(message);

        if (result.success) {
            console.log('Tweet posted successfully:', result.messageId);
        } else {
            throw new Error(result.error || 'Failed to post tweet');
        }
    } catch (error) {
        console.error("Error broadcasting to Twitter:", error);
        throw error;
    }
}
