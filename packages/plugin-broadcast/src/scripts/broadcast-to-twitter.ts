import path from "path";
import fs from "fs";
import { TwitterClientInterface } from "@elizaos/client-twitter";
import { IAgentRuntime, Character } from "@elizaos/core";

interface CharacterSettings {
    name: string;
    settings: {
        secrets?: {
            TWITTER_USERNAME?: string;
            TWITTER_PASSWORD?: string;
            TWITTER_EMAIL?: string;
            TWITTER_2FA_SECRET?: string;
        };
    };
}

export async function broadcastToTwitter(message: string, characterName: string = 'ai10bro'): Promise<void> {
    try {
        const characterPath = path.join(process.cwd(), 'characters', `${characterName}.character.json`);
        const characterSettings: CharacterSettings = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

        const secrets = characterSettings.settings?.secrets;
        if (!secrets?.TWITTER_USERNAME || !secrets?.TWITTER_PASSWORD ||
            !secrets?.TWITTER_EMAIL || !secrets?.TWITTER_2FA_SECRET) {
            throw new Error('Twitter credentials not found in character settings');
        }

        // Create a minimal runtime for the Twitter client
        const runtime: Partial<IAgentRuntime> = {
            getSetting: (key: string) => {
                const settings: { [key: string]: string } = {
                    TWITTER_USERNAME: secrets.TWITTER_USERNAME,
                    TWITTER_PASSWORD: secrets.TWITTER_PASSWORD,
                    TWITTER_EMAIL: secrets.TWITTER_EMAIL,
                    TWITTER_2FA_SECRET: secrets.TWITTER_2FA_SECRET,
                    TWITTER_DRY_RUN: 'false',
                    POST_INTERVAL_MIN: '1',
                    POST_INTERVAL_MAX: '2',
                    ENABLE_ACTION_PROCESSING: 'false',
                    ACTION_INTERVAL: '5',
                    POST_IMMEDIATELY: 'true',
                    TWITTER_SEARCH_ENABLE: 'false',
                    MAX_TWEET_LENGTH: '280'
                };
                return settings[key] || '';
            },
            character: {
                name: characterName,
                modelProvider: 'anthropic',
                model: 'claude-3-sonnet-20240229',
                clients: ['twitter'],
                plugins: ['@elizaos/plugin-broadcast'],
                bio: [],
                lore: [],
                topics: [],
                style: {
                    all: [],
                    chat: [],
                    post: []
                },
                messageExamples: [],
                postExamples: [],
                adjectives: []
            } as unknown as Character
        };

        // Initialize Twitter client
        const twitterClient = await TwitterClientInterface.start(runtime as IAgentRuntime);

        // Post the tweet using the client's post functionality
        const result = await (twitterClient as any).post.sendStandardTweet((twitterClient as any).client, message);

        if (result) {
            console.log('Tweet posted successfully:', result.rest_id);
        } else {
            throw new Error('Failed to post tweet');
        }
    } catch (error) {
        console.error("Error broadcasting to Twitter:", error);
        throw error;
    }
}
