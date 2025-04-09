import { Action, IAgentRuntime, Memory, elizaLogger, State, HandlerCallback } from "@elizaos/core";
import { generateBlueprintAction } from "./generate-blueprint";
import axios from "axios";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { blueprintSchema } from "../schema/blueprint";
import { getClientSpecificMessage } from './utils';

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

interface BlueprintMemoryContent {
    text: string;
    blueprint?: string;
    blueprintUrl?: string;
}

async function extractBlueprintFromMessage(message: string | Memory): Promise<string | null> {
    elizaLogger.info('Searching for blueprint URL in message');
    elizaLogger.info('Message content:', message);

    // Convert message to string if it's a Memory object
    let content = '';
    if (typeof message === 'string') {
        content = message;
    } else {
        content = JSON.stringify(message.content);
    }

    elizaLogger.info('Content to search:', content);

    // Look for JSONBin URL in the content
    const urlMatch = content.match(/(https:\/\/api\.jsonbin\.io\/v3\/b\/[a-zA-Z0-9]+\/latest\?meta=false)/);
    if (urlMatch) {
        elizaLogger.info('Found blueprint URL:', urlMatch[1]);
        return urlMatch[1];
    }

    elizaLogger.info('No blueprint URL found in message');
    return null;
}

// Validate the command
const isValidCommand = (command: string): boolean => {
    elizaLogger.info('Validating command:', command);
    const normalizedCommand = command.toLowerCase().trim();
    elizaLogger.info('Normalized command:', normalizedCommand);

    const validCommands = [
        'create playground',
        'create a playground',
        'make playground',
        'make a playground',
        'build playground',
        'build a playground',
        'deploy playground',
        'deploy a playground',
        'launch playground',
        'launch a playground',
        'start playground',
        'start a playground',
        'open playground',
        'open a playground',
        'let\'s play',
        'lets play',
        'play'
    ];

    elizaLogger.info('Checking against valid commands:', validCommands);
    const isValid = validCommands.includes(normalizedCommand);
    elizaLogger.info('Command validation result:', { command: normalizedCommand, isValid });

    return isValid;
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
    validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
        elizaLogger.info("Validating CREATE_PLAYGROUND request");
        elizaLogger.info("Message content:", message.content);
        elizaLogger.info("Action name:", createPlaygroundAction.name);
        elizaLogger.info("Action similes:", createPlaygroundAction.similes);

        // Handle both string and object content
        const text = typeof message.content === 'string'
            ? message.content
            : message.content.text || '';

        const normalizedText = text.toLowerCase().trim();
        elizaLogger.info("Normalized text:", normalizedText);
        const isValid = isValidCommand(normalizedText);

        elizaLogger.info("Validation result:", { text: normalizedText, isValid });
        return isValid;
    },
    handler: async (runtime: IAgentRuntime, message: Memory, state?: State, options?: { [key: string]: unknown }, callback?: HandlerCallback): Promise<boolean> => {
        elizaLogger.info("Executing CREATE_PLAYGROUND handler");
        elizaLogger.info("Message content structure:", {
            type: typeof message.content,
            content: message.content
        });

        try {
            elizaLogger.info("Retrieving recent messages for room:", message.roomId);
            const recentMessages = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 20,
                unique: false
            });
            elizaLogger.info("Retrieved messages count:", recentMessages.length);

            let blueprintData: { blueprint: string | null, url: string | null } = { blueprint: null, url: null };

            // Search through messages in chronological order
            for (const msg of recentMessages) {
                // Log only relevant message info, not embeddings
                elizaLogger.info("Processing message:", {
                    id: msg.id,
                    contentType: typeof msg.content,
                    content: msg.content
                });

                elizaLogger.info('Checking message for blueprint URL');
                const result = await extractBlueprintFromMessage(msg);
                if (result) {
                    elizaLogger.info('Found valid blueprint URL:', result);
                    blueprintData = { blueprint: null, url: result };
                    break;
                }
            }

            if (!blueprintData.url) {
                elizaLogger.info('No valid blueprint URL found in recent messages');
                if (callback) {
                    callback({
                        text: "I couldn't find a recent blueprint. Would you like me to help you generate one first? Just let me know what kind of store you'd like to create."
                    });
                }
                return true;
            }

            const uploadedUrl = blueprintData.url;
            elizaLogger.info("Constructing playground URL with blueprint:", uploadedUrl);
            const playgroundUrl = `https://wpcalypso.wordpress.com/setup/onboarding/playground?blueprint-url=${encodeURIComponent(uploadedUrl)}`;
            elizaLogger.info("Final playground URL:", playgroundUrl);

            if (callback) {
                const clientType = runtime.character.clients?.[0] || 'telegram';
                elizaLogger.info("Sending response to client:", clientType);
                const response = getClientSpecificMessage(clientType, playgroundUrl);
                // Ensure response has the correct format
                callback({
                    text: response.text,
                    action: createPlaygroundAction.name
                });
            }

            return true;
        } catch (error) {
            elizaLogger.error('Error in CREATE_PLAYGROUND:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                messageContent: message.content
            });

            if (callback) {
                let errorMessage = 'I encountered an error while setting up the playground.';
                if (error instanceof Error) {
                    if (error.message.includes('fetch')) {
                        errorMessage = 'I had trouble connecting to the blueprint service. Please try again in a few moments.';
                    } else if (error.message.includes('URL')) {
                        errorMessage = 'I found a blueprint URL but it appears to be invalid. Please try generating a new blueprint.';
                    } else {
                        errorMessage = `I encountered an error: ${error.message}. Please try again.`;
                    }
                }
                callback({
                    text: errorMessage,
                    action: createPlaygroundAction.name
                });
            }
            return false;
        }
    }
};

// Test function for blueprint extraction and validation
const testBlueprintExtraction = async (rawEntry: string) => {
    elizaLogger.info('Testing blueprint extraction with raw entry');

    // Step 1: Try to extract blueprint URL
    const result = await extractBlueprintFromMessage(rawEntry);
    if (!result) {
        elizaLogger.error('Failed to extract blueprint URL from message');
        return null;
    }

    elizaLogger.info('Successfully extracted blueprint URL:', {
        url: result
    });

    return result;
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