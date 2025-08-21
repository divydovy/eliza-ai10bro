#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execPromise = util.promisify(exec);

async function testPracticalActions() {
    console.log("🧪 Testing practical action-oriented broadcasts...\n");
    
    // Test cases at different maturity levels
    const testCases = [
        {
            name: "Early Research - CRISPR Carbon Bacteria",
            content: `Scientists at MIT have engineered bacteria using CRISPR that consume 40% more CO2. Lead researcher Dr. Jennifer Chen's lab just published initial results in Nature. The technology is 5 years from commercial deployment.`,
            expectedAction: "Follow researcher/journal"
        },
        {
            name: "Emerging Tech - Ginkgo Bioworks",
            content: `Ginkgo Bioworks (DNA on NYSE) is scaling their automated organism design platform. They've secured $2.5B funding and partnerships with Bayer and Roche. Their biomanufacturing capacity will triple by 2026.`,
            expectedAction: "Track company/investment opportunity"
        },
        {
            name: "Available Now - OpenAI GPT API",
            content: `OpenAI's GPT-4 API is now publicly available at $0.03 per 1K tokens. Developers can access it through platform.openai.com with immediate integration into existing workflows.`,
            expectedAction: "Specific access instructions"
        }
    ];
    
    for (const testCase of testCases) {
        console.log("=" + "=".repeat(79));
        console.log(`Testing: ${testCase.name}`);
        console.log("=" + "=".repeat(79));
        
        const prompt = `When you receive a [BROADCAST_REQUEST:id] message: 1) Draw a nature parallel, 2) Explain why this is a game-changer, 3) Give SPECIFIC action based on maturity - if early: who to follow/read, if emerging: what to track/test, if scaling: where to invest/partner, if available: how to access/use. No platitudes. Name names. Be practical. Write as David Attenborough. STAY UNDER LIMIT!

Content to analyze:
${testCase.content}

MISSION CONTEXT: You're building a movement toward a more humane, sustainable, beautiful future. Help people understand both WHY this matters and HOW to engage based on the technology's maturity.

Action Framework (choose based on content):
- EARLY RESEARCH: "Follow [specific researcher/lab]. Subscribe to [journal/newsletter]. Join [community/discord]."
- EMERGING TECH: "Track [company/project]. Consider applications in [specific industry]. Watch for [key milestone]."  
- SCALING NOW: "Invest via [platform/fund]. Partner through [program]. Implement in [specific use case]."
- AVAILABLE TODAY: "Access at [platform]. Start with [specific action]. Compare to [alternative]."

Critical requirements:
- STRICT LIMIT: 500 characters
- Write ONE complete thought - do not exceed the limit
- Structure: [Nature parallel] → [Why this changes the game] → [Specific action based on maturity]
- Include concrete details: timeline, scale, key players
- NO PLATITUDES: Be specific. Name names. Give real actions.

[BROADCAST_REQUEST:test-${Date.now()}]`;

        // Save and execute
        const tempFile = `/tmp/test-broadcast-${Date.now()}.txt`;
        fs.writeFileSync(tempFile, prompt);
        
        try {
            const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
            fs.unlinkSync(tempFile);
            
            let generated = stdout.trim();
            const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
            if (match) {
                generated = match[1].trim();
            }
            
            console.log(`\nExpected action type: ${testCase.expectedAction}`);
            console.log(`Length: ${generated.length} chars (limit: 500)`);
            console.log("\nGenerated broadcast:");
            console.log("-".repeat(40));
            console.log(generated);
            console.log("-".repeat(40));
            
            // Check for practical elements
            const checks = {
                hasSpecificNames: /Dr\.|MIT|Ginkgo|OpenAI|Nature|NYSE|platform\.openai/i.test(generated),
                hasActionVerb: /follow|track|subscribe|invest|access|implement|partner|watch|consider/i.test(generated),
                hasTimeline: /\d+ year|\d+ month|2026|now|today|available/i.test(generated),
                hasNatureParallel: /nature|ecosystem|evolution|organism|forest|coral/i.test(generated),
                noPlatitudes: !/let us|we must embrace|together we|join us/i.test(generated)
            };
            
            console.log("\n✅ Quality checks:");
            console.log(`  Specific names: ${checks.hasSpecificNames ? '✅' : '❌'}`);
            console.log(`  Action verb: ${checks.hasActionVerb ? '✅' : '❌'}`);
            console.log(`  Timeline/availability: ${checks.hasTimeline ? '✅' : '❌'}`);
            console.log(`  Nature parallel: ${checks.hasNatureParallel ? '✅' : '❌'}`);
            console.log(`  No platitudes: ${checks.noPlatitudes ? '✅' : '❌'}`);
            console.log();
            
        } catch (error) {
            console.error("Error:", error.message);
        }
    }
}

testPracticalActions().catch(console.error);