import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { createBroadcastMessage } from "./service";
import { CreateMessageParams } from "./types";
import { BroadcastClient } from "../../types";

export const createMessageAction: Action = {
    name: "createMessage",
    description: "Create a broadcast message",
    similes: ["CREATE_MESSAGE", "NEW_BROADCAST", "SEND_BROADCAST"],
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Create a broadcast message saying 'Hello world!'"
                }
            },
            {
                user: "assistant",
                content: {
                    text: "I'll create a broadcast message with that content.",
                    action: "createMessage",
                    source: "broadcast"
                }
            }
        ]
    ],
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; // Always allow broadcast creation
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            const params: CreateMessageParams = {
                documentId: message.content.documentId as string || "default",
                client: message.content.client as BroadcastClient,
                maxLength: message.content.maxLength as number,
                prompt: message.content.prompt as string
            };

            const broadcast = await runtime.databaseAdapter.createMemory({
                ...message,
                content: {
                    ...message.content,
                    ...params
                }
            }, "broadcasts", true);

            await runtime.databaseAdapter.log({
                body: { broadcast },
                userId: message.userId,
                roomId: message.roomId,
                type: "BROADCAST_CREATED"
            });

            return broadcast;
        } catch (error) {
            await runtime.databaseAdapter.log({
                body: { error },
                userId: message.userId,
                roomId: message.roomId,
                type: "BROADCAST_ERROR"
            });
            throw error;
        }
    }
};