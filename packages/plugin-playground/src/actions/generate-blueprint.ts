import { Action, IAgentRuntime, Memory, State, elizaLogger, UUID } from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";

export interface BlueprintStep {
    step: string;
    [key: string]: any;
}

export interface BlueprintContent {
    $schema: string;
    meta: {
        title: string;
        description: string;
        author: string;
        categories: string[];
    };
    landingPage: string;
    preferredVersions: {
        php: string;
        wp: string;
    };
    features: {
        networking: boolean;
    };
    steps: BlueprintStep[];
}

const generateBlueprintAction: Action = {
    name: "GENERATE_BLUEPRINT",
    similes: ["CREATE_BLUEPRINT", "MAKE_BLUEPRINT"],
    description: "Generate a WordPress Blueprint JSON based on user consultation",
    examples: [
        [
            {
                user: "customer",
                content: {
                    text: "Can you generate a blueprint for my store now?"
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
        elizaLogger.info("Handling GENERATE_BLUEPRINT request");
        
        const prompt = `Based on our conversation about your store requirements, I will now generate a WordPress blueprint with all necessary configurations.

Please note that I will format my response in a specific way to ensure proper processing:

BLUEPRINT_JSON
{
    "$schema": "https://playground.wordpress.net/blueprint-schema.json",
    "meta": {
        "title": "Your Store Name",
        "description": "A detailed store description",
        "author": "Woobot",
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
        {
            "step": "resetData"
        },
        {
            "step": "setSiteOptions",
            "options": {
                "blogname": "Store Name",
                "woocommerce_default_country": "PT",
                "woocommerce_currency": "EUR",
                "woocommerce_weight_unit": "kg",
                "woocommerce_dimension_unit": "cm",
                "woocommerce_default_language": "pt_PT",
                "WPLANG": "pt_PT",
                "timezone_string": "Europe/Lisbon"
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
}
BLUEPRINT_JSON

After providing the JSON blueprint above, I'll explain the configuration in a user-friendly way.

Please generate a complete blueprint for the store we've been discussing, following this exact format but with appropriate values based on our conversation.`;

        return {
            response: prompt,
            state: {
                interceptNext: true
            }
        };
    }
};

const interceptBlueprintAction: Action = {
    name: "INTERCEPT_BLUEPRINT",
    description: "Intercept and process the blueprint JSON from the agent's response",
    similes: [],
    examples: [],
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        elizaLogger.debug("Validating INTERCEPT_BLUEPRINT action", {
            hasState: !!state,
            state,
            messageId: message.id,
            messageLength: message.content.text?.length,
            includesDelimiter: message.content.text?.includes("BLUEPRINT_JSON")
        });
        return state?.interceptNext === true;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
        elizaLogger.info("Intercepting blueprint response", {
            messageId: message.id,
            userId: message.userId,
            roomId: message.roomId,
            state
        });

        try {
            // Extract the JSON between delimiters
            elizaLogger.debug("Looking for blueprint JSON in response", {
                messageLength: message.content.text?.length,
                firstChars: message.content.text?.substring(0, 50)
            });

            const match = message.content.text?.match(/BLUEPRINT_JSON\n([\s\S]*?)\nBLUEPRINT_JSON/);
            if (!match?.[1]) {
                elizaLogger.warn("No blueprint JSON found in response", {
                    messageId: message.id,
                    messageContent: message.content.text
                });
                return false;
            }

            elizaLogger.debug("Found blueprint JSON", {
                jsonLength: match[1].length,
                firstChars: match[1].substring(0, 50)
            });

            // Parse and validate the blueprint
            const blueprint = JSON.parse(match[1]) as BlueprintContent;
            elizaLogger.debug("Parsed blueprint", { 
                blueprint,
                title: blueprint.meta.title,
                pluginCount: blueprint.steps.filter(s => s.step === "installPlugin").length
            });

            // Store the blueprint
            const blueprintId = uuidv4() as UUID;
            const conversationId = uuidv4() as UUID;

            elizaLogger.debug("Storing blueprint", { 
                blueprintId, 
                conversationId,
                messageId: message.id
            });

            await runtime.databaseAdapter.createMemory(
                {
                    id: blueprintId,
                    userId: message.userId,
                    agentId: runtime.agentId,
                    roomId: message.roomId,
                    content: {
                        text: JSON.stringify(blueprint),
                        metadata: {
                            conversationId
                        }
                    },
                    embedding: new Array(1536).fill(0)
                },
                "wp_blueprints"
            );

            elizaLogger.debug("Blueprint stored successfully", { 
                blueprintId, 
                conversationId,
                messageId: message.id
            });

            // Let the original message continue through
            elizaLogger.debug("Letting original message continue", {
                messageId: message.id,
                responseLength: message.content.text?.length
            });
            return false;
        } catch (error) {
            elizaLogger.error("Error processing blueprint JSON:", error, {
                messageId: message.id,
                userId: message.userId,
                roomId: message.roomId,
                state
            });
            return false;
        }
    }
};

function formatBlueprintDisplay(blueprint: BlueprintContent): string {
    const plugins = blueprint.steps
        .filter(step => step.step === "installPlugin")
        .map(step => (step as any).pluginZipFile?.slug || '')
        .filter(Boolean);

    const loginStep = blueprint.steps.find(s => s.step === "login");
    
    return `Here's your store blueprint:

📋 Store Type: ${blueprint.meta.title}
${blueprint.meta.description}

🔌 Extensions:
${plugins.map(plugin => `- ${plugin}`).join('\n')}

⚙️ Technical Details:
- WordPress ${blueprint.preferredVersions.wp}
- PHP ${blueprint.preferredVersions.php}
- Pretty permalinks enabled
- WooCommerce onboarding skipped for faster setup

🔐 Login Credentials (save these!):
- Username: ${loginStep?.username}
- Password: ${loginStep?.password}

The blueprint has been saved and is ready for deployment. When you're ready to create your store, use the CREATE_PLAYGROUND command.

Note: You'll need to complete your store configuration during the setup process.`;
}

// Export the actions
export const actions: Action[] = [
    generateBlueprintAction,
    interceptBlueprintAction
];

// Export individual actions for direct use
export { generateBlueprintAction, interceptBlueprintAction }; 