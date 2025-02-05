import { Action, IAgentRuntime, Memory, elizaLogger, State, HandlerCallback, composeContext, generateText, ModelClass } from "@elizaos/core";
import Ajv from "ajv";

// Initialize AJV with enhanced features
const ajv = new Ajv({
    removeAdditional: true,    // Remove properties not in schema
    useDefaults: true,         // Apply default values from schema
    coerceTypes: true,         // Add type coercion
    strict: false,             // Allow some flexibility in validation
    allErrors: true,           // Collect all errors, not just the first one
    verbose: true             // Include detailed error info
});

// Define the blueprint schema
const blueprintSchema = {
    type: "object",
    required: ["$schema", "meta", "landingPage", "preferredVersions", "features", "steps"],
    properties: {
        $schema: {
            type: "string",
            const: "https://playground.wordpress.net/blueprint-schema.json"
        },
        meta: {
            type: "object",
            required: ["title", "description", "author", "categories"],
            properties: {
                title: { type: "string" },
                description: { type: "string" },
                author: { type: "string" },
                categories: {
                    type: ["array", "string"],
                    items: { type: "string" },
                    default: ["ecommerce"]
                }
            }
        },
        landingPage: { type: "string", default: "/shop" },
        preferredVersions: {
            type: "object",
            required: ["php", "wp"],
            properties: {
                php: { type: "string", default: "8.2" },
                wp: { type: "string", default: "6.4" }
            }
        },
        features: {
            type: "object",
            required: ["networking"],
            properties: {
                networking: { type: "boolean", default: true }
            }
        },
        steps: {
            type: "array",
            items: {
                type: "object",
                required: ["step"],
                properties: {
                    step: { type: "string" },
                    options: {
                        type: "object",
                        properties: {
                            woocommerce_specific_allowed_countries: {
                                type: "array",
                                items: { type: "string" }
                            }
                        },
                        additionalProperties: true
                    },
                    pluginZipFile: {
                        type: "object",
                        properties: {
                            resource: { type: "string" },
                            slug: { type: "string" }
                        }
                    }
                }
            }
        }
    }
};

// Compile the schema
const validateBlueprint = ajv.compile(blueprintSchema);

