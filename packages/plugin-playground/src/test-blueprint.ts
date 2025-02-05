import { elizaLogger } from "@elizaos/core";
import { fileURLToPath } from 'url';

// The raw database entry to test
const rawEntry = `{"text":"{\\\"$schema\\\":\\\"https://playground.wordpress.net/blueprint-schema.json\\\",\\\"meta\\\":{\\\"title\\\":\\\"Marmalade Shop Portugal & Spain\\\",\\\"description\\\":\\\"WooCommerce store for homemade marmalades with shipping to Portugal and Spain\\\",\\\"author\\\":\\\"WooGuide\\\",\\\"categories\\\":\\\"ecommerce\\\",\\\"food\\\"},\\\"landingPage\\\":\\\"/shop\\\",\\\"preferredVersions\\\":{\\\"php\\\":\\\"8.2\\\",\\\"wp\\\":\\\"6.4\\\"},\\\"features\\\":{\\\"networking\\\":true},\\\"steps\\\":{\\\"step\\\":\\\"resetData\\\",\\\"options\\\":{}},{\\\"step\\\":\\\"setSiteOptions\\\",\\\"options\\\":{\\\"woocommerce\\\\_default\\\\_country\\\":\\\"PT\\\",\\\"woocommerce\\\\_currency\\\":\\\"EUR\\\",\\\"woocommerce\\\\_price\\\\_thousand\\\\_sep\\\":\\\".\\\",\\\"woocommerce\\\\_price\\\\_decimal\\\\_sep\\\":\\\",\\\",\\\"woocommerce\\\\_weight\\\\_unit\\\":\\\"kg\\\",\\\"woocommerce\\\\_dimension\\\\_unit\\\":\\\"cm\\\"}},{\\\"step\\\":\\\"installPlugin\\\",\\\"pluginZipFile\\\":{\\\"resource\\\":\\\"wordpress.org/plugins\\\",\\\"slug\\\":\\\"woocommerce\\\"},\\\"options\\\":{\\\"activate\\\":true}},{\\\"step\\\":\\\"installPlugin\\\",\\\"pluginZipFile\\\":{\\\"resource\\\":\\\"wordpress.org/plugins\\\",\\\"slug\\\":\\\"polylang\\\"},\\\"options\\\":{\\\"activate\\\":true}},{\\\"step\\\":\\\"installPlugin\\\",\\\"pluginZipFile\\\":{\\\"resource\\\":\\\"wordpress.org/plugins\\\",\\\"slug\\\":\\\"woocommerce-product-addons\\\"},\\\"options\\\":{\\\"activate\\\":true}},{\\\"step\\\":\\\"installPlugin\\\",\\\"pluginZipFile\\\":{\\\"resource\\\":\\\"wordpress.org/plugins\\\",\\\"slug\\\":\\\"eu-vat-for-woocommerce\\\"},\\\"options\\\":{\\\"activate\\\":true}}}","action":"GENERATE_BLUEPRINT","inReplyTo":"9263b2be-2332-0d64-bc2d-21b65e93dbb9"}`;

// Run the test
console.log("Starting blueprint extraction test...");
testBlueprintExtraction(rawEntry);

