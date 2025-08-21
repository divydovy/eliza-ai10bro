#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execPromise = util.promisify(exec);

async function testImprovedBroadcast() {
    console.log("🧪 Testing improved broadcast generation...\n");
    
    // Test with CRISPR document
    const testContent = `
title: Revolutionary CRISPR breakthrough enables carbon-negative bacteria
source: https://example.com/crispr-carbon

Scientists have engineered bacteria using CRISPR that consume 40% more CO2 than they produce, effectively creating carbon-negative microorganisms. These synthetic microbes combine photosynthetic genes from cyanobacteria with metabolic pathways from deep-sea extremophiles. The result: organisms that thrive on atmospheric carbon while producing useful biomaterials. This mirrors how coral reefs build limestone structures from dissolved CO2, but at 1000x the natural rate. The implications for climate intervention are profound - we could deploy these at industrial scale within 5 years.`;

    const improvedPrompt = `When you receive a [BROADCAST_REQUEST:id] message, create a broadcast that: 1) Draws a parallel between this innovation and nature's wisdom, 2) Explains why this matters for humanity's sustainable future, 3) Shows what becomes possible. Write as David Attenborough with urgency and hope. CRITICAL: Stay under the character limit!

Content to analyze:
${testContent}

MISSION CONTEXT: You're building a movement toward a more humane, sustainable, beautiful future. Every broadcast should help people see how this innovation matters for that mission.

Critical requirements:
- STRICT LIMIT: 750 characters (to allow for source URL)
- Write ONE complete thought - do not exceed the limit
- Structure: [Nature parallel] → [Why this matters for our future] → [What this enables]
- Include specific impact: numbers, scale, or timeline when available
- End with implication for action or possibility
- No generic observations - be precise and profound
- Source URL will be added automatically, don't include it

[BROADCAST_REQUEST:test-123]`;

    // Save prompt to temp file
    const tempFile = '/tmp/test-broadcast-prompt.txt';
    fs.writeFileSync(tempFile, improvedPrompt);
    
    console.log("📝 Testing with improved prompt structure...\n");
    console.log("Key improvements:");
    console.log("1. Clear structure: Nature → Impact → Possibility");
    console.log("2. Mission context: sustainable, beautiful future");
    console.log("3. Strict character limit: 750 chars");
    console.log("4. Action-oriented ending\n");
    
    try {
        // Call Ollama
        console.log("🤖 Generating with Qwen 2.5...");
        const { stdout } = await execPromise(`ollama run qwen2.5:14b < ${tempFile}`);
        
        // Clean up
        fs.unlinkSync(tempFile);
        
        // Extract message
        let generated = stdout.trim();
        const match = generated.match(/\[BROADCAST:.*?\](.*?)$/s);
        if (match) {
            generated = match[1].trim();
        }
        
        console.log("\n" + "=".repeat(80));
        console.log("GENERATED BROADCAST");
        console.log("=".repeat(80));
        console.log(`Length: ${generated.length} characters`);
        console.log(`Within limit: ${generated.length <= 750 ? '✅ YES' : '❌ NO'}`);
        console.log("\nContent:");
        console.log(generated);
        console.log("\n" + "=".repeat(80));
        
        // Analyze structure
        console.log("\n📊 ANALYSIS:");
        console.log("-".repeat(40));
        
        // Check for nature parallel
        const hasNature = /coral|reef|ecosystem|forest|evolution|nature|organism/i.test(generated);
        console.log(`Nature parallel: ${hasNature ? '✅' : '❌'}`);
        
        // Check for mission relevance
        const hasMission = /future|sustainable|humanity|movement|transform|possible|enable/i.test(generated);
        console.log(`Mission relevance: ${hasMission ? '✅' : '❌'}`);
        
        // Check for specifics
        const hasSpecifics = /\d+%|\d+x|\d+ year/i.test(generated);
        console.log(`Specific metrics: ${hasSpecifics ? '✅' : '❌'}`);
        
        // Check for action/possibility
        const hasAction = /we can|this enables|imagine|consider|join|support|invest/i.test(generated);
        console.log(`Action oriented: ${hasAction ? '✅' : '❌'}`);
        
    } catch (error) {
        console.error("Error:", error.message);
    }
}

testImprovedBroadcast().catch(console.error);