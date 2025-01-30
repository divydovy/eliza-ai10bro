import {
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    Action,
    UUID,
} from "@elizaos/core";
import { WooCommerceBlueprint } from "../types/woocommerce";
import { uploadBlueprint } from "./woocommerce";

// Base URL for WordPress Playground
const PLAYGROUND_BASE_URL = "https://playground.wordpress.net";

// Default blueprint URL for basic WordPress setup
const DEFAULT_BLUEPRINT_URL = "https://raw.githubusercontent.com/WordPress/blueprints/trunk/blueprints/stylish-press/blueprint.json";

// Save blueprint as a memory
async function saveBlueprint(
    runtime: IAgentRuntime,
    blueprint: WooCommerceBlueprint,
    roomId: UUID,
    agentId: UUID,
    userId: UUID
): Promise<void> {
    const memory: Memory = {
        content: {
            text: `Blueprint for ${blueprint.meta?.title || 'store'}`,
            blueprint: blueprint,
        },
        roomId,
        agentId,
        userId,
    };

    await runtime.databaseAdapter.createMemory(memory, "blueprints");
    elizaLogger.info("Saved blueprint to memory");
}

// Get the latest blueprint for a room
async function getLatestBlueprint(
    runtime: IAgentRuntime,
    roomId: UUID
): Promise<WooCommerceBlueprint | null> {
    const memories = await runtime.databaseAdapter.getMemories({
        roomId,
        tableName: "blueprints",
        count: 1,
        agentId: runtime.agentId
    });

    if (memories.length === 0) {
        elizaLogger.info("No blueprint found for room");
        return null;
    }

    const blueprint = memories[0].content.blueprint as WooCommerceBlueprint;
    elizaLogger.info("Retrieved latest blueprint from memory");
    return blueprint;
}

