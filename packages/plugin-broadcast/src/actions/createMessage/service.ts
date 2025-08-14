import { IAgentRuntime, Memory, ModelClass, generateText } from "@elizaos/core";
import { BroadcastDB } from "../../db/operations";
import { CreateMessageParams, CreateMessageResult } from "./types";
import { randomUUID } from "node:crypto";
import { UUID } from "@elizaos/core";

export async function createBroadcastMessage(
    runtime: IAgentRuntime,
    params: CreateMessageParams,
    db: BroadcastDB
): Promise<CreateMessageResult> {
    try {
        const client = params.client || "telegram";
        const maxLength = params.maxLength || (client === "telegram" ? 1000 : 280);
        const broadcastId = randomUUID();

        // Get document content
        const document = await runtime.documentsManager.getMemoryById(params.documentId as UUID);
        if (!document) {
            return {
                success: false,
                error: `Document not found: ${params.documentId}`
            };
        }

        // Use fallback broadcast prompt
        const basePrompt = params.prompt ||
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

        // Create a new memory for the broadcast message
        const memoryId = randomUUID();
        const broadcastMemory: Memory = {
            id: memoryId,
            userId: runtime.agentId,
            agentId: runtime.agentId,
            roomId: runtime.agentId, // Using agentId as roomId
            content: { text: finalText, type: "broadcast" },
            createdAt: Date.now(),
        };
        await runtime.messageManager.createMemory(broadcastMemory, false);

        // Store in database, referencing the new memory
        const id = db.createBroadcast(params.documentId, client, memoryId);

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