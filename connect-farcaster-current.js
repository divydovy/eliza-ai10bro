#!/usr/bin/env node

require('dotenv').config();

const SIGNER_UUID = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
const PUBLIC_KEY = '0xdb881d11d4771fa30c687ca0f1befb9db8d00b1261bdff132c72fcd7989971bd';
const FID = process.env.FARCASTER_FID || 1331903;

console.log('🔐 Farcaster Signer Connection Guide (2025)');
console.log('============================================\n');

console.log('Since Warpcast is discontinued, here are the current options:\n');

console.log('📋 Your Signer Details:');
console.log(`   UUID: ${SIGNER_UUID}`);
console.log(`   Public Key: ${PUBLIC_KEY}`);
console.log(`   Target FID: ${FID}\n`);

console.log('OPTION 1: Neynar Developer Portal (Recommended)');
console.log('------------------------------------------------');
console.log('1. Go to: https://dev.neynar.com');
console.log('2. Sign in with your Neynar account');
console.log('3. Navigate to your app (Client ID: b42a86f4-5573-4bbe-90e7-a71bb6657e9c)');
console.log('4. Look for "Signers" or "Managed Signers" section');
console.log('5. Find your signer UUID and complete the connection flow\n');

console.log('OPTION 2: Use a Farcaster Client App');
console.log('------------------------------------------------');
console.log('Since Warpcast is gone, try alternative Farcaster clients:');
console.log('- Supercast (https://supercast.xyz)');
console.log('- Paragraph (https://paragraph.xyz)');
console.log('- Other Farcaster clients that support signer management\n');
console.log('Look for "Developer Settings" or "Signer Management" in these apps.\n');

console.log('OPTION 3: Direct Onchain Registration');
console.log('------------------------------------------------');
console.log('If you have access to the custody address for FID', FID + ':');
console.log('1. You can directly register the signer onchain');
console.log('2. This requires interacting with the Farcaster Key Registry contract');
console.log('3. The public key to register:', PUBLIC_KEY, '\n');

console.log('OPTION 4: Create New Signer with SIWN');
console.log('------------------------------------------------');
console.log('If the above options don\'t work, we may need to:');
console.log('1. Set up Sign In With Neynar (SIWN) for your app');
console.log('2. This requires configuring your app in Neynar Developer Portal');
console.log('3. Users can then authenticate and approve signers through Neynar\n');

console.log('📱 Testing Your Connection:');
console.log('------------------------------------------------');
console.log('After connecting through any method above:');
console.log('1. Run: node check-farcaster-signer.js');
console.log('2. Look for "Status: approved" and your FID');
console.log('3. Then start the agent: pnpm start\n');

console.log('⚠️  Note: The Farcaster ecosystem is evolving rapidly.');
console.log('If none of these work, check the latest docs at:');
console.log('- https://docs.farcaster.xyz');
console.log('- https://docs.neynar.com\n');

console.log('============================================');