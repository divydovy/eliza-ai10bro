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

const extractBlueprintFromMessage = (text: string): string | null => {
    try {
        elizaLogger.info('Attempting to extract blueprint from message:', {
            messageLength: text.length,
            messagePreview: text.substring(0, 100)
        });

        let messageObj;
        try {
            // First try to parse as JSON
            messageObj = JSON.parse(text);
        } catch (parseError) {
            // If not JSON, treat as plain text
            elizaLogger.info('Message is not JSON, treating as plain text');
            messageObj = { text };
        }

        // Check for blueprint field (new format)
        if (messageObj.blueprint) {
            elizaLogger.info('Found blueprint in blueprint field');
            try {
                // If it's a string, parse it to ensure it's valid JSON
                const parsed = typeof messageObj.blueprint === 'string'
                    ? JSON.parse(messageObj.blueprint)
                    : messageObj.blueprint;

                elizaLogger.info('Parsed blueprint structure:', {
                    hasSchema: !!parsed.$schema,
                    hasMeta: !!parsed.meta,
                    hasSteps: !!parsed.steps,
                    stepsLength: Array.isArray(parsed.steps) ? parsed.steps.length : 'not array'
                });

                // Validate the blueprint
                const valid = validateBlueprint(parsed);
                if (valid) {
                    elizaLogger.info('Successfully validated blueprint from blueprint field');
                    return JSON.stringify(parsed);
                } else {
                    const errors = validateBlueprint.errors?.map(e => `${e.instancePath} ${e.message}`);
                    elizaLogger.error('Blueprint validation failed:', { errors });
                }
            } catch (error) {
                elizaLogger.error('Failed to parse/validate blueprint:', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    blueprintPreview: typeof messageObj.blueprint === 'string'
                        ? messageObj.blueprint.substring(0, 100)
                        : JSON.stringify(messageObj.blueprint).substring(0, 100)
                });
            }
        }

        // Look for JSON in text content
        const textContent = messageObj.text;
        if (textContent) {
            // Look for JSON code blocks
            const codeBlockMatch = textContent.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
            if (codeBlockMatch) {
                elizaLogger.info('Found JSON code block in text');
                try {
                    const parsed = JSON.parse(codeBlockMatch[1]);
                    const valid = validateBlueprint(parsed);
                    if (valid) {
                        elizaLogger.info('Successfully validated blueprint from code block');
                        return JSON.stringify(parsed);
                    }
                } catch (error) {
                    elizaLogger.error('Failed to parse JSON from code block:', error);
                }
            }

            // Try to find any JSON object in the text
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                elizaLogger.info('Found JSON object in text');
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const valid = validateBlueprint(parsed);
                    if (valid) {
                        elizaLogger.info('Successfully validated blueprint from text JSON');
                        return JSON.stringify(parsed);
                    }
                } catch (error) {
                    elizaLogger.error('Failed to parse JSON from text:', error);
                }
            }
        }

        elizaLogger.info('No valid blueprint found in message');
        return null;

    } catch (error) {
        elizaLogger.error('Error in extractBlueprintFromMessage:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack trace'
        });
        return null;
    }
};

const uploadBlueprint = async (runtime: IAgentRuntime, blueprint: string): Promise<string> => {
    try {
        const jsonbinKey = runtime.character.settings?.secrets?.JSONBIN_API_KEY;
        if (!jsonbinKey) {
            throw new Error('JSONBin API key not found in character settings');
        }

        elizaLogger.info('Attempting to validate blueprint:', {
            blueprintLength: blueprint.length,
            preview: blueprint.substring(0, 100)
        });

        // Parse and validate the blueprint
        const parsed = JSON.parse(blueprint);
        const valid = validateBlueprint(parsed);

        if (!valid) {
            const errors = validateBlueprint.errors?.map(e => `${e.instancePath} ${e.message}`);
            elizaLogger.error('Blueprint validation failed:', { errors });
            throw new Error(`Invalid blueprint format: ${errors?.join(', ')}`);
        }

        elizaLogger.info('Sending request to JSONBin');
        const response = await axios.post(
            'https://api.jsonbin.io/v3/b',
            parsed,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': jsonbinKey,
                    'X-Bin-Private': 'false',
                    'X-JSON-Path': '$'  // Return raw JSON without wrapper
                }
            }
        );

        const binId = response.data.metadata.id;
        // Use the raw endpoint to get direct JSON without wrapper
        const publicUrl = `https://api.jsonbin.io/v3/b/${binId}/latest?meta=false`;
        elizaLogger.info('Blueprint uploaded to JSONBin:', { url: publicUrl });
        return publicUrl;
    } catch (error) {
        elizaLogger.error('Error uploading blueprint:', {
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error,
            axiosError: error?.response?.data || 'No response data',
            blueprint: blueprint.substring(0, 200) + '...'
        });
        throw new Error(`Failed to upload blueprint: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                if (callback) {
                    callback({
                        text: "I couldn't find a recent blueprint. Would you like me to help you generate one first? Just let me know what kind of store you'd like to create."
                    });
                }
                return true;
            }

            elizaLogger.info('Found blueprint, attempting upload:', {
                blueprintLength: blueprint.length,
                preview: blueprint.substring(0, 100)
            });

            // Upload blueprint to JSONBin
            const uploadedUrl = await uploadBlueprint(runtime, blueprint);

            // Create playground URL
            const playgroundUrl = `https://playground.wordpress.net?blueprint-url=${encodeURIComponent(uploadedUrl)}`;

            if (callback) {
                callback({
                    text: `I've created a playground instance with your blueprint! You can access it here:\n\n${playgroundUrl}\n\nThe playground will load with all your specified configurations. Feel free to explore and test everything.`,
                    action: "CREATE_PLAYGROUND"
                });
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
    const blueprint = extractBlueprintFromMessage(rawEntry);
    if (!blueprint) {
        elizaLogger.error('Failed to extract blueprint from message');
        return null;
    }

    elizaLogger.info('Successfully extracted blueprint:', {
        length: blueprint.length,
        preview: blueprint.substring(0, 100)
    });

    // Step 2: Try to parse and validate
    try {
        const parsed = JSON.parse(blueprint);
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