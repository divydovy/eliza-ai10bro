import { Action, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";
import { generateBlueprintAction } from "./generate-blueprint";
import axios from "axios";

const extractBlueprintFromMessage = (text: string): string | null => {
    try {
        elizaLogger.info('Attempting to extract blueprint from message:', { messageLength: text.length });

        // Try to find a JSON object in the text
        const matches = text.match(/(\{[\s\S]*\})/g);
        elizaLogger.info('JSON-like matches found:', {
            matchCount: matches?.length || 0
        });

        if (!matches) return null;

        // Try each match to find valid JSON with required blueprint fields
        for (const match of matches) {
            try {
                elizaLogger.info('Attempting to parse potential JSON match:', {
                    matchLength: match.length,
                    preview: match.substring(0, 100) + '...'
                });

                const parsed = JSON.parse(match);
                elizaLogger.info('Successfully parsed JSON, checking blueprint structure:', {
                    hasSchema: Boolean(parsed.$schema),
                    schemaValue: parsed.$schema,
                    hasMeta: Boolean(parsed.meta),
                    hasSteps: Boolean(parsed.steps),
                    stepsIsArray: Array.isArray(parsed.steps)
                });

                // Validate it has the required blueprint structure
                if (
                    parsed.$schema?.includes('playground.wordpress.net') &&
                    parsed.meta &&
                    parsed.steps &&
                    Array.isArray(parsed.steps)
                ) {
                    elizaLogger.info('Valid blueprint found!');
                    return match;
                }
            } catch (error) {
                elizaLogger.info('Failed to parse JSON match:', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                continue;
            }
        }
        elizaLogger.info('No valid blueprint found in any JSON matches');
        return null;
    } catch (error) {
        elizaLogger.error('Error in extractBlueprintFromMessage:', error);
        return null;
    }
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
            count: 10,
            unique: false
        });

        elizaLogger.info('Searching through recent messages:', {
            messageCount: recentMessages.length,
            roomId: message.roomId
        });

        // Look for blueprint in recent messages
        let blueprint: string | null = null;
        for (const msg of recentMessages.reverse()) {
            if (msg.content.text) {
                elizaLogger.info('Checking message for blueprint:', {
                    messageId: msg.id,
                    messageLength: msg.content.text.length,
                    preview: msg.content.text.substring(0, 100) + '...'
                });

                blueprint = extractBlueprintFromMessage(msg.content.text);
                if (blueprint) {
                    elizaLogger.info('Blueprint found in message:', {
                        messageId: msg.id,
                        blueprintLength: blueprint.length,
                        blueprintPreview: blueprint.substring(0, 100) + '...'
                    });
                    break;
                }
            }
        }

        // If no blueprint found, suggest generating one
        if (!blueprint) {
            return {
                response: "I couldn't find a recent blueprint. Would you like me to help you generate one first? Just let me know what kind of store you'd like to create.",
                // Let the agent handle this naturally through examples
                // nextAction: generateBlueprintAction.name
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