#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function registerSignerWithFid() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = parseInt(process.env.FARCASTER_FID || '1331903');
        const publicKey = '0xdb881d11d4771fa30c687ca0f1befb9db8d00b1261bdff132c72fcd7989971bd';

        console.log('🔗 Attempting to register signer with FID...\n');
        console.log('Configuration:');
        console.log('   Signer UUID:', signerUuid);
        console.log('   Target FID:', fid);
        console.log('   Public Key:', publicKey);
        console.log('   API Key:', apiKey?.substring(0, 8) + '...\n');

        // Option 1: Try to use the developer-managed signer endpoint
        console.log('Attempting developer-managed signer registration...\n');

        try {
            const response = await axios.post(
                'https://api.neynar.com/v2/farcaster/signer/developer_managed',
                {
                    public_key: publicKey,
                    fid: fid,
                    deadline: Math.floor(Date.now() / 1000) + 86400 // 24 hours from now
                },
                {
                    headers: {
                        'accept': 'application/json',
                        'x-api-key': apiKey,
                        'content-type': 'application/json',
                        'x-neynar-experimental': true
                    }
                }
            );

            console.log('✅ Developer signer registered!');
            console.log('Response:', JSON.stringify(response.data, null, 2));

            if (response.data.signer_approval_url) {
                console.log('\n🔗 Approval URL:');
                console.log(response.data.signer_approval_url);
            }

        } catch (devError) {
            console.log('Developer-managed signer failed:', devError.response?.data?.message || devError.message);
            console.log('\nTrying alternative method...\n');

            // Option 2: Try the signed key request endpoint
            try {
                const signedKeyResponse = await axios.post(
                    'https://api.neynar.com/v2/farcaster/signer/signed_key_request',
                    {
                        signer_uuid: signerUuid,
                        fid: fid,
                        deadline: Math.floor(Date.now() / 1000) + 86400
                    },
                    {
                        headers: {
                            'accept': 'application/json',
                            'x-api-key': apiKey,
                            'content-type': 'application/json',
                            'x-neynar-experimental': true
                        }
                    }
                );

                console.log('✅ Signed key request created!');
                console.log('Response:', JSON.stringify(signedKeyResponse.data, null, 2));

                if (signedKeyResponse.data.deep_link_url) {
                    console.log('\n🔗 Deep link URL:');
                    console.log(signedKeyResponse.data.deep_link_url);
                }

            } catch (signedError) {
                console.log('Signed key request failed:', signedError.response?.data?.message || signedError.message);
            }
        }

        // Option 3: Manual approval instructions
        console.log('\n📱 Manual Approval Method:');
        console.log('=====================================');
        console.log('\nSince automatic registration isn\'t working, here\'s how to manually approve:');
        console.log('\n1. Open Warpcast on your phone or browser');
        console.log('2. Make sure you\'re logged in with FID:', fid);
        console.log('3. Go to Settings → Advanced → Manage signers');
        console.log('4. Tap "Add a signer app manually"');
        console.log('5. Enter this public key:');
        console.log(`   ${publicKey}`);
        console.log('\n6. Approve the signer');
        console.log('\n7. Run this to verify: node check-farcaster-signer.js');
        console.log('\n=====================================');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('API Response:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Run the script
registerSignerWithFid();