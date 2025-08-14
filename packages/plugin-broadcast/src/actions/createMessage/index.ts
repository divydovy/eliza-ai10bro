import { Action, Content } from "@elizaos/core";
import { BroadcastClient } from "../../types";
import { createBroadcastMessage } from "./service";
import { BroadcastDB } from "../../db/operations";

export interface CreateMessageParams {
    documentId: string;
    client?: BroadcastClient;
    maxLength?: number;
    prompt?: string;
}

export const createMessageAction: Action = {
    name: "CREATE_MESSAGE",
    similes: ["CREATE_BROADCAST", "NEW_BROADCAST", "BROADCAST_MESSAGE"],
    description: "Creates a new broadcast message from the given content",
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Create a broadcast message for this document",
                    documentId: "doc-123"
                } as Content
            },
            {
                user: "assistant",
                content: {
                    text: "I'll create a broadcast message for document doc-123",
                    action: "CREATE_MESSAGE"
                } as Content
            }
        ],
        [
            {
                user: "user",
                content: {
                    text: "Make a Twitter broadcast for doc-abc with max length 280",
                    documentId: "doc-abc",
                    client: "twitter",
                    maxLength: 280
                } as Content
            },
            {
                user: "assistant",
                content: {
                    text: "Creating a Twitter broadcast for document doc-abc with 280 character limit",
                    action: "CREATE_MESSAGE"
                } as Content
            }
        ]
    ],
    validate: async (runtime, message) => {
        const content = message.content as Content & { documentId: string };
        return !!content.documentId;
    },
    handler: async (runtime, message) => {
        const content = message.content as Content & {
            documentId: string;
            client?: BroadcastClient;
            maxLength?: number;
            prompt?: string;
        };

        const params: CreateMessageParams = {
            documentId: content.documentId,
            client: content.client,
            maxLength: content.maxLength,
            prompt: content.prompt
        };

        try {
            const db = new BroadcastDB(runtime.databaseAdapter.db);
            const result = await createBroadcastMessage(runtime, params, db);
            await runtime.databaseAdapter.log({
                body: {
                    success: true,
                    broadcastId: result.broadcastId,
                    documentId: params.documentId,
                    client: params.client
                },
                userId: message.userId,
                roomId: message.roomId,
                type: "BROADCAST_CREATED"
            });
            return result;
        } catch (error) {
            await runtime.databaseAdapter.log({
                body: {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    documentId: params.documentId,
                    client: params.client
                },
                userId: message.userId,
                roomId: message.roomId,
                type: "BROADCAST_ERROR"
            });
            throw error;
        }
    }
};