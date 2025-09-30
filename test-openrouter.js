#!/usr/bin/env node

// Test OpenRouter integration for broadcast generation
require('dotenv').config();

// Copy the OpenRouter function from process-unprocessed-docs.js
async function generateBroadcastWithOpenRouter(prompt) {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'nousresearch/hermes-3-llama-3.1-405b';

    if (!OPENROUTER_API_KEY) {
        console.log('⚠️  No OpenRouter API key found, would fallback to local ollama');
        return "TEST: No API key configured - would use ollama fallback";
    }

    try {
        console.log(`📡 Calling OpenRouter with model: ${model}`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'X-Title': 'Eliza AI10BRO Broadcast Generation'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert content creator specializing in engaging, professional broadcasts about technology and sustainability. Create compelling content that connects academic findings to real-world impact and market trends.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 200,
                temperature: 0.8
            })
        });

        const data = await response.json();

        if (data.choices && data.choices[0] && data.choices[0].message) {
            console.log('✅ OpenRouter response received');
            return data.choices[0].message.content.trim();
        } else {
            console.log('⚠️  OpenRouter response error:', JSON.stringify(data, null, 2));
            return "ERROR: Invalid OpenRouter response";
        }
    } catch (error) {
        console.log('⚠️  OpenRouter API error:', error.message);
        return `ERROR: ${error.message}`;
    }
}

// Test with a simple prompt
const testPrompt = `
Create an engaging broadcast about this breakthrough:

CONTENT: Solar paint technology reaches 25% efficiency, making it cost-competitive with traditional panels. Applied like regular paint, it could turn any surface into an energy generator.

TREND CONTEXT: Part of the $1.8 trillion energy transition. Solar costs have dropped 89% since 2010.

Create a professional but engaging broadcast (300-400 chars) that:
- Uses a direct news hook (not "imagine")
- Connects to the broader energy transition
- Includes the efficiency milestone
- Ends with impact/call to action

OUTPUT YOUR BROADCAST NOW (no labels, just the engaging text):
`;

async function main() {
    console.log('🧪 Testing OpenRouter Integration');
    console.log('='.repeat(50));

    const result = await generateBroadcastWithOpenRouter(testPrompt);

    console.log('\n📝 Generated Broadcast:');
    console.log(result);
    console.log(`\n📊 Length: ${result.length} characters`);
}

main().catch(console.error);