import { Action, IAgentRuntime, Memory, elizaLogger, State, HandlerCallback } from "@elizaos/core";
import { generateBlueprintAction } from "./generate-blueprint";
import axios from "axios";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { blueprintSchema } from "../schema/blueprint";

// Initialize AJV with standard options
const ajv = new Ajv({
    removeAdditional: true,    // Remove properties not in schema
    useDefaults: true,         // Apply default values from schema
    coerceTypes: true,         // Add type coercion
    strict: false,             // Allow some flexibility in validation
    allErrors: true,           // Collect all errors, not just the first one
    verbose: true             // Include detailed error info
});

addFormats(ajv);

// Compile the schema
const validateBlueprint = ajv.compile(blueprintSchema);

const extractBlueprintFromMessage = (text: string): { blueprint: string | null, url: string | null } => {
    try {
        elizaLogger.info('Searching for blueprint URL in message:', {
            messageLength: text.length,
            messagePreview: text.substring(0, 100)
        });

        // Look for jsonbin.io URL in the entire content
        const urlMatch = text.match(/(https:\/\/api\.jsonbin\.io\/v3\/b\/[a-zA-Z0-9]+\/latest\?meta=false)/);
        if (urlMatch) {
            const url = urlMatch[1];
            elizaLogger.info('Found blueprint URL:', { url });
            return { blueprint: null, url };
        }

        elizaLogger.info('No blueprint URL found in message');
        return { blueprint: null, url: null };
    } catch (error) {
        elizaLogger.error('Error in extractBlueprintFromMessage:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        return { blueprint: null, url: null };
    }
};

// Add helper function for client-specific messages
const getClientSpecificMessage = (client: string, playgroundUrl: string) => {
    switch (client) {
        case 'twitter':
            return {
                text: `Your WooCommerce playground is ready! Access it here: ${playgroundUrl}`,
                action: "CREATE_PLAYGROUND"
            };
        case 'telegram':
        default:
            return {
                text: `I've created a playground instance with your blueprint! You can access it here:\n\n${playgroundUrl}\n\nThe playground will load with all your specified configurations. Feel free to explore and test everything.`,
                action: "CREATE_PLAYGROUND"
            };
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
        elizaLogger.info("Validating CREATE_PLAYGROUND request");
        const text = message.content.text?.toLowerCase() || '';
        return text.includes("playground") ||
               text.includes("launch") ||
               text.includes("preview") ||
               text === "let's play" ||
               text === "lets play";
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State, options?: { [key: string]: unknown }, callback?: HandlerCallback): Promise<boolean> => {
        elizaLogger.info("Handling CREATE_PLAYGROUND request");

        try {
            // Get recent messages from the conversation
            const recentMessages = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 20,
                unique: false
            });

            elizaLogger.info('Searching through recent messages:', {
                messageCount: recentMessages.length,
                roomId: message.roomId
            });

            // Look for blueprint in recent messages
            let blueprintData: { blueprint: string | null, url: string | null } = { blueprint: null, url: null };
            for (const msg of recentMessages.reverse()) {
                if (msg.content.text) {
                    elizaLogger.info('Checking message for blueprint:', {
                        messageId: msg.id,
                        messageLength: msg.content.text.length,
                        preview: msg.content.text.substring(0, 100) + '...'
                    });

                    blueprintData = extractBlueprintFromMessage(msg.content.text);
                    if (blueprintData.blueprint) {
                        elizaLogger.info('Blueprint found in message:', {
                            messageId: msg.id,
                            blueprintLength: blueprintData.blueprint.length,
                            blueprintPreview: blueprintData.blueprint.substring(0, 100) + '...',
                            hasUrl: !!blueprintData.url
                        });
                        break;
                    }
                }
            }

            // If no blueprint found, suggest generating one
            if (!blueprintData.blueprint) {
                if (callback) {
                    callback({
                        text: "I couldn't find a recent blueprint. Would you like me to help you generate one first? Just let me know what kind of store you'd like to create."
                    });
                }
                return true;
            }

            // Use the stored URL if available
            const uploadedUrl = blueprintData.url;
            if (!uploadedUrl) {
                if (callback) {
                    callback({
                        text: "I found a blueprint but it hasn't been uploaded yet. Please try generating a new blueprint first."
                    });
                }
                return true;
            }

            // Create playground URL
            const playgroundUrl = `https://playground.wordpress.net?blueprint-url=${encodeURIComponent(uploadedUrl)}`;

            if (callback) {
                // Get client-specific message
                const clientType = runtime.character.clients?.[0] || 'telegram';
                const response = getClientSpecificMessage(clientType, playgroundUrl);
                callback(response);
            }

            return true;
        } catch (error) {
            elizaLogger.error('Error in CREATE_PLAYGROUND:', {
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                } : error,
                fullError: error
            });
            if (callback) {
                callback({
                    text: `I encountered an error while setting up the playground: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again in a few moments.`
                });
            }
            return false;
        }
    }
};

