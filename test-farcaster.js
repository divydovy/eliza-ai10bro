#!/usr/bin/env node

const { NeynarAPIClient, Configuration } = require('@neynar/nodejs-sdk');
require('dotenv').config();

async function testFarcasterConnection() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = process.env.FARCASTER_FID || 1331903;

        console.log('🔍 Testing Farcaster connection...');
        console.log(`   API Key: ${apiKey?.substring(0, 8)}...`);
        console.log(`   Signer UUID: ${signerUuid}`);
        console.log(`   FID: ${fid}`);

        // Initialize Neynar client with v2 configuration
        const config = new Configuration({
            apiKey: apiKey,
            baseOptions: {
                headers: {
                    "x-neynar-experimental": true,
                },
            },
        });
        const client = new NeynarAPIClient(config);

        // Test 1: Get user details
        console.log('\n📋 Getting user details for FID:', fid);
        const user = await client.fetchBulkUsers([fid]);
        if (user.users && user.users[0]) {
            console.log(`   Username: @${user.users[0].username}`);
            console.log(`   Display Name: ${user.users[0].display_name}`);
            console.log(`   Bio: ${user.users[0].profile.bio.text}`);
        }

        // Test 2: Get signer status
        console.log('\n🔑 Checking signer status...');
        try {
            const signer = await client.lookupSigner(signerUuid);
            console.log(`   Signer Status: ${signer.status}`);
            console.log(`   Connected FID: ${signer.fid || 'Not connected'}`);

            if (signer.status === 'approved' && signer.fid) {
                console.log('\n✅ Signer is approved and ready to use!');

                // Test 3: Try to post a test cast (in dry run mode)
                if (process.env.FARCASTER_DRY_RUN === 'true') {
                    console.log('\n📝 Would post test cast (DRY RUN mode)');
                } else {
                    console.log('\n📝 Attempting to post test cast...');
                    const cast = await client.publishCast(
                        signerUuid,
                        'Testing Farcaster integration with ElizaOS 🤖'
                    );
                    console.log(`   Cast posted! Hash: ${cast.hash}`);
                }
            } else {
                console.log('\n⚠️ Signer needs approval!');
                console.log('   Visit the approval URL or use the public key to connect');
            }
        } catch (signerError) {
            console.log('   Signer error:', signerError.message);
        }

        // Test 4: Check for recent mentions
        console.log('\n📬 Checking for recent mentions...');
        const mentions = await client.fetchAllNotifications(fid, { limit: 5 });
        console.log(`   Found ${mentions.notifications?.length || 0} recent notifications`);

        console.log('\n✅ Farcaster connection test complete!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('   API Response:', error.response.data);
        }
        process.exit(1);
    }
}

// Run the test
testFarcasterConnection();