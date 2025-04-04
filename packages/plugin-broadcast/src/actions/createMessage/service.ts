import { IAgentRuntime, Memory, ModelClass, generateText } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { CreateMessageParams, CreateMessageResult } from "./types";
import { randomUUID } from "node:crypto";

export async function createBroadcastMessage(
    runtime: IAgentRuntime,
    params: CreateMessageParams,
    db: BroadcastDB
): Promise<CreateMessageResult> {
    try {
        const client = params.client || runtime.character.settings?.defaultClient || "telegram";
        const maxLength = params.maxLength || (client === "telegram" ? 1000 : 280);
        const broadcastId = randomUUID();

        // Get document content
        const document = await runtime.memory.get(params.documentId);
        if (!document) {
            return {
                success: false,
                error: `Document not found: ${params.documentId}`
            };
        }

        // Use character's broadcast prompt if available
        const basePrompt = params.prompt ||
            runtime.character.settings?.broadcastPrompt ||
            "Create a single focused message about what you learned from this content. Be specific about the insight, why it matters, and what it suggests.";

        const prompt = `${basePrompt}

Content to analyze:
${document.content.text}

Additional requirements:
- Message must be exactly ${maxLength} characters
${client === "telegram" ? "- You may include more detail and context" : ""}

[BROADCAST_REQUEST:${broadcastId}]`;

        const broadcastText = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.SMALL,
            maxSteps: 1
        });

        // Extract the actual broadcast message from between the tags if present
        const messageMatch = broadcastText.match(/\[BROADCAST:.*?\](.*?)(?=\[|$)/s);
        const finalText = messageMatch ? messageMatch[1].trim() : broadcastText.trim();

        // Store in database
        const id = db.createBroadcast(params.documentId, client, finalText);

        return {
            success: true,
            broadcastId: id
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}