// Test samples that represent common issues
const problematicSamples = {
    stepsNotArray: `{
        "steps": {"step": "resetData"},{"step": "setSiteOptions"}
    }`,
    malformedAllowedCountries: `{
        "woocommerce_specific_allowed_countries": ["PT", "ES", "woocommerce_enable_reviews": true]
    }`,
    doubleEscaped: `{"text":"{\\\"$schema\\\":\\\"https://playground.wordpress.net/blueprint-schema.json\\\",\\\"meta\\\":{\\\"title\\\":\\\"Marmalade Shop Portugal & Spain\\\",\\\"description\\\":\\\"WooCommerce store for homemade marmalades with shipping to Portugal and Spain\\\",\\\"author\\\":\\\"WooGuide\\\",\\\"categories\\\":\\\"ecommerce\\\",\\\"food\\\"},\\\"landingPage\\\":\\\"/shop\\\",\\\"preferredVersions\\\":{\\\"php\\\":\\\"8.2\\\",\\\"wp\\\":\\\"6.4\\\"},\\\"features\\\":{\\\"networking\\\":true},\\\"steps\\\":{\\\"step\\\":\\\"resetData\\\",\\\"options\\\":{}},{\\\"step\\\":\\\"setSiteOptions\\\",\\\"options\\\":{\\\"woocommerce\\\\_default\\\\_country\\\":\\\"PT\\\",\\\"woocommerce\\\\_currency\\\":\\\"EUR\\\",\\\"woocommerce\\\\_price\\\\_thousand\\\\_sep\\\":\\\".\\\",\\\"woocommerce\\\\_price\\\\_decimal\\\\_sep\\\":\\\",\\\",\\\"woocommerce\\\\_weight\\\\_unit\\\":\\\"kg\\\",\\\"woocommerce\\\\_dimension\\\\_unit\\\":\\\"cm\\\"}}}","action":"GENERATE_BLUEPRINT"}`
};

function preprocessJson(input: string): string {
    try {
        // Handle double-escaped JSON from database
        if (input.includes('\\"')) {
            const parsed = JSON.parse(input);
            if (parsed.text) {
                input = JSON.parse(parsed.text);
            }
        }

        // First try to parse it as is
        let data = JSON.parse(input);
        elizaLogger.info('Initial parse successful');
        return JSON.stringify(data, null, 2);
    } catch (e) {
        elizaLogger.info('Initial parse failed, attempting fixes');

        // Fix steps format
        if (input.includes('"steps":') && !input.includes('"steps": [')) {
            const stepsStart = input.indexOf('"steps":') + 8;
            let bracketCount = 0;
            let inSteps = false;
            const stepObjects = [];
            let currentObject = '';

            for (let i = stepsStart; i < input.length; i++) {
                const char = input[i];

                if (char === '{') {
                    bracketCount++;
                    inSteps = true;
                }
                if (inSteps) {
                    currentObject += char;
                }
                if (char === '}') {
                    bracketCount--;
                    if (bracketCount === 0 && inSteps) {
                        stepObjects.push(currentObject);
                        currentObject = '';
                        inSteps = false;
                    }
                }
            }

            const stepsArray = `"steps": [${stepObjects.join(',')}]`;
            input = input.replace(/"steps":.*?(?=,|\}|$)/, stepsArray);
            elizaLogger.info('Fixed steps array:', { result: stepsArray });
        }

        // Fix allowed countries
        if (input.includes('woocommerce_specific_allowed_countries')) {
            const match = input.match(/"woocommerce_specific_allowed_countries"\s*:\s*\[(.*?)(?:\]|,\s*")/);
            if (match) {
                const content = match[1];
                const countries = content.split(',')
                    .map(item => item.trim())
                    .filter(item => item.startsWith('"') && item.endsWith('"'));
                const fixed = `"woocommerce_specific_allowed_countries": [${countries.join(',')}]`;
                input = input.replace(/"woocommerce_specific_allowed_countries"\s*:\s*\[.*?(?:\]|,\s*")/, fixed);
                elizaLogger.info('Fixed allowed countries:', { result: fixed });
            }
        }

        try {
            // Try to parse again after fixes
            const data = JSON.parse(input);
            elizaLogger.info('Parse successful after fixes');
            return JSON.stringify(data, null, 2);
        } catch (e) {
            elizaLogger.error('Failed to fix JSON:', { error: e });
            throw e;
        }
    }
}

// Test function
export function testPreprocessing() {
    Object.entries(problematicSamples).forEach(([name, sample]) => {
        console.log(`\nTesting ${name}:`);
        try {
            const result = preprocessJson(sample);
            console.log('Success:', result);
        } catch (e) {
            console.log('Failed:', e);
        }
    });
}

// Run tests if this is the main module
if (import.meta.url === fileURLToPath(process.argv[1])) {
    testPreprocessing();
}