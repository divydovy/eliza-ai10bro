import { Action, IAgentRuntime, Memory, elizaLogger } from "@elizaos/core";

const generateBlueprintAction: Action = {
    name: "GENERATE_BLUEPRINT",
    similes: ["CREATE_BLUEPRINT", "MAKE_BLUEPRINT", "GENERATE_PLAYGROUND_BLUEPRINT"],
    description: "Generate a WordPress Blueprint JSON that MUST follow the playground.wordpress.net schema format with $schema, meta, and steps fields. Used to create a working WooCommerce store configuration.",
    suppressInitialMessage: true,  // Suppress default, let LLM handle response
    examples: [
        [
            {
                user: "customer",
                content: {
                    text: "Can you generate a blueprint for my store now?"
                }
            },
            {
                user: "WooGuide",
                content: {
                    text: "I've created a blueprint for your store! It includes essential WooCommerce setup and configurations.",
                    blueprint: `{
    "$schema": "https://playground.wordpress.net/blueprint-schema.json",
    "meta": {
        "title": "Example Store",
        "description": "A WooCommerce store selling products",
        "author": "WooGuide",
        "categories": ["ecommerce"]
    },
    "landingPage": "/shop",
    "preferredVersions": {
        "php": "8.2",
        "wp": "6.4"
    },
    "features": {
        "networking": true
    },
    "steps": [
        { "step": "resetData" },
        {
            "step": "setSiteOptions",
            "options": {
                "blogname": "Example Store",
                "blogdescription": "Your store tagline",
                "woocommerce_currency": "EUR",
                "timezone_string": "Europe/Paris",
                "WPLANG": "fr_FR"
            }
        },
        {
            "step": "installPlugin",
            "pluginZipFile": {
                "resource": "wordpress.org/plugins",
                "slug": "woocommerce"
            },
            "options": {
                "activate": true
            }
        }
    ]
}`,
                    action: "GENERATE_BLUEPRINT"
                }
            }
        ]
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        const text = message.content.text?.toLowerCase() || '';
        return text === "generate_blueprint" ||
               text === "generate blueprint" ||
               text.includes("generate blueprint");
    },
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.info("Starting GENERATE_BLUEPRINT handler");
        elizaLogger.debug("Message content:", message.content);

        // Return empty response to allow LLM to handle it
        return { response: {} };
    }
};

// Export the action
export const actions = [generateBlueprintAction];
export { generateBlueprintAction };