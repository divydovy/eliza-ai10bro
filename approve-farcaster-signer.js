#!/usr/bin/env node

require('dotenv').config();

const SIGNER_UUID = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
const FID = process.env.FARCASTER_FID || 1331903;
const PUBLIC_KEY = '0xdb881d11d4771fa30c687ca0f1befb9db8d00b1261bdff132c72fcd7989971bd';

console.log('🔐 Farcaster Signer Approval Methods');
console.log('=====================================\n');

console.log('Your new signer is created but needs to be connected to your Farcaster account.\n');

console.log('📋 Signer Details:');
console.log(`   UUID: ${SIGNER_UUID}`);
console.log(`   Public Key: ${PUBLIC_KEY}`);
console.log(`   Target FID: ${FID}\n`);

console.log('Choose one of these methods to approve:\n');

console.log('METHOD 1: Neynar Dashboard (Recommended)');
console.log('-----------------------------------------');
console.log('1. Visit: https://dev.neynar.com/app');
console.log('2. Sign in with your Neynar account');
console.log('3. Go to the "Signers" section');
console.log('4. You should see your signer UUID listed');
console.log('5. Click on it and follow the connection flow\n');

console.log('METHOD 2: Manual Warpcast Import');
console.log('-----------------------------------------');
console.log('1. Open Warpcast mobile app');
console.log('2. Go to Settings → Advanced → Manage signers');
console.log('3. Tap "Developers: manage signers"');
console.log('4. Your app should already be connected, find the pending signer');
console.log('5. Approve it\n');

console.log('METHOD 3: Direct API Approach');
console.log('-----------------------------------------');
console.log('Since the signer was created via Neynar, you need to:');
console.log('1. Log into https://warpcast.com');
console.log('2. Make sure you\'re using the account with FID:', FID);
console.log('3. Visit the Neynar dashboard to complete the flow\n');

console.log('📱 QR Code for Mobile');
console.log('-----------------------------------------');
console.log('Generate a QR code for this URL:');
console.log(`https://dev.neynar.com/signers/${SIGNER_UUID}\n`);

console.log('After approval, verify with:');
console.log('   node check-farcaster-signer.js\n');

console.log('Then start the agent:');
console.log('   pnpm start\n');

console.log('=====================================');