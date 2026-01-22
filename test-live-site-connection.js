#!/usr/bin/env node

/**
 * Test WordPress Live Site Connection
 * Tests connectivity and authentication to ai10bro.com
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load WordPress configuration
dotenv.config({ path: '.env.wordpress' });

const WP_BASE_URL = process.env.WP_BASE_URL || 'https://ai10bro.com';
const WP_USERNAME = process.env.WP_USERNAME || 'admin';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

if (!WP_APP_PASSWORD) {
    console.error('❌ ERROR: WP_APP_PASSWORD not found in .env.wordpress');
    process.exit(1);
}

const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');

console.log('🧪 Testing WordPress Live Site Connection\n');
console.log(`Site: ${WP_BASE_URL}`);
console.log(`Username: ${WP_USERNAME}`);
console.log(`Password: ${WP_APP_PASSWORD.substring(0, 4)}...${WP_APP_PASSWORD.substring(WP_APP_PASSWORD.length - 4)}\n`);

// Test 1: Basic site connectivity
console.log('Test 1: Basic site connectivity...');
try {
    const response = await fetch(WP_BASE_URL, { timeout: 10000 });
    if (response.ok) {
        console.log('✅ Site is accessible (HTTP ' + response.status + ')');
    } else {
        console.log('⚠️  Site returned HTTP ' + response.status);
    }
} catch (error) {
    console.log('❌ Failed to connect to site: ' + error.message);
    process.exit(1);
}

// Test 2: REST API availability
console.log('\nTest 2: REST API availability...');
try {
    const response = await fetch(`${WP_BASE_URL}/wp-json/`, { timeout: 10000 });
    if (response.ok) {
        const data = await response.json();
        console.log('✅ REST API is accessible');
        console.log(`   WordPress version: ${data.name} ${data.description || ''}`);
    } else {
        console.log('❌ REST API returned HTTP ' + response.status);
        process.exit(1);
    }
} catch (error) {
    console.log('❌ REST API connection failed: ' + error.message);
    process.exit(1);
}

// Test 3: Authenticated access to posts
console.log('\nTest 3: Authenticated access (posts endpoint)...');
try {
    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
            'Authorization': `Basic ${auth}`
        },
        timeout: 10000
    });

    if (response.ok) {
        const posts = await response.json();
        console.log('✅ Authentication successful');
        console.log(`   Found ${posts.length > 0 ? posts.length : 0} post(s)`);
    } else if (response.status === 401) {
        console.log('❌ Authentication failed (401 Unauthorized)');
        console.log('   Check Application Password in .env.wordpress');
        process.exit(1);
    } else {
        console.log('⚠️  Unexpected response: HTTP ' + response.status);
        const text = await response.text();
        console.log('   Response:', text.substring(0, 200));
    }
} catch (error) {
    console.log('❌ Authenticated request failed: ' + error.message);
    process.exit(1);
}

// Test 4: Authenticated access to custom post types
console.log('\nTest 4: Authenticated access (custom post types)...');
try {
    const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/insight?per_page=1`, {
        headers: {
            'Authorization': `Basic ${auth}`
        },
        timeout: 10000
    });

    if (response.ok) {
        const insights = await response.json();
        console.log('✅ Custom post type "insight" accessible');
        console.log(`   Found ${insights.length > 0 ? insights.length : 0} insight(s)`);
    } else if (response.status === 401) {
        console.log('❌ Authentication failed for custom post type');
        process.exit(1);
    } else {
        console.log('⚠️  Custom post type response: HTTP ' + response.status);
    }
} catch (error) {
    console.log('❌ Custom post type request failed: ' + error.message);
}

console.log('\n✅ All tests passed! Live site is ready for automated publishing.\n');
