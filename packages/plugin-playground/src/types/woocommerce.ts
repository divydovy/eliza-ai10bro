export interface WooCommerceProduct {
    name: string;
    price: number;
    description: string;
    sku?: string;
    categories?: string[];
    images?: string[];
    attributes?: Array<{
        name: string;
        options: string[];
    }>;
}

export interface WooCommerceStoreSettings {
    storeName: string;
    storeDescription: string;
    currency: string;
    country: string;
    city?: string;
    weightUnit?: 'kg' | 'g' | 'lbs' | 'oz';
    dimensionUnit?: 'cm' | 'm' | 'in' | 'yd';
    address?: {
        address1: string;
        address2?: string;
        city: string;
        state: string;
        postcode: string;
    };
    shipping?: {
        zones: Array<{
            name: string;
            regions: string[];
            methods: Array<{
                type: 'flat_rate' | 'free_shipping' | 'local_pickup';
                cost?: number;
            }>;
        }>;
    };
    tax?: {
        enabled: boolean;
        rates?: Array<{
            country: string;
            state: string;
            rate: number;
            name: string;
        }>;
    };
    paymentMethods?: {
        cheque?: {
            enabled: boolean;
        };
    };
    paymentGateways?: WooCommercePaymentGateway[];
    extensions?: WooCommerceExtension[];
    subscriptionSettings?: {
        enabled: boolean;
        allowSwitching?: boolean;
        allowPausingSubscriptions?: boolean;
        signupFee?: number;
    };
    taxSettings?: {
        enabled: boolean;
        prices_include_tax?: boolean;
        tax_based_on?: 'shipping' | 'billing' | 'base';
        shipping_tax_class?: 'inherit' | 'standard' | 'reduced-rate' | 'zero-rate';
    };
}

export interface BlueprintMeta {
    title: string;
    description: string;
    author?: string;
    categories?: string[];
}

export interface BlueprintFeatures {
    networking?: boolean;
}

export interface BlueprintStep {
    step: string;
    [key: string]: any;
}

export interface WooCommerceBlueprint {
    $schema: string;
    meta?: {
        title?: string;
        description?: string;
        categories?: string[];
    };
    landingPage?: string;
    preferredVersions?: {
        php?: string;
        wp?: string;
    };
    features?: {
        networking?: boolean;
    };
    plugins?: string[];
    steps: BlueprintStep[];
}

export interface WooCommerceOptions {
    store: WooCommerceStoreSettings;
    products?: WooCommerceProduct[];
    demoContent?: boolean;
    setupWizard?: boolean;
    theme?: {
        name: string;
        files?: Array<{
            path: string;
            url: string;
        }>;
    };
}

export interface WooCommerceExtension {
    name: string;
    slug: string;
    isPaid: boolean;
    price?: string;
    description: string;
    url?: string;
}

export interface WooCommercePaymentGateway {
    name: string;
    provider: 'square' | 'stripe' | 'paypal' | 'cheque' | 'other';
    enabled: boolean;
    settings?: {
        [key: string]: any;
    };
}