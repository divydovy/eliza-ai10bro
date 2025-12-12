#!/usr/bin/env node

// Simple test to verify WordPress publishing works

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.wordpress' });

const WP_BASE_URL = process.env.WP_BASE_URL || 'http://localhost:8885';
const WP_USERNAME = process.env.WP_USERNAME || 'admin';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function testPublish() {
  console.log('🚀 Testing WordPress Publishing\n');
  
  if (!WP_APP_PASSWORD) {
    console.error('❌ WP_APP_PASSWORD not configured');
    return;
  }

  // Test auth
  console.log('🔐 Testing authentication...');
  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString('base64');
  
  const authTest = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/users/me`, {
    headers: { 'Authorization': `Basic ${auth}` }
  });
  
  if (!authTest.ok) {
    console.error('❌ Authentication failed');
    return;
  }
  
  const user = await authTest.json();
  console.log(`✅ Authenticated as: ${user.name}\n`);

  // Get a quality broadcast
  console.log('📚 Finding quality broadcast...');
  const db = new Database('./agent/data/db.sqlite');
  
  const broadcast = db.prepare(`
    SELECT
      b.id,
      b.content,
      b.alignment_score,
      b.image_url,
      m.content as document_content
    FROM broadcasts b
    LEFT JOIN memories m ON b.documentId = m.id
    WHERE b.alignment_score >= 0.20
      AND b.status = 'pending'
    LIMIT 1
  `).get();

  if (!broadcast) {
    console.log('❌ No broadcasts found with alignment >= 0.20');
    db.close();
    return;
  }

  console.log(`✅ Found broadcast ${broadcast.id.slice(0, 8)}...`);
  console.log(`   Alignment: ${broadcast.alignment_score.toFixed(3)}\n`);

  // Create simple test post
  console.log('📝 Creating test post (draft)...');
  
  const postData = {
    title: 'Test Post from Eliza Agent',
    content: `<p>${broadcast.content}</p><p><em>This is a test post created by the Eliza WordPress publisher.</em></p>`,
    excerpt: broadcast.content.slice(0, 160),
    status: 'draft',
    bio_theme: [9], // innovation
    meta: {
      alignment_score: broadcast.alignment_score.toFixed(3),
      source_url: 'https://example.com/test'
    }
  };

  const response = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/insight`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(postData)
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`❌ Post creation failed: ${response.status}`);
    console.error(error);
    db.close();
    return;
  }

  const post = await response.json();
  console.log(`✅ Post created successfully!`);
  console.log(`   Post ID: ${post.id}`);
  console.log(`   URL: ${post.link}`);
  console.log(`   Status: ${post.status}\n`);

  console.log('✨ Test complete! WordPress integration is working.');
  console.log(`   Review the draft at: ${WP_BASE_URL}/wp-admin/post.php?post=${post.id}&action=edit`);
  
  db.close();
}

testPublish().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
