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

        // Extract source URL from document content if present
        const contentText = document.content.text || '';
        const sourceMatch = contentText.match(/source:\s*(https?:\/\/[^\s]+)/i);
        const sourceUrl = sourceMatch ? sourceMatch[1] : null;

        // Use character-specific broadcast prompt for sharp, concise insights
        const characterPrompt = runtime.character.settings?.broadcastPrompt;
        
        const basePrompt = params.prompt || characterPrompt ||
            "Extract the most compelling insight from this content. Focus on what's truly remarkable or unexpected. Be precise and vivid. No preambles or generic statements.";

        const prompt = `${basePrompt}

Content to analyze:
${document.content.text}

MISSION CONTEXT: You're building a movement toward a more humane, sustainable, beautiful future. Help people understand both WHY this matters and HOW to engage based on the technology's maturity.

Action Framework (choose based on content):
- EARLY RESEARCH: "Follow [specific researcher/lab]. Subscribe to [journal/newsletter]. Join [community/discord]."
- EMERGING TECH: "Track [company/project]. Consider applications in [specific industry]. Watch for [key milestone]."  
- SCALING NOW: "Invest via [platform/fund]. Partner through [program]. Implement in [specific use case]."
- AVAILABLE TODAY: "Access at [platform]. Start with [specific action]. Compare to [alternative]."

Critical requirements:
- STRICT LIMIT: ${maxLength - 50} characters (to allow for source URL)
- Write ONE complete thought - do not exceed the limit
- Structure: [Nature parallel] → [Why this changes the game] → [Specific action based on maturity]
- Include concrete details: timeline, scale, key players
- NO PLATITUDES: Be specific. Name names. Give real actions.
${client === "telegram" ? "- Can be more detailed but MUST stay under limit" : "- Ultra-concise, maximum impact"}
${sourceUrl ? "- Source URL will be added automatically, don't include it" : ""}

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