// Test function for blueprint extraction and validation
const testBlueprintExtraction = (rawEntry: string) => {
    elizaLogger.info('Testing blueprint extraction with raw entry');

    // Step 1: Try to extract blueprint
    const blueprintData = extractBlueprintFromMessage(rawEntry);
    if (!blueprintData.blueprint) {
        elizaLogger.error('Failed to extract blueprint from message');
        return null;
    }

    elizaLogger.info('Successfully extracted blueprint:', {
        length: blueprintData.blueprint.length,
        preview: blueprintData.blueprint.substring(0, 100)
    });

    // Step 2: Try to parse and validate
    try {
        const parsed = JSON.parse(blueprintData.blueprint);
        elizaLogger.info('Successfully parsed JSON:', {
            hasSchema: !!parsed.$schema,
            hasMeta: !!parsed.meta,
            preview: JSON.stringify(parsed).substring(0, 100)
        });

        // Step 3: Validate against schema
        const valid = validateBlueprint(parsed);
        if (!valid) {
            const errors = validateBlueprint.errors?.map(e => `${e.instancePath} ${e.message}`);
            elizaLogger.error('Blueprint validation failed:', { errors });
            return null;
        } else {
            elizaLogger.info('Blueprint validation successful');
            return parsed;
        }
    } catch (error) {
        elizaLogger.error('Error parsing blueprint:', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return null;
    }
};

// Run test with sample data
const sampleEntry = `{
  "text": "I've generated a blueprint for your store with all the essential configurations!",
  "action": "GENERATE_BLUEPRINT",
  "normalized": "GENERATE_BLUEPRINT",
  "shouldHandle": true,
  "blueprint": {
    "$schema": "https://playground.wordpress.net/blueprint-schema.json",
    "meta": {
      "title": "Portuguese Marmalade Shop",
      "description": "WooCommerce store for selling homemade marmalades in Portugal and Spain",
      "author": "WooGuide",
      "categories": ["ecommerce", "food"]
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
        "step": "installPlugin",
        "pluginData": {
          "resource": "wordpress.org/plugins",
          "slug": "woocommerce"
        }
      },
      {
        "step": "activatePlugin",
        "pluginPath": "woocommerce/woocommerce.php"
      },
      {
        "step": "installPlugin",
        "pluginData": {
          "resource": "wordpress.org/plugins",
          "slug": "polylang"
        }
      },
      {
        "step": "activatePlugin",
        "pluginPath": "polylang/polylang.php"
      },
      {
        "step": "installPlugin",
        "pluginData": {
          "resource": "wordpress.org/plugins",
          "slug": "woocommerce-eu-vat-assistant"
        }
      },
      {
        "step": "activatePlugin",
        "pluginPath": "woocommerce-eu-vat-assistant/woocommerce-eu-vat-assistant.php"
      },
      {
        "step": "setSiteOptions",
        "options": {
          "woocommerce_currency": "EUR",
          "woocommerce_weight_unit": "kg",
          "woocommerce_dimension_unit": "cm",
          "woocommerce_default_country": "PT",
          "woocommerce_allowed_countries": "specific",
          "woocommerce_specific_allowed_countries": ["PT", "ES"]
        }
      },
      {
        "step": "setSiteLocale",
        "locale": "pt_PT"
      }
    ]
  }
}`;

testBlueprintExtraction(sampleEntry);

export const actions = [createPlaygroundAction];
export { createPlaygroundAction, testBlueprintExtraction };