#!/usr/bin/env node

const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.wordpress' });

const TOKEN = process.env.WPCOM_ACCESS_TOKEN;

console.log('Testing WordPress.com API Connection\n');
console.log(`Token: ${TOKEN ? TOKEN.substring(0, 20) + '...' : 'NOT FOUND'}\n`);

async function test() {
    // Test 1: Get user info
    console.log('Test 1: Getting user info...');
    try {
        const response = await fetch('https://public-api.wordpress.com/rest/v1.1/me', {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            console.log('❌ Failed:', error);
            return;
        }

        const user = await response.json();
        console.log('✅ User:', user.username);
        console.log('   Primary blog:', user.primary_blog);
        console.log('   Primary blog URL:', user.primary_blog_url);

        // Test 2: Get sites
        console.log('\nTest 2: Getting sites...');
        const sitesResponse = await fetch('https://public-api.wordpress.com/rest/v1.1/me/sites', {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!sitesResponse.ok) {
            const error = await sitesResponse.json();
            console.log('❌ Failed:', error);
            return;
        }

        const sitesData = await sitesResponse.json();
        console.log(`✅ Found ${sitesData.sites.length} site(s):`);
        sitesData.sites.forEach(site => {
            console.log(`   - ${site.URL} (ID: ${site.ID})`);
        });

        // Test 3: Get specific site info
        const ai10broSite = sitesData.sites.find(s => s.URL.includes('ai10bro'));
        if (ai10broSite) {
            console.log('\n✅ Found ai10bro.com site!');
            console.log(`   Site ID: ${ai10broSite.ID}`);
            console.log(`   URL: ${ai10broSite.URL}`);
            console.log(`   Name: ${ai10broSite.name}`);
        } else {
            console.log('\n⚠️  ai10bro.com site not found in your sites list');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

test();
