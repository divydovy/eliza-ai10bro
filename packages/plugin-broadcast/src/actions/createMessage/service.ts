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

        // Extract actual HTTPS source URL from document metadata
        const metadata = document.content.metadata || {};
        let sourceUrl = metadata.frontmatter?.source || 
                        metadata.url || 
                        document.content.url ||
                        null;
        
        // If source is just "github" or "obsidian", try to extract actual URL from content
        if (!sourceUrl || sourceUrl === 'github' || sourceUrl === 'obsidian') {
            // Try to find an actual HTTPS URL in the document content
            const urlMatch = document.content.text?.match(/https?:\/\/[^\s\)]+/);
            sourceUrl = urlMatch ? urlMatch[0] : null;
        }

        // Use character-specific broadcast prompt for sharp, concise insights
        const characterPrompt = runtime.character.settings?.broadcastPrompt;
        
        const basePrompt = params.prompt || characterPrompt ||
            "Extract the most compelling insight from this content. Focus on what's truly remarkable or unexpected. Be precise and vivid. No preambles or generic statements.";

        const prompt = `${basePrompt}

Content to analyze:
${document.content.text}

Create a direct, factual broadcast that:
- States the core innovation/finding in the first sentence
- Explains its practical significance in clear, concrete terms
- Ends with ONE specific action (researcher, company, or platform to track)
- AVOIDS: metaphors, "as I...", "wandering", "gazing", poetic language, nature comparisons
- Uses actual source URLs, never generic terms like 'github' or 'obsidian'

Requirements:
- Lead with the breakthrough fact, not setup or context
- Be specific and technical - avoid vague statements
- NO metaphors, NO flowery language, NO personal observations
- ${client === "telegram" ? "Use the space for rich technical detail." : "Every word must count - maximum impact."}
${sourceUrl ? `Source URL available: ${sourceUrl}` : ""}`;

        const broadcastText = await generateText({
            runtime,
            context: prompt,
            modelClass: ModelClass.SMALL,
            maxSteps: 1
        });

        // Extract the actual broadcast message - remove any [BROADCAST:...] prefix
        let finalText = broadcastText.trim();
        
        // Remove [BROADCAST:xxx] prefix if present
        finalText = finalText.replace(/^\[BROADCAST:[^\]]*\]\s*/, '');
        
        // Also handle case where content is after the tag
        const messageMatch = broadcastText.match(/\[BROADCAST:.*?\](.*?)(?=\[|$)/s);
        if (messageMatch && messageMatch[1].trim()) {
            finalText = messageMatch[1].trim();
        }
        
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