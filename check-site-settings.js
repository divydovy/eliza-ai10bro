#!/usr/bin/env node

const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.wordpress' });

const TOKEN = process.env.WPCOM_ACCESS_TOKEN;
const SITE_ID = process.env.WPCOM_SITE_ID;

async function checkSettings() {
    console.log('🔍 Checking WordPress.com Site Settings\n');

    try {
        // Get detailed site info
        const response = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${SITE_ID}`, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            console.log('❌ Failed to get site info:', error);
            return;
        }

        const site = await response.json();

        console.log('Site Information:');
        console.log('  Name:', site.name);
        console.log('  URL:', site.URL);
        console.log('  Plan:', site.plan?.product_name_short || 'Unknown');
        console.log('  Jetpack:', site.jetpack ? 'Yes' : 'No');
        console.log('  Visible:', site.is_visible ? 'Public' : 'Private');
        console.log('  VIP:', site.is_vip ? 'Yes' : 'No');
        console.log('\nCapabilities:');
        console.log('  Edit Posts:', site.capabilities?.edit_posts ? 'Yes' : 'No');
        console.log('  Publish Posts:', site.capabilities?.publish_posts ? 'Yes' : 'No');
        console.log('  Upload Files:', site.capabilities?.upload_files ? 'Yes' : 'No');
        console.log('\nOptions:');
        if (site.options) {
            console.log('  API Enabled:', site.options.api_enabled !== false ? 'Yes' : 'No');
            console.log('  Videopress:', site.options.videopress_enabled ? 'Yes' : 'No');
            console.log('  Admin URL:', site.options.admin_url);
        }

        // Check if there are any restrictions
        console.log('\n📋 Full site object keys:', Object.keys(site).join(', '));

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkSettings();
