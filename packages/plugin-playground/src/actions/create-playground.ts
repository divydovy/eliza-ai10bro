import { Action, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import { generateBlueprintAction } from "./generate-blueprint";
import axios from "axios";

const extractBlueprintFromMessage = (text: string): string | null => {
    const blueprintMatch = text.match(/BLUEPRINT_JSON\s*({[\s\S]*?})\s*BLUEPRINT_JSON/);
    return blueprintMatch ? blueprintMatch[1] : null;
};

const uploadToTransferSh = async (blueprint: string): Promise<string> => {
    try {
        const response = await axios.put(
            'https://transfer.sh/blueprint.json',
            blueprint,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data.trim(); // transfer.sh returns the URL directly
    } catch (error) {
        elizaLogger.error('Error uploading to transfer.sh:', error);
        throw new Error('Failed to upload blueprint');
    }
};

const createPlaygroundAction: Action = {
    name: "CREATE_PLAYGROUND",
    similes: ["LAUNCH_PLAYGROUND", "START_PLAYGROUND", "OPEN_PLAYGROUND"],
    description: "Create a WordPress playground instance with the latest blueprint",
    examples: [
        [
            {
                user: "customer",
                content: {
                    text: "Can you create a playground with my blueprint?"
                }
            }
        ]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text?.toLowerCase() || '';
        return text.includes("playground") ||
               text.includes("launch") ||
               text.includes("preview");
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.info("Handling CREATE_PLAYGROUND request");

        // Get recent messages from the conversation
        const recentMessages = await runtime.messageManager.getMemories({
            roomId: message.roomId,
            count: 3,
            unique: false
        });

        // Look for blueprint in recent messages
        let blueprint: string | null = null;
        for (const msg of recentMessages.reverse()) {
            if (msg.content.text) {
                blueprint = extractBlueprintFromMessage(msg.content.text);
                if (blueprint) break;
            }
        }

        // If no blueprint found, suggest generating one
        if (!blueprint) {
            return {
                response: "I couldn't find a recent blueprint. Would you like me to generate one for you first? Just say 'yes' and I'll help you create a blueprint before setting up the playground.",
                nextAction: generateBlueprintAction.name
            };
        }

        try {
            // Upload blueprint to transfer.sh
            const uploadedUrl = await uploadToTransferSh(blueprint);

            // Create playground URL
            const playgroundUrl = `https://playground.wordpress.net?blueprint-url=${encodeURIComponent(uploadedUrl)}`;

            return {
                response: `I've created a playground instance with your blueprint! You can access it here:\n\n${playgroundUrl}\n\nThe playground will load with all your specified configurations. Feel free to explore and test everything.`
            };
        } catch (error) {
            elizaLogger.error('Error in CREATE_PLAYGROUND:', error);
            return {
                response: "I encountered an error while setting up the playground. Please try again in a few moments."
            };
        }
    }
};

export const actions = [createPlaygroundAction];
export { createPlaygroundAction };