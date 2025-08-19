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

        // Extract source URL from document metadata (check multiple locations)
        const metadata = document.content.metadata || {};
        const sourceUrl = metadata.frontmatter?.source || 
                         metadata.url || 
                         document.content.url ||
                         (document.content.source !== 'obsidian' && document.content.source !== 'github' ? 
                          document.content.source : null);

        // Use character-specific broadcast prompt for sharp, concise insights
        const characterPrompt = runtime.character.settings?.broadcastPrompt;
        
        const basePrompt = params.prompt || characterPrompt ||
            "Extract the most compelling insight from this content. Focus on what's truly remarkable or unexpected. Be precise and vivid. No preambles or generic statements.";

        const prompt = `${basePrompt}

Content to analyze:
${document.content.text}

Create a flowing narrative (max ${maxLength - 50} chars) that:
- Connects this innovation to a pattern in nature
- Reveals why it matters for humanity's future  
- Ends with ONE specific action (researcher to follow, company to track, or platform to use)
- Uses vivid, sensory language that brings the innovation to life

Avoid formulaic structures or section headers. Tell a compelling story that moves naturally from observation to action.
${client === "telegram" ? "You have more space for rich detail." : "Every word must count - maximum impact."}
${sourceUrl ? "Source URL will be added automatically." : ""}

[BROADCAST_REQUEST:${broadcastId}]`;

        const broadcastText = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.SMALL,
            maxSteps: 1
        });

        // Extract the actual broadcast message from between the tags if present
        const messageMatch = broadcastText.match(/\[BROADCAST:.*?\](.*?)(?=\[|$)/s);
        let finalText = messageMatch ? messageMatch[1].trim() : broadcastText.trim();
        
        // Add source URL at the end if available
        if (sourceUrl) {
            finalText = `${finalText}\n\n🔗 Source: ${sourceUrl}`;
        }

        // Store broadcast in database with generated content
        const id = db.createBroadcast(params.documentId, client, finalText, 0.8, 'pending');

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