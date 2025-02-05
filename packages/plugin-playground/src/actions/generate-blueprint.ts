import { Action, IAgentRuntime, Memory, elizaLogger, State, HandlerCallback } from "@elizaos/core";

// 1. Intercept the message using the action
// 2. Suppress the default message
// 3. Use our custom prompt (i.e. use this blueprint template to generate a WordPress Blueprint JSON that MUST follow the playground.wordpress.net schema format with $schema, meta, and steps fields. Used to create a working WooCommerce store configuration.) to the LLM along with recent messages (i.e. just tweak default agent behaviour by injecting this prompt).
// 4. Receive the response from the LLM and send it (including the blueprint JSON) back to the chat

const generateBlueprintAction: Action = {
    name: "GENERATE_BLUEPRINT",
    similes: ["GENERATE_BLUEPRINT", "CREATE_BLUEPRINT", "MAKE_BLUEPRINT"],
    description: "Generate a WordPress Blueprint JSON for configuring a WooCommerce store",
    examples: [
        [
            {
                user: "customer",
                content: {
                    text: "Can you generate a blueprint for my store?"
                }
            }
        ]
    ],
    suppressInitialMessage: true,
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.info("Validating GENERATE_BLUEPRINT request");
        const text = message.content.text?.toLowerCase() || '';
        const isGenerateBlueprint = text === "generate_blueprint" ||
                                  text === "generate blueprint" ||
                                  text === "GENERATE_BLUEPRINT";
        if (isGenerateBlueprint) {
            message.content = {
                ...message.content,
                action: "GENERATE_BLUEPRINT",
                normalized: "GENERATE_BLUEPRINT",
                shouldHandle: true
            };
            elizaLogger.info("Claiming GENERATE_BLUEPRINT command");
            return true;
        }
        elizaLogger.info("Failed to validate GENERATE_BLUEPRINT command");
        return false;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State, options?: { [key: string]: unknown }, callback?: HandlerCallback): Promise<boolean> => {
        elizaLogger.info("Handling GENERATE_BLUEPRINT request");
        if (callback) {
            callback({
                text: "🎯 Test message from GENERATE_BLUEPRINT handler"
            });
        }
        return true;
    }
};

// Export the action
export const actions = [generateBlueprintAction];
export { generateBlueprintAction };