const blueprintTemplate = `Given the recent conversation:
{{recentMessages}}

Generate a WordPress Blueprint JSON that follows the playground.wordpress.net schema format. The blueprint should configure a WooCommerce store based on the user's requirements.

CRITICAL FORMAT RULES - YOUR OUTPUT MUST FOLLOW THESE EXACTLY:

1. Steps MUST be in an array with square brackets:
   "steps": [
     {"step": "resetData"},
     {"step": "setSiteOptions"},
     {"step": "installPlugin"}
   ]

2. Categories MUST be in ONE of these formats:
   "categories": "ecommerce, food, multilingual"
   OR
   "categories": ["ecommerce", "food", "multilingual"]

3. Country arrays must be properly formatted:
   "woocommerce_specific_allowed_countries": ["PT", "ES"]

Example blueprint (COPY THIS FORMAT EXACTLY):
{
  "$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "meta": {
    "title": "Store Name",
    "description": "Store Description",
    "author": "WooGuide",
    "categories": "ecommerce, food, multilingual"
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
      "step": "resetData",
      "options": {}
    },
    {
      "step": "setSiteOptions",
      "options": {
        "blogname": "Store Name",
        "blogdescription": "Store Description",
        "woocommerce_currency": "EUR",
        "woocommerce_default_country": "PT",
        "woocommerce_weight_unit": "kg",
        "woocommerce_dimension_unit": "cm",
        "woocommerce_allowed_countries": "specific",
        "woocommerce_specific_allowed_countries": ["PT", "ES"]
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

IMPORTANT: Your response must be ONLY the JSON blueprint with NO additional text or formatting. Follow the example format EXACTLY, especially for steps array and categories.`;

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

        try {
            if (!state) {
                state = await runtime.composeState(message);
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            const context = composeContext({
                state,
                template: blueprintTemplate
            });

            const result = await generateText({
                runtime,
                context,
                modelClass: ModelClass.LARGE
            });

            elizaLogger.info('Original LLM response:', {
                length: result.length,
                fullResponse: result
            });

            const matches = result.match(/(\{[\s\S]*\})/g);
            if (!matches) {
                throw new Error("No JSON object found in response");
            }

            for (const match of matches) {
                const cleanedMatch = match.replace(/```json\s*|\s*```/g, '');
                elizaLogger.info('Processing JSON:', {
                    length: cleanedMatch.length,
                    preview: cleanedMatch.substring(0, 100),
                    fullJson: cleanedMatch
                });

                try {
                    // Parse and validate the JSON
                    const parsed = JSON.parse(cleanedMatch);
                    elizaLogger.info('Validating blueprint structure', {
                        hasSchema: parsed.$schema ? 'yes' : 'no',
                        hasMeta: parsed.meta ? 'yes' : 'no',
                        hasSteps: parsed.steps ? 'yes' : 'no',
                        stepsType: Array.isArray(parsed.steps) ? 'array' : typeof parsed.steps,
                        stepsPreview: JSON.stringify(parsed.steps).substring(0, 100)
                    });

                    if (validateBlueprint(parsed)) {
                        elizaLogger.info('Found valid blueprint');
                        if (callback) {
                            // Format the JSON nicely
                            const formattedJson = JSON.stringify(parsed, null, 2);

                            elizaLogger.info('Creating memory with blueprint:', {
                                length: formattedJson.length,
                                preview: formattedJson.substring(0, 100)
                            });

                            callback({
                                text: `I've generated a blueprint for your store with all the essential configurations!\n\n\`\`\`json\n${formattedJson}\n\`\`\`\n\nWould you like me to:\n\n1. Explain any part of the setup\n2. Create a playground to test it out\n3. Help you with the next steps like adding products`,
                                action: "GENERATE_BLUEPRINT",
                                normalized: "GENERATE_BLUEPRINT",
                                shouldHandle: true,
                                blueprint: formattedJson  // Store unencoded but formatted JSON
                            });
                        }
                        return true;
                    }
                } catch (error) {
                    elizaLogger.info('Failed to parse/validate JSON:', {
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }

            throw new Error("No valid blueprint found in response");
        } catch (error) {
            elizaLogger.error("Error generating blueprint:", error);
            if (callback) {
                callback({
                    text: "I encountered an error while generating the blueprint. Please try again."
                });
            }
            return false;
        }
    }
};

// Export the action
export const actions = [generateBlueprintAction];
export { generateBlueprintAction };

export interface BlueprintContext {
  userId: string;
  sessionId: string;
}

export interface BlueprintData {
  $schema: string;
  meta: {
    title: string;
    description: string;
    author: string;
    categories: string | string[];
  };
  landingPage: string;
  preferredVersions: {
    php: string;
    wp: string;
  };
  features: {
    networking: boolean;
  };
  steps: Array<{
    step: string;
    options?: {
      [key: string]: any;
    };
    pluginZipFile?: {
      resource: string;
      slug: string;
    };
  }>;
}

export const generateBlueprint = async (
  input: string,
  context: BlueprintContext
): Promise<BlueprintData> => {
  elizaLogger.info('Generating blueprint from input', {
    inputLength: input.length,
    preview: input.substring(0, 200)
  });

  try {
    const parsed = JSON.parse(input) as BlueprintData;
    elizaLogger.info('Validating blueprint structure', {
        hasSchema: parsed.$schema ? 'yes' : 'no',
        hasMeta: parsed.meta ? 'yes' : 'no',
        hasSteps: parsed.steps ? 'yes' : 'no',
        stepsType: Array.isArray(parsed.steps) ? 'array' : typeof parsed.steps
    });

    if (!validateBlueprint(parsed)) {
        throw new Error('Invalid blueprint format');
    }

    elizaLogger.info('Blueprint generation successful', {
        stepsCount: Array.isArray(parsed.steps) ? parsed.steps.length : 'not array',
        categoriesType: typeof parsed.meta?.categories,
        stepsPreview: JSON.stringify(parsed.steps).substring(0, 100)
    });

    return parsed;
  } catch (error) {
    elizaLogger.error('Failed to parse/validate blueprint:', {
        error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error('Invalid blueprint format');
  }
}