export const playgroundAction: Action = {
    name: "CREATE_PLAYGROUND",
    similes: [
        "CREATE_PLAYGROUND",
        "create playground",
        "CREATE PLAYGROUND",
        "Create Playground",
        "Create playground"
    ],
    description: "Create a WordPress playground environment from a blueprint",
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State, _options?: { [key: string]: unknown }, callback?: HandlerCallback) => {
        try {
            elizaLogger.info("Validating playground creation");

            // Ensure the action is set correctly
            message.content = {
                ...message.content,
                action: "CREATE_PLAYGROUND"
            };

            // First check if we have a blueprint in the message
            if (message.content?.blueprint && typeof message.content.blueprint === 'object') {
                elizaLogger.info("Using provided blueprint object");
                // Save the blueprint for future use
                await saveBlueprint(
                    runtime,
                    message.content.blueprint as WooCommerceBlueprint,
                    message.roomId,
                    runtime.agentId,
                    message.userId
                );
                return true;
            }

            // Check if we have a previously saved blueprint
            const savedBlueprint = await getLatestBlueprint(runtime, message.roomId);
            if (savedBlueprint) {
                elizaLogger.info("Using previously saved blueprint from memory");
                message.content = {
                    ...message.content,
                    blueprint: savedBlueprint
                };
                return true;
            }

            // If we have store options, generate a blueprint
            const options = message.content?.options as Record<string, string> | undefined;
            if (options && options.storeName && options.storeDescription &&
                options.currency && options.country) {
                elizaLogger.info("Generating blueprint from valid store options");
                const generateBlueprintAction = runtime.actions.find(a => a.name === "GENERATE_BLUEPRINT");
                if (generateBlueprintAction) {
                    const blueprintMessage = {
                        ...message,
                        content: {
                            ...message.content,
                            action: "GENERATE_BLUEPRINT",
                            options: {
                                store: {
                                    storeName: options.storeName,
                                    storeDescription: options.storeDescription,
                                    currency: options.currency,
                                    country: options.country
                                }
                            }
                        }
                    };

                    const result = await generateBlueprintAction.handler(runtime, blueprintMessage, state, {}, async (response) => {
                        if (response.blueprint) {
                            message.content = {
                                ...message.content,
                                action: "CREATE_PLAYGROUND",
                                blueprint: response.blueprint
                            };
                            // Save the generated blueprint
                            await saveBlueprint(
                                runtime,
                                response.blueprint as WooCommerceBlueprint,
                                message.roomId,
                                runtime.agentId,
                                message.userId
                            );
                        }
                        return [];
                    });
                    if (!result) {
                        elizaLogger.error("Failed to generate blueprint");
                        return false;
                    }
                    return true;
                }
            }

            // If we get here, we have neither a blueprint nor valid options
            elizaLogger.error("No blueprint or valid store options provided");
            if (callback) {
                callback({
                    text: "I don't see any blueprint to use. Have you created a blueprint for your store yet? If not, let me help you create one! Please tell me about your store:\n" +
                          "- What's the store name?\n" +
                          "- What products will you sell?\n" +
                          "- Which country are you based in?\n" +
                          "- What currency will you use?",
                    action: "CREATE_PLAYGROUND",
                    error: true
                });
            }
            return false;
        } catch (error) {
            elizaLogger.error("Error in playground validation:", error);
            return false;
        }
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.info("Starting playground creation handler");

        try {
            // At this point we should always have a blueprint since validate() ensures it
            if (!message.content?.blueprint || typeof message.content.blueprint !== 'object') {
                throw new Error("Blueprint is required to create a playground");
            }

            elizaLogger.info("Using custom blueprint");
            const blueprint = message.content.blueprint as WooCommerceBlueprint;

            // Upload the blueprint and get the URL
            elizaLogger.info("Uploading blueprint...");
            const blueprintUrl = await uploadBlueprint(blueprint);
            elizaLogger.info(`Blueprint uploaded to ${blueprintUrl}`);

            if (callback) {
                const response = {
                    text: `Here's your ${blueprint.meta?.title || 'store'} playground ready to go!\n\n` +
                          `🌐 URL: ${PLAYGROUND_BASE_URL}/?blueprint-url=${encodeURIComponent(blueprintUrl)}\n\n` +
                          `This gives you a fresh store with:\n` +
                          `• WooCommerce installed and activated\n` +
                          `• Store name set as '${blueprint.meta?.title || 'Default Store'}'\n` +
                          `• ${blueprint.steps.find(s => s.step === 'setSiteOptions')?.options?.woocommerce_currency || 'USD'} currency configured \n` +
                          `• ${blueprint.steps.find(s => s.step === 'setSiteOptions')?.options?.woocommerce_default_country || 'US'} location settings\n\n` +
                          `Would you like me to help you start adding your products and categories?`,
                    markdown: true
                };

                elizaLogger.info("Sending response:", response);
                callback(response);
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in playground creation:", error);
            if (callback) {
                callback({
                    text: `Sorry, I encountered an error: ${error.message}`,
                    action: "CREATE_PLAYGROUND",
                    error: true
                });
            }
            return false;
        }
    },
    suppressInitialMessage: true,
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "create playground"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Creating a WordPress playground with WooCommerce...",
                    action: "CREATE_PLAYGROUND",
                    blueprint: {
                        $schema: "https://playground.wordpress.net/blueprint-schema.json",
                        preferredVersions: {
                            php: "8.3",
                            wp: "6.6"
                        },
                        features: {
                            networking: true
                        },
                        plugins: ["woocommerce"],
                        steps: [
                            {
                                step: "setSiteOptions",
                                options: {
                                    blogname: "Test Store",
                                    blogdescription: "Test Description",
                                    woocommerce_currency: "USD",
                                    woocommerce_default_country: "US"
                                }
                            }
                        ]
                    }
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a playground for my store",
                    options: {
                        storeName: "Daisy's Greeting Cards",
                        storeDescription: "Handcrafted cards for life's special moments",
                        currency: "EUR",
                        country: "BE"
                    }
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Creating a playground for your greeting card store...",
                    action: "CREATE_PLAYGROUND",
                    blueprint: {
                        $schema: "https://playground.wordpress.net/blueprint-schema.json",
                        meta: {
                            title: "Daisy's Greeting Cards",
                            description: "Handcrafted cards for life's special moments",
                            categories: ["WooCommerce", "Site"]
                        },
                        preferredVersions: {
                            php: "8.3",
                            wp: "6.6"
                        },
                        features: {
                            networking: true
                        },
                        plugins: ["woocommerce"],
                        steps: [
                            {
                                step: "setSiteOptions",
                                options: {
                                    blogname: "Daisy's Greeting Cards",
                                    blogdescription: "Handcrafted cards for life's special moments",
                                    woocommerce_currency: "EUR",
                                    woocommerce_default_country: "BE"
                                }
                            }
                        ]
                    }
                }
            }
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "help me create a blueprint"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll help you create a blueprint for your store. Please provide the following information:\n\n- Store name\n- Store description\n- Country where your store is based\n- Currency you'll use for transactions",
                    action: "GENERATE_BLUEPRINT"
                }
            }
        ]
    ]
};
