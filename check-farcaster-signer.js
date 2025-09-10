#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function checkSignerStatus() {
    try {
        const apiKey = process.env.FARCASTER_NEYNAR_API_KEY;
        const signerUuid = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
        
        if (!apiKey || !signerUuid) {
            throw new Error('FARCASTER_NEYNAR_API_KEY and FARCASTER_NEYNAR_SIGNER_UUID must be set in environment');
        }
        
        console.log('🔍 Checking Farcaster signer status...');
        console.log(`   API Key: ${apiKey.substring(0, 8)}...`);
        console.log(`   Signer UUID: ${signerUuid}`);
        
        // Get signer details
        const response = await axios.get(
            `https://api.neynar.com/v2/farcaster/signer?signer_uuid=${signerUuid}`,
            {
                headers: {
                    'accept': 'application/json',
                    'x-api-key': apiKey
                }
            }
        );
        
        console.log('\n📋 Signer Details:');
        console.log(`   Status: ${response.data.status || 'Unknown'}`);
        console.log(`   FID: ${response.data.fid || 'Not connected'}`);
        console.log(`   Public Key: ${response.data.public_key}`);
        
        if (response.data.signer_approval_url) {
            console.log(`\n🔗 Approval URL: ${response.data.signer_approval_url}`);
        }
        
        // Try to get the deep link format for farcaster.xyz
        if (response.data.public_key && !response.data.fid) {
            const publicKey = response.data.public_key;
            console.log('\n⚠️  Signer not approved yet!');
            console.log('\n📱 Alternative approval methods:');
            console.log(`   1. Try this URL in browser: https://farcaster.xyz/connect?publicKey=${publicKey}`);
            console.log(`   2. Scan QR code with Farcaster mobile app`);
            console.log(`   3. Import signer key manually in Farcaster settings`);
            console.log('\n💡 Signer Public Key for manual approval:');
            console.log(`   ${publicKey}`);
        }
        
        if (response.data.fid) {
            console.log('\n✅ Signer is approved and ready to use!');
            console.log(`   Connected to FID: ${response.data.fid}`);
        }
        
        return response.data;
        
    } catch (error) {
        if (error.response) {
            console.error('❌ API Error:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    checkSignerStatus();
}

module.exports = { checkSignerStatus };