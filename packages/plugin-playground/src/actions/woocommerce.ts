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
    WooCommerceProduct,
    BlueprintStep,
    WooCommerceExtension,
    WooCommercePaymentGateway
} from "../types/woocommerce";
import fetch from "node-fetch";

// Base URL for WordPress Playground
const PLAYGROUND_BASE_URL = "https://playground.wordpress.net";
// Using transfer.sh as a temporary file host
const TRANSFER_URL = "https://transfer.sh";

// Generate product creation steps
const generateProductSteps = (products: WooCommerceProduct[]) => {
    return products.map(product => ({
        step: "runPHP",
        code: `
            $product = new WC_Product_Simple();
            $product->set_name('${product.name}');
            $product->set_regular_price('${product.price}');
            $product->set_description('${product.description}');
            ${product.sku ? `$product->set_sku('${product.sku}');` : ''}
            ${product.categories ? `
                $category_ids = array();
                foreach (${JSON.stringify(product.categories)} as $category_name) {
                    $term = wp_insert_term($category_name, 'product_cat');
                    if (!is_wp_error($term)) {
                        $category_ids[] = $term['term_id'];
                    }
                }
                $product->set_category_ids($category_ids);
            ` : ''}
            $product->save();
        `
    }));
};

// Generate theme setup steps
const generateThemeSteps = (theme: WooCommerceOptions['theme']) => {
    if (!theme) return [];

    const steps: BlueprintStep[] = [
        {
            step: "mkdir",
            path: `/wordpress/wp-content/themes/${theme.name}`
        }
    ];

    if (theme.files) {
        theme.files.forEach(file => {
            steps.push({
                step: "writeFile",
                path: `/wordpress/wp-content/themes/${theme.name}/${file.path}`,
                data: {
                    resource: "url",
                    url: file.url
                }
            });
        });

        steps.push({
            step: "activateTheme",
            themeFolderName: theme.name
        });
    }

    return steps;
};

// Generate extension installation steps
const generateExtensionSteps = (extensions: WooCommerceExtension[]) => {
    return extensions.map(extension => {
        if (extension.isPaid) {
            // For paid extensions, we'll add a notice in the admin panel
            return {
                step: "runPHP",
                code: `
                    add_action('admin_notices', function() {
                        echo '<div class="notice notice-info">
                            <p>Please install the ${extension.name} (${extension.price}) from
                            <a href="${extension.url}" target="_blank">WooCommerce.com</a></p>
                            <p>${extension.description}</p>
                        </div>';
                    });
                `
            };
        } else {
            // For free extensions, we can install them directly
            return {
                step: "installPlugin",
                pluginZipFile: {
                    resource: "wordpress.org/plugins",
                    slug: extension.slug
                },
                options: {
                    activate: true
                }
            };
        }
    });
};

// Generate payment gateway setup steps
const generatePaymentSteps = (gateways: WooCommercePaymentGateway[]) => {
    return gateways.map(gateway => {
        const steps: BlueprintStep[] = [];

        if (gateway.provider === 'square') {
            steps.push({
                step: "installPlugin",
                pluginZipFile: {
                    resource: "wordpress.org/plugins",
                    slug: "woocommerce-square"
                },
                options: {
                    activate: true
                }
            });
        }

        steps.push({
            step: "runPHP",
            code: `
                update_option('woocommerce_${gateway.provider}_settings', ${JSON.stringify({
                    enabled: gateway.enabled ? 'yes' : 'no',
                    ...gateway.settings
                })});
            `
        });

        return steps;
    }).flat();
};

