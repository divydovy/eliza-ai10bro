#!/usr/bin/env node
const { BskyAgent } = require('@atproto/api');
require('dotenv').config();

async function testBluesky() {
    console.log('Testing Bluesky authentication...');
    console.log('Handle:', process.env.BLUESKY_HANDLE);
    console.log('Password:', process.env.BLUESKY_APP_PASSWORD ? 'Set (hidden)' : 'Not set');

    const agent = new BskyAgent({
        service: 'https://bsky.social'
    });

    try {
        // Login
        const handle = process.env.BLUESKY_HANDLE?.includes('.')
            ? process.env.BLUESKY_HANDLE
            : `${process.env.BLUESKY_HANDLE}.bsky.social`;

        console.log(`\nAttempting login with handle: ${handle}`);

        await agent.login({
            identifier: handle,
            password: process.env.BLUESKY_APP_PASSWORD
        });

        console.log('✅ Login successful!');
        console.log('Session DID:', agent.session?.did);
        console.log('Session handle:', agent.session?.handle);

        // Try to post
        console.log('\nAttempting to send test post...');
        const post = await agent.post({
            text: '🤖 Test post from ElizaOS - debugging Bluesky integration',
            createdAt: new Date().toISOString()
        });

        console.log('✅ Post successful!');
        console.log('Post URI:', post.uri);
        console.log('Post CID:', post.cid);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Full error:', error);
    }
}

testBluesky();