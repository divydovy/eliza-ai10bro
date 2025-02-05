import { JSONSchemaType } from "ajv";

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
        path?: string;
        pluginPath?: string;
        data?: string | {
            resource: string;
            url: string;
        };
        file?: {
            resource: string;
            url: string;
        };
        options?: {
            [key: string]: any;
        };
        pluginZipFile?: {
            resource: string;
            slug: string;
        };
        themeFolderName?: string;
        username?: string;
        password?: string;
        taxonomy?: string;
        term?: string;
        description?: string;
        locale?: string;
        theme?: string;
        title?: string;
        language?: string;
    }>;
}

// Remove JSONSchemaType to avoid complex typing issues
export const blueprintSchema = {
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
                    type: "array",
                    items: { type: "string" },
                    transform: ["string", "array"],
                    separator: ","
                }
            }
        },
        landingPage: { type: "string", default: "/shop" },
        preferredVersions: {
            type: "object",
            required: ["php", "wp"],
            properties: {
                php: { type: "string" },
                wp: { type: "string" }
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
                additionalProperties: false,
                allOf: [
                    {
                        if: {
                            properties: { step: { const: "activatePlugin" } }
                        },
                        then: {
                            required: ["pluginPath"]
                        }
                    },
                    {
                        if: {
                            properties: { step: { const: "installPlugin" } }
                        },
                        then: {
                            required: ["pluginData"]
                        }
                    },
                    {
                        if: {
                            properties: { step: { const: "setSiteLanguage" } }
                        },
                        then: {
                            required: ["language"]
                        }
                    }
                ],
                properties: {
                    step: {
                        type: "string",
                        enum: [
                            "activatePlugin",
                            "activateTheme",
                            "cp",
                            "defineSiteUrl",
                            "defineWpConfigConsts",
                            "enableMultisite",
                            "importThemeStarterContent",
                            "importWordPressFiles",
                            "importWxr",
                            "installPlugin",
                            "installTheme",
                            "login",
                            "mkdir",
                            "mv",
                            "request",
                            "resetData",
                            "rm",
                            "rmdir",
                            "runPHP",
                            "runPHPWithOptions",
                            "runSql",
                            "runWpInstallationWizard",
                            "setSiteLanguage",
                            "setSiteOptions",
                            "unzip",
                            "updateUserMeta",
                            "wp-cli",
                            "writeFile",
                            "writeFiles"
                        ]
                    },
                    path: { type: ["string", "null"] },
                    pluginPath: { type: "string" },
                    pluginData: {
                        anyOf: [
                            {
                                type: "object",
                                properties: {
                                    resource: {
                                        type: "string",
                                        const: "wordpress.org/plugins"
                                    },
                                    slug: { type: "string" }
                                },
                                required: ["resource", "slug"],
                                additionalProperties: false
                            },
                            {
                                type: "object",
                                properties: {
                                    resource: {
                                        type: "string",
                                        const: "url"
                                    },
                                    url: { type: "string" }
                                },
                                required: ["resource", "url"],
                                additionalProperties: false
                            }
                        ]
                    },
                    data: {
                        anyOf: [
                            { type: "string" },
                            {
                                type: "object",
                                properties: {
                                    resource: { type: "string" },
                                    url: { type: "string" }
                                },
                                required: ["resource", "url"],
                                additionalProperties: false
                            },
                            { type: "null" }
                        ]
                    },
                    file: {
                        type: ["object", "null"],
                        properties: {
                            resource: { type: "string" },
                            url: { type: "string" }
                        },
                        required: ["resource", "url"],
                        additionalProperties: false
                    },
                    options: {
                        type: ["object", "null"],
                        properties: {
                            slug: { type: "string" },
                            blogname: { type: "string" },
                            blogdescription: { type: "string" },
                            woocommerce_currency: { type: "string" },
                            woocommerce_default_country: { type: "string" },
                            woocommerce_weight_unit: { type: "string" },
                            woocommerce_dimension_unit: { type: "string" },
                            woocommerce_allowed_countries: { type: "string" },
                            woocommerce_specific_allowed_countries: {
                                type: "array",
                                items: { type: "string" }
                            },
                            woocommerce_enable_reviews: { type: "boolean" },
                            woocommerce_tax_display_shop: { type: "string" },
                            woocommerce_tax_display_cart: { type: "string" },
                            woocommerce_prices_include_tax: { type: "string" },
                            timezone_string: { type: "string" },
                            WPLANG: { type: "string" }
                        },
                        additionalProperties: false
                    },
                    locale: { type: ["string", "null"] },
                    theme: { type: ["string", "null"] },
                    title: { type: ["string", "null"] },
                    language: { type: ["string", "null"] }
                }
            }
        }
    }
};