import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { processBroadcastQueue } from "./service";
import { ProcessQueueParams } from "./types";

export const processQueueAction: Action = {
    name: "PROCESS_BROADCAST_QUEUE",
    description: "Process pending broadcast messages in the queue",
    parameters: {
        client: {
            type: "string",
            description: "Client to process broadcasts for (telegram or twitter)",
            optional: true
        },
        maxRetries: {
            type: "number",
            description: "Maximum number of retries for failed broadcasts",
            optional: true
        },
        retryDelay: {
            type: "number",
            description: "Delay in milliseconds between retries",
            optional: true
        }
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: unknown,
        options: { [key: string]: unknown } = {}
    ): Promise<boolean> => {
        const db = new BroadcastDB(runtime.db);
        const params = message.content as ProcessQueueParams;

        const result = await processBroadcastQueue(runtime, params, db);

        if (!result.success) {
            runtime.logger.error("Failed to process broadcast queue", {
                error: result.error,
                processedCount: result.processedCount,
                failedCount: result.failedCount
            });
            return false;
        }

        runtime.logger.info("Processed broadcast queue", {
            processedCount: result.processedCount,
            failedCount: result.failedCount,
            client: params.client
        });

        return true;
    }
};