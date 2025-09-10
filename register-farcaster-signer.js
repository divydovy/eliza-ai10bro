#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function registerSigner() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        const fid = 1331903; // Your FID
        
        if (!apiKey || !signerUuid) {
            throw new Error('FARCASTER_NEYNAR_API_KEY and FARCASTER_NEYNAR_SIGNER_UUID must be set in environment');
        }
        
        console.log('🔗 Attempting to register signer with FID...');
        console.log(`   FID: ${fid}`);
        console.log(`   Signer UUID: ${signerUuid}`);
        
        // Try to register the signer with your FID
        const response = await axios.post(
            'https://api.neynar.com/v2/farcaster/signer/register',
            {
                signer_uuid: signerUuid,
                fid: fid
            },
            {
                headers: {
                    'accept': 'application/json',
                    'x-api-key': apiKey,
                    'content-type': 'application/json'
                }
            }
        );
        
        console.log('\n✅ Registration response:', response.data);
        
        if (response.data.signer_approval_url) {
            console.log(`\n🔗 Approval URL: ${response.data.signer_approval_url}`);
        }
        
        if (response.data.deep_link_url) {
            console.log(`\n📱 Mobile Deep Link: ${response.data.deep_link_url}`);
        }
        
        return response.data;
        
    } catch (error) {
        if (error.response) {
            console.error('❌ API Error:', error.response.data);
            
            // If already registered, try to get the current status
            if (error.response.data.message && error.response.data.message.includes('already')) {
                console.log('\n📋 Signer may already be registered. Checking status...');
                const checkScript = require('./check-farcaster-signer.js');
                await checkScript.checkSignerStatus();
            }
        } else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    registerSigner();
}

module.exports = { registerSigner };