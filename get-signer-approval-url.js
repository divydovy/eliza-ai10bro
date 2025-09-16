#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function getSignerApprovalUrl() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;

        console.log('🔍 Fetching signer details from Neynar...\n');
        console.log('Signer UUID:', signerUuid);
        console.log('API Key:', apiKey?.substring(0, 8) + '...\n');

        // Get signer details using direct API call
        const response = await axios.get(
            `https://api.neynar.com/v2/farcaster/signer`,
            {
                params: {
                    signer_uuid: signerUuid
                },
                headers: {
                    'accept': 'application/json',
                    'x-api-key': apiKey,
                    'x-neynar-experimental': true
                }
            }
        );

        console.log('📋 Signer Information:');
        console.log('   Status:', response.data.status);
        console.log('   Public Key:', response.data.public_key);
        console.log('   FID:', response.data.fid || 'Not connected');

        if (response.data.signer_approval_url) {
            console.log('\n✅ Approval URL found!');
            console.log('\n🔗 Click this link to approve your signer:');
            console.log('   ' + response.data.signer_approval_url);
            console.log('\nThis should open in Warpcast where you can approve the signer.');
        } else if (response.data.fid) {
            console.log('\n✅ Signer is already approved and connected to FID:', response.data.fid);
        } else {
            console.log('\n⚠️  No approval URL available.');
            console.log('\nTrying alternative approach...\n');

            // Try to construct a Warpcast deep link
            const deepLinkBase = 'https://client.warpcast.com/deeplinks/signed-key-request';
            const publicKey = response.data.public_key;

            console.log('Alternative URLs to try:');
            console.log('\n1. Warpcast signed key request:');
            console.log(`   ${deepLinkBase}?token=${signerUuid}`);

            console.log('\n2. Direct connect URL:');
            console.log(`   https://warpcast.com/~/settings/verified-addresses?public-key=${publicKey}`);

            console.log('\n3. Manual approval in Warpcast:');
            console.log('   - Open Warpcast');
            console.log('   - Go to Settings → Advanced → Manage signers');
            console.log('   - Add this public key manually:');
            console.log(`   ${publicKey}`);
        }

        return response.data;

    } catch (error) {
        console.error('❌ Error fetching signer details:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

// Run the script
getSignerApprovalUrl();