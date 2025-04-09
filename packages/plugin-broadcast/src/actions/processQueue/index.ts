import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { processBroadcastQueue } from "./service";
import { ProcessQueueParams } from "./types";

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
                    text: "Process the broadcast queue"
                }
            },
            {
                user: "assistant",
                content: {
                    text: "I'll process the broadcast queue now.",
                    action: "processQueue",
                    source: "broadcast"
                }
            }
        ]
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; // Always allow queue processing
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            const broadcasts = await runtime.databaseAdapter.getMemories({
                roomId: message.roomId,
                tableName: "broadcasts",
                agentId: runtime.agentId,
                count: 10
            });

            await runtime.databaseAdapter.log({
                body: { count: broadcasts.length },
                userId: message.userId,
                roomId: message.roomId,
                type: "QUEUE_PROCESSING_STARTED"
            });

            for (const broadcast of broadcasts) {
                try {
                    await runtime.databaseAdapter.removeMemory(broadcast.id!, "broadcasts");
                    await runtime.databaseAdapter.log({
                        body: { broadcast },
                        userId: message.userId,
                        roomId: message.roomId,
                        type: "BROADCAST_PROCESSED"
                    });
                } catch (error) {
                    await runtime.databaseAdapter.log({
                        body: { error, broadcast },
                        userId: message.userId,
                        roomId: message.roomId,
                        type: "BROADCAST_PROCESSING_ERROR"
                    });
                }
            }

            return broadcasts;
        } catch (error) {
            await runtime.databaseAdapter.log({
                body: { error },
                userId: message.userId,
                roomId: message.roomId,
                type: "QUEUE_PROCESSING_ERROR"
            });
            throw error;
        }
    }
};

export { processBroadcastQueue } from './service';