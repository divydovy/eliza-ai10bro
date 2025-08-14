import { Action, Content } from "@elizaos/core";
import { processBroadcastQueue } from "./service";
import { ProcessQueueParams } from "./types";
import { BroadcastClient } from "../../types";
import { BroadcastDB } from "../../db/operations";

export const processQueueAction: Action = {
    name: "processQueue",
    description: "Process the broadcast message queue",
    similes: [
        "PROCESS_QUEUE",
        "HANDLE_BROADCASTS",
        "SEND_BROADCASTS",
        "PROCESS_BROADCASTS"
    ],
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Please process the broadcast queue now."
                } as Content
            },
            {
                user: "assistant",
                content: {
                    text: "I'll process the broadcast queue to send any pending messages. Processing the queue now..."
                } as Content
            }
        ]
    ],
    validate: async (_runtime, _message) => {
        return true; // Always allow queue processing
    },
    handler: async (runtime, message) => {
        try {
            const params: ProcessQueueParams = {
                client: message.content.client as BroadcastClient,
                maxRetries: typeof message.content.maxRetries === 'number' ? message.content.maxRetries : undefined,
                retryDelay: typeof message.content.retryDelay === 'number' ? message.content.retryDelay : undefined
            };

            const db = new BroadcastDB(runtime.databaseAdapter.db);
            const result = await processBroadcastQueue(runtime, params, db);

            if (result.success) {
                runtime.databaseAdapter.log({
                    type: "QUEUE_PROCESSED",
                    body: {
                        status: "success",
                        processedCount: result.processedCount,
                        failedCount: result.failedCount
                    },
                    userId: message.userId,
                    roomId: message.roomId
                });
                return {
                    success: true,
                    message: `Successfully processed broadcast queue. Processed ${result.processedCount} messages, with ${result.failedCount} failures.`
                };
            } else {
                runtime.databaseAdapter.log({
                    type: "QUEUE_ERROR",
                    body: {
                        status: "error",
                        error: result.error
                    },
                    userId: message.userId,
                    roomId: message.roomId
                });
                return {
                    success: false,
                    message: `Failed to process broadcast queue: ${result.error}`
                };
            }
        } catch (error) {
            runtime.databaseAdapter.log({
                type: "QUEUE_ERROR",
                body: {
                    status: "error",
                    error: String(error)
                },
                userId: message.userId,
                roomId: message.roomId
            });
            return {
                success: false,
                message: `Error processing broadcast queue: ${error}`
            };
        }
    }
};

export { processBroadcastQueue } from './service';