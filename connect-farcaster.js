#!/usr/bin/env node

require('dotenv').config();

const SIGNER_UUID = process.env.FARCASTER_NEYNAR_SIGNER_UUID;
const API_KEY = process.env.FARCASTER_NEYNAR_API_KEY;
const FID = process.env.FARCASTER_FID || 1331903;

console.log('=====================================');
console.log('🔗 FARCASTER SIGNER CONNECTION GUIDE');
console.log('=====================================\n');

console.log('Your signer needs to be connected to your Farcaster account.');
console.log('Here are the details:\n');

console.log('📋 Configuration:');
console.log(`   FID: ${FID}`);
console.log(`   Signer UUID: ${SIGNER_UUID}`);
console.log(`   API Key: ${API_KEY?.substring(0, 8)}...`);

console.log('\n🔐 To connect your signer:\n');

console.log('Option 1: Use Warpcast (Recommended)');
console.log('----------------------------------------');
console.log('1. Open Warpcast on your phone');
console.log('2. Go to Settings → Advanced → Manage Signers');
console.log('3. Tap "Add a signer manually"');
console.log('4. Enter this public key:');
console.log('   0xe841ee45c82bfc51306e96dcb59da1a9980a09841d1760b132d04db702ceaba5\n');

console.log('Option 2: Use Neynar Dashboard');
console.log('----------------------------------------');
console.log('1. Visit: https://dev.neynar.com/app');
console.log('2. Go to the Signers section');
console.log('3. Find your signer UUID:', SIGNER_UUID);
console.log('4. Click "Connect" and follow the prompts\n');

console.log('Option 3: Use the Approval URL');
console.log('----------------------------------------');
console.log('Try opening this URL in your browser:');
console.log(`https://client.warpcast.com/deeplinks/signed-key-request?token=${SIGNER_UUID}\n`);

console.log('📱 After connecting, run this to verify:');
console.log('   node check-farcaster-signer.js\n');

console.log('⚠️  IMPORTANT: Make sure you\'re logged into Farcaster with FID', FID);
console.log('   (The FID in register-farcaster-signer.js must match your account)\n');

console.log('=====================================');