// Export the setup steps generator for reuse
export const generateSetupSteps = (options: WooCommerceOptions) => {
    const steps: BlueprintStep[] = [
        {
            step: "resetData"
        },
        {
            step: "writeFile",
            path: "/wordpress/wp-content/mu-plugins/rewrite.php",
            data: "<?php /* Use pretty permalinks */ add_action( 'after_setup_theme', function() { global $wp_rewrite; $wp_rewrite->set_permalink_structure('/%postname%/'); $wp_rewrite->flush_rules(); } );"
        },
        {
            step: "setSiteOptions",
            options: {
                blogname: options.store.storeName,
                blogdescription: options.store.storeDescription,
                woocommerce_store_city: options.store.city || options.store.address?.city,
                woocommerce_store_address: options.store.address?.address1,
                woocommerce_store_postcode: options.store.address?.postcode,
                woocommerce_default_country: options.store.country,
                woocommerce_currency: options.store.currency,
                woocommerce_weight_unit: options.store.weightUnit || "kg",
                woocommerce_dimension_unit: options.store.dimensionUnit || "cm",
                woocommerce_allow_tracking: "no",
                woocommerce_onboarding_profile: {
                    skipped: true
                },
                ...(options.store.paymentMethods?.cheque && {
                    woocommerce_cheque_settings: {
                        enabled: options.store.paymentMethods.cheque.enabled ? "yes" : "no"
                    }
                })
            }
        },
        {
            step: "installPlugin",
            pluginZipFile: {
                resource: "wordpress.org/plugins",
                slug: "woocommerce"
            },
            options: {
                activate: true
            }
        }
    ];

    // Add shipping zones if configured
    if (options.store.shipping?.zones) {
        steps.push({
            step: "runPHP",
            code: options.store.shipping.zones.map(zone => `
                $zone = new WC_Shipping_Zone();
                $zone->set_zone_name('${zone.name}');
                $zone->save();

                ${zone.regions.map(region => `
                    $zone->add_location('${region}', 'country');
                `).join('\n')}

                ${zone.methods.map(method => `
                    $zone->add_shipping_method('${method.type}');
                    ${method.cost ? `
                        $shipping_method_id = $zone->get_shipping_methods()[0]->get_instance_id();
                        update_option('woocommerce_flat_rate_' . $shipping_method_id . '_settings', array(
                            'cost' => '${method.cost}'
                        ));
                    ` : ''}
                `).join('\n')}
            `).join('\n')
        });
    }

    // Add product creation steps if products are provided
    if (options.products && options.products.length > 0) {
        steps.push(...generateProductSteps(options.products));
    }

    // Add theme setup steps if theme is provided
    if (options.theme) {
        steps.push(...generateThemeSteps(options.theme));
    }

    // Add demo content if requested
    if (options.demoContent) {
        steps.push({
            step: "installPlugin",
            pluginZipFile: {
                resource: "wordpress.org/plugins",
                slug: "woocommerce-demo-store-content"
            }
        },
        {
            step: "activatePlugin",
            pluginSlug: "woocommerce-demo-store-content"
        });
    }

    // Add extension steps if configured
    if (options.store.extensions?.length) {
        steps.push(...generateExtensionSteps(options.store.extensions));
    }

    // Add payment gateway steps if configured
    if (options.store.paymentGateways?.length) {
        steps.push(...generatePaymentSteps(options.store.paymentGateways));
    }

    // Configure subscription settings if enabled
    if (options.store.subscriptionSettings?.enabled) {
        steps.push({
            step: "runPHP",
            code: `
                update_option('woocommerce_subscriptions_settings', ${JSON.stringify({
                    allow_switching: options.store.subscriptionSettings.allowSwitching ? 'yes' : 'no',
                    allow_pausing: options.store.subscriptionSettings.allowPausingSubscriptions ? 'yes' : 'no',
                    signup_fee: options.store.subscriptionSettings.signupFee || 0
                })});
            `
        });
    }

    // Configure tax settings if provided
    if (options.store.taxSettings) {
        steps.push({
            step: "runPHP",
            code: `
                update_option('woocommerce_tax_settings', ${JSON.stringify({
                    prices_include_tax: options.store.taxSettings.prices_include_tax ? 'yes' : 'no',
                    tax_based_on: options.store.taxSettings.tax_based_on || 'shipping',
                    shipping_tax_class: options.store.taxSettings.shipping_tax_class || 'inherit'
                })});
            `
        });
    }

    // Add login step at the end
    steps.push({
        step: "login",
        username: "admin",
        password: "password"
    });

    return steps;
};

