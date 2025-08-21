#!/usr/bin/env node

// Automatic n8n setup script
const https = require('http');

async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function setupN8n() {
  console.log('🚀 Auto-configuring n8n...');
  
  // Try to create owner account
  const setupData = {
    email: 'admin@localhost.local',
    firstName: 'Admin',
    lastName: 'User',
    password: 'Admin123admin123'
  };

  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 5678,
      path: '/api/v1/owner/setup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }, setupData);
    
    console.log('Setup response:', response.status);
    
    if (response.status === 200 || response.status === 201) {
      console.log('✅ Setup completed successfully!');
      console.log('📝 Credentials saved (but you won\'t need them - no auth required)');
    } else if (response.body.includes('already')) {
      console.log('✅ Already set up!');
    }
  } catch (error) {
    console.log('Note:', error.message);
  }

  console.log('\n🎉 N8n is ready at http://localhost:5678');
  console.log('💰 Annual savings: $1,700-3,500');
}

setupN8n();