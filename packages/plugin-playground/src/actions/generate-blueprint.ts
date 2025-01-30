import {
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
    Action,
} from "@elizaos/core";
import {
    WooCommerceOptions,
    WooCommerceBlueprint,
    BlueprintStep
} from "../types/woocommerce";
import { generateSetupSteps } from "./woocommerce";

// Generate blueprint steps (reusing existing functions)
const generateBlueprint = (options: WooCommerceOptions): WooCommerceBlueprint => {
    return {
        $schema: "https://playground.wordpress.net/blueprint-schema.json",
        meta: {
            title: options.store.storeName,
            description: options.store.storeDescription,
            categories: ["WooCommerce", "Site"]
        },
        landingPage: options.setupWizard ? "/wp-admin/admin.php?page=wc-setup" : "/shop",
        preferredVersions: {
            php: "8.3",
            wp: "6.6"
        },
        features: {
            networking: true
        },
        steps: generateSetupSteps(options)
    };
};

// Validate store options
const validateStoreOptions = (options: unknown): options is WooCommerceOptions => {
    if (!options || typeof options !== 'object') {
        return false;
    }

    const opts = options as Partial<WooCommerceOptions>;

    if (!opts.store || typeof opts.store !== 'object') {
        return false;
    }

    const requiredFields = ['storeName', 'storeDescription', 'currency', 'country'];
    return requiredFields.every(field => typeof opts.store[field] === 'string');
};

export const generateBlueprintAction: Action = {
    name: "GENERATE_BLUEPRINT",
    similes: [
        "GENERATE_BLUEPRINT",
        "CREATE_BLUEPRINT",
        "MAKE_BLUEPRINT",
        "SETUP_BLUEPRINT",
        "CAN_YOU_CREATE_A_BLUEPRINT",
        "GENERATE_STORE_BLUEPRINT"
    ],
    description: "Generate a WooCommerce store blueprint based on provided options",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            elizaLogger.info("Validating blueprint generation");
            const options = message.content?.options as WooCommerceOptions;

            if (!options || typeof options !== 'object') {
                elizaLogger.error("Store options must be provided");
                return false;
            }

            if (!options.store || !options.store.storeName || !options.store.storeDescription) {
                elizaLogger.error("Store name and description are required");
                return false;
            }

            elizaLogger.info("Store options validated successfully");
            return true;
        } catch (error) {
            elizaLogger.error("Error in blueprint validation:", error);
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
        try {
            const storeOptions = message.content?.options as WooCommerceOptions;
            const blueprint = generateBlueprint(storeOptions);

            if (callback) {
                const response = {
                    text: "✨ Blueprint generated successfully!\n\n" +
                          "Store Configuration:\n" +
                          `- Name: ${storeOptions.store.storeName}\n` +
                          `- Description: ${storeOptions.store.storeDescription}\n` +
                          `- Currency: ${storeOptions.store.currency}\n` +
                          `- Country: ${storeOptions.store.country}\n\n` +
                          "You can now use this blueprint to create your WooCommerce store playground.",
                    blueprint,
                    markdown: true
                };
                callback(response);
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error generating blueprint:", error);
            if (callback) {
                callback({
                    text: `Failed to generate blueprint: ${error.message}`,
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
                    text: "I want to sell coffee with subscriptions in Europe",
                    action: "GENERATE_BLUEPRINT"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll help you set up a coffee subscription store. Here's the blueprint with recommended extensions and configurations.",
                    options: {
                        store: {
                            storeName: "Coffee Store",
                            storeDescription: "Premium coffee subscription service",
                            currency: "EUR",
                            country: "DE",
                            extensions: [
                                {
                                    name: "WooCommerce Subscriptions",
                                    slug: "woocommerce-subscriptions",
                                    isPaid: true,
                                    price: "$299/year",
                                    description: "Enable recurring deliveries"
                                },
                                {
                                    name: "Table Rate Shipping",
                                    slug: "woocommerce-table-rate-shipping",
                                    isPaid: true,
                                    price: "$99/year",
                                    description: "Flexible shipping rates"
                                }
                            ],
                            paymentGateways: [
                                {
                                    name: "Stripe",
                                    provider: "stripe",
                                    enabled: true,
                                    settings: {
                                        title: "Credit Card (Stripe)",
                                        description: "Pay with credit card"
                                    }
                                }
                            ],
                            subscriptionSettings: {
                                enabled: true,
                                allowSwitching: true,
                                allowPausingSubscriptions: true
                            },
                            shipping: {
                                zones: [
                                    {
                                        name: "Europe",
                                        regions: ["DE", "FR", "IT", "ES"],
                                        methods: [
                                            {
                                                type: "flat_rate",
                                                cost: 5
                                            }
                                        ]
                                    }
                                ]
                            }
                        },
                        theme: {
                            name: "storefront",
                            files: []
                        },
                        products: [
                            {
                                name: "Sample Product",
                                price: 29.99,
                                description: "Sample product description",
                                categories: ["Category"]
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
                    text: "I want to sell digital downloads globally",
                    action: "GENERATE_BLUEPRINT"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll help you set up a digital downloads store. Here's the blueprint with recommended extensions for digital products.",
                    options: {
                        store: {
                            storeName: "Digital Store",
                            storeDescription: "Digital products store",
                            currency: "USD",
                            country: "US",
                            extensions: [
                                {
                                    name: "WooCommerce Digital",
                                    slug: "woocommerce-digital",
                                    isPaid: false,
                                    description: "Sell digital products"
                                }
                            ],
                            paymentGateways: [
                                {
                                    name: "PayPal",
                                    provider: "paypal",
                                    enabled: true,
                                    settings: {
                                        title: "PayPal",
                                        description: "Pay with PayPal"
                                    }
                                }
                            ]
                        },
                        theme: {
                            name: "storefront",
                            files: []
                        },
                        products: [
                            {
                                name: "Digital Product",
                                price: 19.99,
                                description: "Sample digital product",
                                categories: ["Digital"]
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
                    text: "I want to sell handmade jewelry in the US",
                    action: "GENERATE_BLUEPRINT"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll help you set up a jewelry store. Here's the blueprint with recommended features for handmade products.",
                    options: {
                        store: {
                            storeName: "{{dynamically_generated_based_on_request}}",
                            storeDescription: "{{dynamically_generated_based_on_request}}",
                            currency: "USD",
                            country: "US",
                            extensions: "{{recommended_for_physical_products}}",
                            paymentGateways: "{{US_payment_options}}",
                            shipping: "{{US_shipping_zones}}"
                        },
                        theme: "{{recommended_for_jewelry}}",
                        products: "{{sample_jewelry_products}}"
                    }
                }
            }
        ]
    ]
};