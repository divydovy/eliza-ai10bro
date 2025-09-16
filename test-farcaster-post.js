#!/usr/bin/env node

const { Configuration, NeynarAPIClient } = require('@neynar/nodejs-sdk');
require('dotenv').config();

async function testFarcasterPost() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = process.env.FARCASTER_FID || 1331903;

        console.log('🚀 Testing Farcaster Live Post...\n');
        console.log('Configuration:');
        console.log('   FID:', fid);
        console.log('   Signer UUID:', signerUuid);
        console.log('   Dry Run:', process.env.FARCASTER_DRY_RUN);
        console.log('');

        // Initialize Neynar client
        const config = new Configuration({
            apiKey: apiKey,
            baseOptions: {
                headers: {
                    "x-neynar-experimental": true,
                },
            },
        });
        const client = new NeynarAPIClient(config);

        // Create test message
        const testMessage = `🤖 Testing ElizaOS Farcaster integration\n\n` +
                          `✅ Agent: ai10bro\n` +
                          `✅ Platform: Farcaster\n` +
                          `✅ Time: ${new Date().toISOString()}\n\n` +
                          `This is an automated test broadcast from my ElizaOS agent.`;

        console.log('📝 Message to post:');
        console.log('-------------------');
        console.log(testMessage);
        console.log('-------------------\n');

        // Post the cast
        console.log('📤 Sending cast...');
        const result = await client.publishCast({
            signerUuid: signerUuid,
            text: testMessage,
        });

        console.log('\n✅ Cast posted successfully!');
        console.log('Cast details:');
        console.log('   Hash:', result.cast.hash);
        console.log('   Author FID:', result.cast.author.fid);
        console.log('   Timestamp:', result.cast.timestamp);

        // Generate Warpcast URL
        const warpcastUrl = `https://warpcast.com/~/conversations/${result.cast.hash}`;
        console.log('\n🔗 View on Warpcast:');
        console.log('   ' + warpcastUrl);

        return result;

    } catch (error) {
        console.error('\n❌ Error posting to Farcaster:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

// Run the test
testFarcasterPost();