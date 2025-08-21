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

Create a compelling broadcast (max ${maxLength - 50} chars) that:
- Focuses on the breakthrough itself and its practical significance
- Reveals why it matters for humanity's future  
- Ends with ONE specific action (researcher to follow, company to track, or platform to use)
- ONLY includes a sharp nature comparison at the very end if it adds meaningful insight
- Uses actual source URLs, never generic terms like 'github' or 'obsidian'

Requirements:
- Lead with the innovation and its impact
- Be precise and direct - no formulaic structures
- Save any nature metaphors for the final sentence only
- ${client === "telegram" ? "Use the space for rich technical detail." : "Every word must count - maximum impact."}
${sourceUrl ? `Source URL available: ${sourceUrl}` : ""}

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