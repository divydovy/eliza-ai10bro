#!/usr/bin/env node

require('dotenv').config();

console.log('🤖 Neynar Agents Setup Guide');
console.log('=============================\n');

console.log('Based on your Neynar dashboard, you have an "Agents" tab.\n');
console.log('This is likely where you can manage signers for your bot/agent.\n');

console.log('📋 Your Configuration:');
console.log('   App Name: ai10bro-eliza');
console.log('   Client ID: b42a86f4-5573-4bbe-90e7-a71bb6657e9c');
console.log('   API Key: ' + (process.env.FARCASTER_NEYNAR_API_KEY?.substring(0, 8) || 'Not found') + '...');
console.log('   Signer UUID: ' + process.env.FARCASTER_NEYNAR_SIGNER_UUID);
console.log('   Target FID: ' + (process.env.FARCASTER_FID || '1331903') + '\n');

console.log('👉 NEXT STEPS:');
console.log('===============\n');

console.log('1. Click on the "Agents" tab in your Neynar dashboard\n');

console.log('2. You should see options to:');
console.log('   - Create a new agent/bot');
console.log('   - Connect an existing Farcaster account');
console.log('   - Manage signers for your agent\n');

console.log('3. If you need to create a new agent:');
console.log('   - Click "Create Agent" or similar button');
console.log('   - Enter your FID: 1331903');
console.log('   - Or connect your Farcaster account\n');

console.log('4. If you see existing signers:');
console.log('   - Look for signer UUID: 33c2817e-c17e-4262-987a-588a8a42e544');
console.log('   - Check if it needs approval or connection\n');

console.log('5. The Agents section might allow you to:');
console.log('   - Generate a new managed signer (sponsored by Neynar)');
console.log('   - Connect to an existing Farcaster account');
console.log('   - Get an approval URL or QR code\n');

console.log('ALTERNATIVE: SIWN Tab');
console.log('=====================');
console.log('If the Agents tab doesn\'t work, try the "SIWN" tab:');
console.log('   - This is "Sign In With Neynar"');
console.log('   - It allows users to authenticate with Farcaster');
console.log('   - You might be able to test it yourself to connect your account\n');

console.log('📱 After connecting in Neynar:');
console.log('================================');
console.log('1. The dashboard should show your connected FID');
console.log('2. You might get a new signer UUID - update .env if needed');
console.log('3. Run: node check-farcaster-signer.js');
console.log('4. Once approved, run: pnpm start\n');

console.log('Need more help? Share what you see in the Agents tab!');