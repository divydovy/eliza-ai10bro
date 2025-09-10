#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function createFarcasterSigner() {
    const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
    
    if (!apiKey) {
        console.error('❌ FARCASTER_NEYNAR_API_KEY not found in .env');
        process.exit(1);
    }
    
    console.log('🎭 Creating Farcaster Signer with Neynar...\n');
    
    try {
        // Step 1: Create a signer
        const response = await axios.post(
            'https://api.neynar.com/v2/farcaster/signer',
            {},
            {
                headers: {
                    'accept': 'application/json',
                    'x-api-key': apiKey,
                    'content-type': 'application/json'
                }
            }
        );
        
        const signer = response.data;
        
        console.log('✅ Signer created successfully!\n');
        console.log('📋 Signer Details:');
        console.log('   UUID:', signer.signer_uuid);
        console.log('   Status:', signer.status);
        console.log('   Public Key:', signer.public_key);
        console.log('\n');
        
        // Display QR code for approval
        if (signer.signer_approval_url) {
            console.log('📱 APPROVAL REQUIRED:');
            console.log('   1. Open Warpcast on your phone');
            console.log('   2. Scan this QR code OR visit the URL below:');
            console.log('   URL:', signer.signer_approval_url);
            console.log('\n');
            console.log('⏳ After approving in Warpcast, add this to your .env:');
            console.log('   FARCASTER_NEYNAR_SIGNER_UUID=' + signer.signer_uuid);
            console.log('\n');
            
            // Poll for approval status
            console.log('Checking approval status (will check every 5 seconds for 2 minutes)...\n');
            
            let approved = false;
            let attempts = 0;
            const maxAttempts = 24; // 2 minutes (24 * 5 seconds)
            
            while (!approved && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                
                try {
                    const statusResponse = await axios.get(
                        `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signer.signer_uuid}`,
                        {
                            headers: {
                                'accept': 'application/json',
                                'x-api-key': apiKey
                            }
                        }
                    );
                    
                    if (statusResponse.data.status === 'approved') {
                        approved = true;
                        console.log('🎉 Signer approved successfully!');
                        console.log('✅ Your signer is ready to use.');
                        console.log('\n📝 Add this to your .env file:');
                        console.log(`FARCASTER_NEYNAR_SIGNER_UUID=${signer.signer_uuid}`);
                    } else {
                        process.stdout.write('.');
                    }
                } catch (err) {
                    // Ignore errors during polling
                }
                
                attempts++;
            }
            
            if (!approved) {
                console.log('\n\n⏱️  Timeout waiting for approval.');
                console.log('Please complete the approval in Warpcast and then add the UUID to your .env:');
                console.log(`FARCASTER_NEYNAR_SIGNER_UUID=${signer.signer_uuid}`);
            }
            
        } else {
            console.log('⚠️  No approval URL provided. The signer might already be approved.');
            console.log('Add this to your .env:');
            console.log('FARCASTER_NEYNAR_SIGNER_UUID=' + signer.signer_uuid);
        }
        
    } catch (error) {
        console.error('❌ Error creating signer:', error.response?.data || error.message);
        
        if (error.response?.status === 403) {
            console.log('\n💡 Tip: Make sure your API key is valid and has the necessary permissions.');
        }
    }
}

// Run the script
createFarcasterSigner();