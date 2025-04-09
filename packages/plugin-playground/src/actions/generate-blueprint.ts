import { Action, IAgentRuntime, Memory, elizaLogger, State, HandlerCallback, composeContext, generateText, ModelClass, getEmbeddingZeroVector, UUID } from "@elizaos/core";
import Ajv from "ajv";
import { blueprintSchema, BlueprintData } from "../schema/blueprint";
import axios from "axios";
import { v4 } from "uuid";

// Initialize AJV with enhanced features
const ajv = new Ajv({
    removeAdditional: true,    // Remove properties not in schema
    useDefaults: true,         // Apply default values from schema
    coerceTypes: true,         // Add type coercion
    strict: false,             // Allow some flexibility in validation
    allErrors: true,           // Collect all errors, not just the first one
    verbose: true             // Include detailed error info
});

// Compile the schema
const validateBlueprint = ajv.compile(blueprintSchema);

const blueprintTemplate = `Given the recent conversation:
{{recentMessages}}

Generate a WordPress Blueprint JSON that follows the playground.wordpress.net schema format. The blueprint should configure a WooCommerce store based on the user's requirements.

CRITICAL FORMAT RULES - YOUR OUTPUT MUST FOLLOW THESE EXACTLY:

1. ONLY these step types are allowed:
   - activatePlugin (requires pluginPath)
   - activateTheme
   - cp
   - defineSiteUrl
   - defineWpConfigConsts
   - enableMultisite
   - importThemeStarterContent
   - importWordPressFiles
   - importWxr
   - installPlugin (requires pluginData)
   - installTheme
   - login
   - mkdir
   - mv
   - request
   - resetData
   - rm
   - rmdir
   - runPHP
   - runPHPWithOptions
   - runSql
   - runWpInstallationWizard
   - setSiteLanguage
   - setSiteOptions
   - unzip
   - updateUserMeta
   - wp-cli
   - writeFile
   - writeFiles

2. Required properties for specific steps:
   For installPlugin steps:
   {
     "step": "installPlugin",
     "pluginData": {
       "resource": "wordpress.org/plugins",
       "slug": "plugin-name"
     }
   }

   For activatePlugin steps:
   {
     "step": "activatePlugin",
     "pluginPath": "plugin-name/plugin-name.php"
   }

   For setSiteLanguage steps:
   {
     "step": "setSiteLanguage",
     "language": "en_US"  // MUST use 'language', NOT 'locale'
   }

3. Categories MUST be an array:
   "categories": ["ecommerce", "food", "multilingual"]

4. Country arrays must be properly formatted:
   "woocommerce_specific_allowed_countries": ["PT", "ES"]

5. Options object can ONLY contain these properties:
   - slug (string)
   - blogname (string)
   - blogdescription (string)
   - woocommerce_currency (string)
   - woocommerce_default_country (string)
   - woocommerce_weight_unit (string)
   - woocommerce_dimension_unit (string)
   - woocommerce_allowed_countries (string)
   - woocommerce_specific_allowed_countries (array of strings)
   - woocommerce_enable_reviews (boolean)
   - woocommerce_tax_display_shop (string)
   - woocommerce_tax_display_cart (string)
   - woocommerce_prices_include_tax (string)
   - timezone_string (string)
   - WPLANG (string)

Example blueprint (COPY THIS FORMAT EXACTLY):
{
  "$schema": "https://playground.wordpress.net/blueprint-schema.json",
  "meta": {
    "title": "Store Name",
    "description": "Store Description",
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
      "step": "setSiteOptions",
      "options": {
        "blogname": "Store Name",
        "blogdescription": "Store Description",
        "woocommerce_currency": "USD",
        "woocommerce_default_country": "US",
        "woocommerce_allowed_countries": "specific",
        "woocommerce_specific_allowed_countries": ["US"],
        "woocommerce_enable_reviews": true,
        "woocommerce_tax_display_shop": "incl",
        "woocommerce_tax_display_cart": "incl",
        "woocommerce_prices_include_tax": "yes"
      }
    },
    {
      "step": "setSiteLanguage",
      "language": "en_US"
    }
  ]
}

IMPORTANT: Your response must be ONLY the JSON blueprint with NO additional text or formatting. Follow the example format EXACTLY. DO NOT add any custom steps or properties that are not shown in the example above.`;

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
                    const parsed = JSON.parse(cleanedMatch) as BlueprintData;
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

                            // Upload the blueprint to JSONBin
                            const uploadedUrl = await uploadBlueprint(runtime, formattedJson);

                            if (!uploadedUrl) {
                                elizaLogger.error('Failed to upload blueprint to JSONBin');
                                throw new Error('Failed to upload blueprint to JSONBin');
                            }

                            // Create memory with both blueprint and URL
                            const memory: Memory = {
                                id: v4() as UUID,
                                userId: message.userId,
                                agentId: message.agentId,
                                roomId: message.roomId,
                                content: {
                                    text: `Generated blueprint for ${parsed.meta.title}`,
                                    blueprint: formattedJson,
                                    blueprintUrl: uploadedUrl
                                },
                                embedding: getEmbeddingZeroVector(),
                                createdAt: Date.now()
                            };

                            // Add embedding to memory
                            const memoryWithEmbedding = await runtime.messageManager.addEmbeddingToMemory(memory);

                            if (!memoryWithEmbedding) {
                                elizaLogger.error('Failed to add embedding to memory');
                                throw new Error('Failed to add embedding to memory');
                            }

                            await runtime.messageManager.createMemory(memoryWithEmbedding);

                            // Get client-specific message
                            const clientType = runtime.character.clients?.[0] || 'telegram';
                            const response = getClientSpecificMessage(clientType, formattedJson, uploadedUrl);

                            if (!response) {
                                elizaLogger.error('Failed to generate client-specific message');
                                throw new Error('Failed to generate client-specific message');
                            }

                            callback(response);
                        }
                        return true;
                    } else {
                        // Log validation errors with more detail
                        const errors = validateBlueprint.errors?.map(e => ({
                            path: e.instancePath,
                            message: e.message,
                            allowedValues: e.params.allowedValues,
                            invalidValue: e.data
                        }));
                        elizaLogger.error('Blueprint validation failed:', {
                            errors,
                            steps: parsed.steps.map((s, i) => `Step ${i}: ${s.step}`),
                            blueprint: JSON.stringify(parsed, null, 2)
                        });
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

// Remove the local BlueprintData interface since we're importing it
export { BlueprintData } from "../schema/blueprint";

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

// Add uploadBlueprint function from create-playground.ts
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

// Add helper function for client-specific messages
const getClientSpecificMessage = (client: string, formattedJson: string, uploadedUrl: string) => {
    switch (client) {
        case 'twitter':
            return {
                text: `Blueprint ready! Get it at: ${uploadedUrl}\nWhat next?\n1) Explain setup\n2) Create playground\n3) Help with next steps`,
                action: "GENERATE_BLUEPRINT",
                normalized: "GENERATE_BLUEPRINT",
                shouldHandle: true,
                blueprint: formattedJson,
                blueprintUrl: uploadedUrl
            };
        case 'telegram':
        default:
            return {
                text: `I've generated a blueprint for your store with all the essential configurations!\n\nBlueprint URL: ${uploadedUrl}\n\n\`\`\`json\n${formattedJson}\n\`\`\`\n\nWould you like me to:\n\n1. Explain any part of the setup\n2. Create a playground to test it out\n3. Help you with the next steps like adding products`,
                action: "GENERATE_BLUEPRINT",
                normalized: "GENERATE_BLUEPRINT",
                shouldHandle: true,
                blueprint: formattedJson,
                blueprintUrl: uploadedUrl
            };
    }
};