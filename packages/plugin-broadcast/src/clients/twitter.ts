import { TwitterApi } from "twitter-api-v2";
import { BroadcastResult } from "../types";

export class TwitterBroadcastClient {
    private client: TwitterApi;

    constructor(bearerToken: string) {
        this.client = new TwitterApi(bearerToken);
    }

    async broadcast(message: string): Promise<BroadcastResult> {
        try {
            const cleanMessage = message.replace(/\[BROADCAST:[^\]]+\]\s*/, '');

            const tweet = await this.client.v2.tweet({
                text: cleanMessage
            });

            return {
                success: true,
                messageId: tweet.data.id,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}