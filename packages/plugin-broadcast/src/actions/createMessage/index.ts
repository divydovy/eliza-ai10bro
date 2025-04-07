import { Action, IAgentRuntime, Memory } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { createBroadcastMessage } from "./service";
import { CreateMessageParams } from "./types";

export const createMessageAction: Action = {
    name: "CREATE_BROADCAST",
    description: "Creates a new broadcast message from a document",
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
        return true; // Always allow broadcast creation
    },
    parameters: {
        documentId: {
            type: "string",
            description: "ID of the document to create broadcast from"
        },
        client: {
            type: "string",
            description: "Client to create broadcast for (telegram or twitter)",
            optional: true
        },
        maxLength: {
            type: "number",
            description: "Maximum length of the broadcast message",
            optional: true
        },
        prompt: {
            type: "string",
            description: "Custom prompt for generating the broadcast message",
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
        const params = message.content as CreateMessageParams;

        const result = await createBroadcastMessage(runtime, params, db);

        if (!result.success) {
            runtime.logger.error("Failed to create broadcast message", {
                error: result.error,
                documentId: params.documentId
            });
            return false;
        }

        runtime.logger.info("Created broadcast message", {
            broadcastId: result.broadcastId,
            documentId: params.documentId,
            client: params.client
        });

        return true;
    }
};