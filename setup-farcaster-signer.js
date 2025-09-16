#!/usr/bin/env node

const { Configuration, NeynarAPIClient } = require('@neynar/nodejs-sdk');
require('dotenv').config();

async function setupFarcasterSigner() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const existingSignerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = parseInt(process.env.FARCASTER_FID || '1331903');

        if (!apiKey) {
            throw new Error('FARCASTER_NEYNAR_API_KEY must be set in .env');
        }

        console.log('🔧 Farcaster Signer Setup');
        console.log('==========================\n');

        // Initialize Neynar client v2
        const config = new Configuration({
            apiKey: apiKey,
            baseOptions: {
                headers: {
                    "x-neynar-experimental": true,
                },
            },
        });
        const client = new NeynarAPIClient(config);

        // Check if we have an existing signer UUID
        if (existingSignerUuid) {
            console.log('📋 Checking existing signer:', existingSignerUuid);

            try {
                // Check signer status using Neynar API
                const signer = await client.lookupSigner(existingSignerUuid);

                console.log('   Status:', signer.status);
                console.log('   Connected FID:', signer.fid || 'Not connected');

                if (signer.status === 'approved' && signer.fid) {
                    console.log('\n✅ Signer is already connected and ready to use!');
                    console.log('   You can run: pnpm start');
                    return;
                }

                if (signer.signer_approval_url) {
                    console.log('\n🔗 Your signer needs approval!');
                    console.log('   Open this URL in your browser or Warpcast app:');
                    console.log('   ' + signer.signer_approval_url);
                    console.log('\n   After approving, run: node check-farcaster-signer.js');
                    return;
                }
            } catch (error) {
                console.log('   Could not fetch signer details:', error.message);
            }
        }

        // Create a new signer if needed
        console.log('\n🔑 Creating a new signer...');
        console.log('   Target FID:', fid);

        try {
            // Neynar handles the key generation and signing internally
            const createSignerResponse = await client.createSigner();

            console.log('\n✅ New signer created!');
            console.log('   Full response:', JSON.stringify(createSignerResponse, null, 2));
            console.log('   Signer UUID:', createSignerResponse.signer_uuid);
            console.log('   Status:', createSignerResponse.status);
            console.log('   Public Key:', createSignerResponse.public_key);

            if (createSignerResponse.signer_approval_url) {
                console.log('\n🔗 To connect this signer to your Farcaster account:');
                console.log('   1. Open this URL in your browser or Warpcast:');
                console.log('      ' + createSignerResponse.signer_approval_url);
                console.log('\n   2. Approve the signer request in Warpcast');
                console.log('\n   3. Update your .env file with:');
                console.log('      FARCASTER_NEYNAR_SIGNER_UUID=' + createSignerResponse.signer_uuid);
                console.log('\n   4. Run: node check-farcaster-signer.js');
            }

            // Also show the QR code URL if available
            if (createSignerResponse.signer_approval_url) {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(createSignerResponse.signer_approval_url)}`;
                console.log('\n📱 Or scan QR code at:');
                console.log('   ' + qrUrl);
            }

        } catch (error) {
            console.error('\n❌ Error creating signer:', error.message);
            if (error.response?.data) {
                console.error('   Details:', JSON.stringify(error.response.data, null, 2));
            }

            console.log('\n💡 Alternative: Manual Signer Setup');
            console.log('   1. Go to https://dev.neynar.com/app');
            console.log('   2. Create a new signer in the dashboard');
            console.log('   3. Copy the signer UUID');
            console.log('   4. Update FARCASTER_NEYNAR_SIGNER_UUID in .env');
            console.log('   5. Follow the connection instructions');
        }

    } catch (error) {
        console.error('❌ Setup error:', error.message);
        process.exit(1);
    }
}

// Run the setup
setupFarcasterSigner();