// Generate complete blueprint
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

// Export the blueprint upload function for reuse
export const uploadBlueprint = async (blueprint: WooCommerceBlueprint): Promise<string> => {
    try {
        const blueprintJson = JSON.stringify(blueprint, null, 2);
        const filename = `woocommerce-blueprint-${Date.now()}.json`;

        const response = await fetch(`${TRANSFER_URL}/${filename}`, {
            method: 'PUT',
            body: blueprintJson,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to upload blueprint: ${response.statusText}`);
        }

        const uploadedUrl = await response.text();
        elizaLogger.info(`Blueprint uploaded successfully to ${uploadedUrl}`);
        return uploadedUrl;
    } catch (error) {
        elizaLogger.error('Error uploading blueprint:', error);
        throw error;
    }
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

export const woocommerceAction: Action = {
    name: "SETUP_WOOCOMMERCE",
    similes: [
        "SETUP_WOOCOMMERCE",
        "CREATE_STORE",
        "START_STORE",
        "INITIALIZE_STORE",
        "SETUP_STORE",
        "CREATE_WOOCOMMERCE",
        "TRY_STORE",
        "TEST_STORE"
    ],
    description: "Create a WooCommerce store playground instance from a blueprint",
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        try {
            elizaLogger.info("Validating WooCommerce store creation");
            const options = message.content?.options;
            const blueprint = message.content?.blueprint as WooCommerceBlueprint;

            // First check if we have either options or blueprint
            if (!options && !blueprint) {
                elizaLogger.error("Neither store options nor blueprint provided");
                return false;
            }

            // If we have options, validate them
            if (options) {
                if (!validateStoreOptions(options)) {
                    elizaLogger.error("Invalid store options format");
                    return false;
                }
                elizaLogger.info("Store options validated successfully");
            }

            // If we have a blueprint, validate its structure
            if (blueprint) {
                if (!blueprint.steps || !Array.isArray(blueprint.steps)) {
                    elizaLogger.error("Invalid blueprint format");
                    return false;
                }
                elizaLogger.info("Blueprint validated successfully");
            }

            return true;
        } catch (error) {
            elizaLogger.error("Error in WooCommerce store validation:", error);
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
        elizaLogger.info("Starting WooCommerce store creation");

        try {
            const blueprint = message.content?.blueprint as WooCommerceBlueprint;
            if (!blueprint) {
                throw new Error("Please generate a blueprint first using the GENERATE_BLUEPRINT action.");
            }

            // Upload blueprint and get URL
            const blueprintUrl = await uploadBlueprint(blueprint);

            // Generate playground URL with blueprint
            const playgroundUrl = `${PLAYGROUND_BASE_URL}/?blueprint-url=${encodeURIComponent(blueprintUrl)}`;

            if (callback) {
                const response = {
                    text: `✨ Your WooCommerce store playground is ready!\n\n` +
                          `🌐 URL: ${playgroundUrl}\n\n` +
                          `👤 Login credentials:\n` +
                          `   Username: admin\n` +
                          `   Password: password\n\n` +
                          `Note: This playground will expire after some time of inactivity.\n` +
                          `The blueprint file will be available for 14 days.\n\n` +
                          `💡 For paid extensions, please purchase and install them from WooCommerce.com`,
                    markdown: true
                };

                elizaLogger.info("Sending response:", response);
                callback(response);
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error in WooCommerce store creation:", error);
            if (callback) {
                callback({
                    text: `Sorry, I encountered an error: ${error.message}`,
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
                    text: "Let's try out this store configuration",
                    action: "SETUP_WOOCOMMERCE",
                    blueprint: "{{blueprintData}}"
                }
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "{{responseData}}"
                }
            }
        ]
    ]
};
