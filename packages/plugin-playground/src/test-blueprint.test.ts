import { describe, it, expect } from 'vitest';
import { testBlueprintExtraction } from "./actions/create-playground";
import { BlueprintData } from "./actions/generate-blueprint";

describe('Blueprint Extraction', () => {
  it('should extract valid JSON from blueprint field', () => {
    // New format with blueprint field
    const rawEntry = `{
      "text": "I've generated a blueprint for your store with all the essential configurations!",
      "action": "GENERATE_BLUEPRINT",
      "normalized": "GENERATE_BLUEPRINT",
      "shouldHandle": true,
      "blueprint": {
        "$schema": "https://playground.wordpress.net/blueprint-schema.json",
        "meta": {
          "title": "Artisanal Marmalade Store",
          "description": "Portuguese Handmade Marmalades Shop for Portugal & Spain",
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
              "blogname": "Artisanal Marmalade Store",
              "blogdescription": "Handcrafted Portuguese Marmalades",
              "woocommerce_currency": "EUR",
              "woocommerce_default_country": "PT",
              "woocommerce_weight_unit": "kg",
              "woocommerce_dimension_unit": "cm",
              "woocommerce_allowed_countries": "specific",
              "woocommerce_specific_allowed_countries": ["PT", "ES"],
              "woocommerce_enable_reviews": true,
              "woocommerce_tax_classes": "Reduced Rate\\nZero Rate",
              "woocommerce_prices_include_tax": "yes"
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
          },
          {
            "step": "installPlugin",
            "pluginZipFile": {
              "resource": "wordpress.org/plugins",
              "slug": "polylang"
            },
            "options": {
              "activate": true
            }
          },
          {
            "step": "installPlugin",
            "pluginZipFile": {
              "resource": "wordpress.org/plugins",
              "slug": "woocommerce-product-addons"
            },
            "options": {
              "activate": true
            }
          }
        ]
      }
    }`;

    const result = testBlueprintExtraction(rawEntry) as BlueprintData | null;
    expect(result).not.toBeNull();
    if (result) {
      // Verify we have a valid blueprint with the required fields
      expect(result.$schema).toBe("https://playground.wordpress.net/blueprint-schema.json");
      expect(result.meta).toBeDefined();
      expect(Array.isArray(result.steps)).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      // Verify first step is properly formatted
      expect(result.steps[0]).toHaveProperty('step');
    }
  });
});