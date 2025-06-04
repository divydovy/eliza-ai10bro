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

// Generate a UUID v4 that matches the expected format
function generateUUID(): `${string}-${string}-${string}-${string}-${string}` {
  const segments = [
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 6),
    '4' + Math.random().toString(16).slice(2, 5),
    ((Math.random() * 4 | 8) << 24 | Math.random() * 0xffffff | 0).toString(16).slice(0, 4),
    Math.random().toString(16).slice(2, 12)
  ];
  return segments.join('-') as `${string}-${string}-${string}-${string}-${string}`;
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
        let availableClients = 0;

        // Initialize clients
        const clients: Partial<Record<BroadcastClient, TelegramBroadcastClient | TwitterBroadcastClient>> = {};

        if (!params.client || params.client === "telegram") {
            const botToken = runtime.character.settings?.secrets?.TELEGRAM_BOT_TOKEN;
            const chatIds = runtime.character.settings?.secrets?.TELEGRAM_CHAT_ID?.split(",").map(id => id.trim()) || [];

            if (botToken && chatIds.length > 0) {
                clients.telegram = new TelegramBroadcastClient(botToken, chatIds);
                availableClients++;
                runtime.databaseAdapter.log({
                    type: "info",
                    body: { message: "Telegram client initialized successfully" },
                    userId: generateUUID(),
                    roomId: generateUUID()
                });
            } else {
                runtime.databaseAdapter.log({
                    type: "warning",
                    body: { message: "Telegram client not initialized: missing credentials" },
                    userId: generateUUID(),
                    roomId: generateUUID()
                });
            }
        }

        if (!params.client || params.client === "twitter") {
            const apiKey = runtime.character.settings?.secrets?.TWITTER_API_KEY;
            const apiKeySecret = runtime.character.settings?.secrets?.TWITTER_API_KEY_SECRET;
            const accessToken = runtime.character.settings?.secrets?.TWITTER_ACCESS_TOKEN;
            const accessTokenSecret = runtime.character.settings?.secrets?.TWITTER_ACCESS_TOKEN_SECRET;

            if (apiKey && apiKeySecret && accessToken && accessTokenSecret) {
                clients.twitter = new TwitterBroadcastClient({
                    apiKey,
                    apiKeySecret,
                    accessToken,
                    accessTokenSecret
                });
                availableClients++;
                runtime.databaseAdapter.log({
                    type: "info",
                    body: { message: "Twitter client initialized successfully" },
                    userId: generateUUID(),
                    roomId: generateUUID()
                });
            } else {
                runtime.databaseAdapter.log({
                    type: "warning",
                    body: { message: "Twitter client not initialized: missing OAuth credentials" },
                    userId: generateUUID(),
                    roomId: generateUUID()
                });
            }
        }

        if (availableClients === 0) {
            return {
                success: false,
                processedCount: 0,
                failedCount: 0,
                error: "No broadcast clients available. Please check client credentials."
            };
        }

        // Process each client's queue
        for (const [clientName, client] of Object.entries(clients)) {
            if (!client) continue; // Skip undefined clients

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

                        runtime.databaseAdapter.log({
                            type: "info",
                            body: {
                                message: `Successfully sent broadcast via ${clientName}`,
                                broadcastId: broadcast.id
                            },
                            userId: generateUUID(),
                            roomId: generateUUID()
                        });
                    } else {
                        db.updateBroadcastStatus(broadcast.id, "failed");
                        failedCount++;
                        retryCount++;

                        runtime.databaseAdapter.log({
                            type: "error",
                            body: {
                                message: `Failed to send broadcast: ${result.error}`,
                                broadcastId: broadcast.id,
                                client: clientName,
                                attempt: retryCount,
                                content: broadcast.content,
                                errorStack: (typeof result.error === 'object' && result.error && 'stack' in result.error) ? (result.error as any).stack : undefined
                            },
                            userId: generateUUID(),
                            roomId: generateUUID()
                        });

                        await sleep(retryDelay);
                    }
                } catch (error) {
                    db.updateBroadcastStatus(broadcast.id, "failed");
                    failedCount++;
                    retryCount++;

                    runtime.databaseAdapter.log({
                        type: "error",
                        body: {
                            message: "Error processing broadcast",
                            error: error instanceof Error ? error.message : String(error),
                            errorStack: error instanceof Error && error.stack ? error.stack : undefined,
                            broadcastId: broadcast.id,
                            client: clientName,
                            attempt: retryCount,
                            content: broadcast.content
                        },
                        userId: generateUUID(),
                        roomId: generateUUID()
                    });

                    await sleep(retryDelay);
                }
            }
        }

        runtime.databaseAdapter.log({
            type: "info",
            body: {
                message: `Successfully processed ${processedCount} broadcast messages`
            },
            userId: generateUUID(),
            roomId: generateUUID()
        });
        return {
            success: failedCount === 0,
            processedCount,
            failedCount
        };
    } catch (error) {
        runtime.databaseAdapter.log({
            type: "error",
            body: {
                message: "Error processing broadcast queue",
                error: error instanceof Error ? error.message : String(error)
            },
            userId: generateUUID(),
            roomId: generateUUID()
        });
        return {
            success: false,
            processedCount: 0,
            failedCount: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}