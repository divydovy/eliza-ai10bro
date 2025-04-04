import { IAgentRuntime } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { ProcessQueueParams, ProcessQueueResult } from "./types";
import { TelegramBroadcastClient } from "../../clients/telegram";
import { TwitterBroadcastClient } from "../../clients/twitter";
import { BroadcastClient } from "../../types";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processBroadcastQueue(
    runtime: IAgentRuntime,
    params: ProcessQueueParams,
    db: BroadcastDB
): Promise<ProcessQueueResult> {
    try {
        const maxRetries = params.maxRetries || DEFAULT_MAX_RETRIES;
        const retryDelay = params.retryDelay || DEFAULT_RETRY_DELAY;
        let processedCount = 0;
        let failedCount = 0;

        // Initialize clients
        const clients: Partial<Record<BroadcastClient, TelegramBroadcastClient | TwitterBroadcastClient>> = {};

        if (!params.client || params.client === "telegram") {
            const botToken = runtime.character.settings?.secrets?.TELEGRAM_BOT_TOKEN;
            const chatIds = runtime.character.settings?.secrets?.TELEGRAM_CHAT_ID?.split(",").map(id => id.trim()) || [];

            if (botToken && chatIds.length > 0) {
                clients.telegram = new TelegramBroadcastClient(botToken, chatIds);
            }
        }

        if (!params.client || params.client === "twitter") {
            const bearerToken = runtime.character.settings?.secrets?.TWITTER_BEARER_TOKEN;

            if (bearerToken) {
                clients.twitter = new TwitterBroadcastClient(bearerToken);
            }
        }

        // Process each client's queue
        for (const [clientName, client] of Object.entries(clients)) {
            let retryCount = 0;

            while (retryCount < maxRetries) {
                const broadcast = db.getNextPendingBroadcast(clientName as BroadcastClient);
                if (!broadcast) break;

                try {
                    const result = await client.broadcast(broadcast.content);

                    if (result.success) {
                        db.updateBroadcastStatus(broadcast.id, "sent", Date.now());
                        processedCount++;
                        retryCount = 0; // Reset retry count on success
                    } else {
                        db.updateBroadcastStatus(broadcast.id, "failed");
                        failedCount++;
                        retryCount++;

                        runtime.logger.error(`Failed to send broadcast: ${result.error}`, {
                            broadcastId: broadcast.id,
                            client: clientName,
                            attempt: retryCount
                        });

                        await sleep(retryDelay);
                    }
                } catch (error) {
                    db.updateBroadcastStatus(broadcast.id, "failed");
                    failedCount++;
                    retryCount++;

                    runtime.logger.error("Error processing broadcast", {
                        error: error instanceof Error ? error.message : String(error),
                        broadcastId: broadcast.id,
                        client: clientName,
                        attempt: retryCount
                    });

                    await sleep(retryDelay);
                }
            }
        }

        return {
            success: failedCount === 0,
            processedCount,
            failedCount
        };
    } catch (error) {
        return {
            success: false,
            processedCount: 0,
            failedCount: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}