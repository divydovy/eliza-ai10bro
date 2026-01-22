#!/usr/bin/env node

/**
 * WordPress.com OAuth Authentication
 * One-time setup to get OAuth access token
 */

import http from 'http';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OAuth Configuration
const CLIENT_ID = process.env.WPCOM_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.WPCOM_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/oauth/callback';

console.log('🔐 WordPress.com OAuth Authentication\n');

if (CLIENT_ID === 'YOUR_CLIENT_ID' || CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
    console.error('❌ ERROR: OAuth credentials not configured\n');
    console.log('Please set environment variables or edit .env.wordpress:');
    console.log('  WPCOM_CLIENT_ID=your_client_id');
    console.log('  WPCOM_CLIENT_SECRET=your_client_secret\n');
    console.log('Get credentials from: https://developer.wordpress.com/apps/\n');
    process.exit(1);
}

// Step 1: Start local server to receive callback
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/oauth/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>❌ Authorization Failed</h1><p>${error}</p>`);
            console.error('❌ Authorization failed:', error);
            server.close();
            process.exit(1);
        }

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>❌ No authorization code received</h1>');
            console.error('❌ No authorization code received');
            server.close();
            process.exit(1);
        }

        console.log('✅ Authorization code received');
        console.log('🔄 Exchanging code for access token...\n');

        // Step 3: Exchange code for access token
        try {
            const tokenResponse = await fetch('https://public-api.wordpress.com/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code'
                })
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                throw new Error(`Token exchange failed: ${errorText}`);
            }

            const tokenData = await tokenResponse.json();

            console.log('✅ Access token received!\n');
            console.log('Token details:');
            console.log(`  Access Token: ${tokenData.access_token.substring(0, 20)}...`);
            console.log(`  Blog ID: ${tokenData.blog_id}`);
            console.log(`  Blog URL: ${tokenData.blog_url}`);
            console.log(`  Scope: ${tokenData.scope}\n`);

            // Save token to .env.wordpress
            const envPath = path.join(__dirname, '.env.wordpress');
            let envContent = '';

            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
            }

            // Update or add WPCOM_ACCESS_TOKEN
            if (envContent.includes('WPCOM_ACCESS_TOKEN=')) {
                envContent = envContent.replace(
                    /WPCOM_ACCESS_TOKEN=.*/,
                    `WPCOM_ACCESS_TOKEN=${tokenData.access_token}`
                );
            } else {
                envContent += `\n# WordPress.com OAuth Token\nWPCOM_ACCESS_TOKEN=${tokenData.access_token}\n`;
            }

            // Update or add WPCOM_SITE_ID
            if (tokenData.blog_id) {
                if (envContent.includes('WPCOM_SITE_ID=')) {
                    envContent = envContent.replace(
                        /WPCOM_SITE_ID=.*/,
                        `WPCOM_SITE_ID=${tokenData.blog_id}`
                    );
                } else {
                    envContent += `WPCOM_SITE_ID=${tokenData.blog_id}\n`;
                }
            }

            fs.writeFileSync(envPath, envContent);
            console.log('✅ Token saved to .env.wordpress\n');

            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                <head><title>OAuth Success</title></head>
                <body style="font-family: system-ui; max-width: 600px; margin: 100px auto; text-align: center;">
                    <h1 style="color: #00aa00;">✅ Authorization Successful!</h1>
                    <p>Access token has been saved to .env.wordpress</p>
                    <p>You can close this window and return to the terminal.</p>
                </body>
                </html>
            `);

            // Close server after a delay
            setTimeout(() => {
                server.close();
                console.log('🎉 OAuth setup complete! You can now publish to WordPress.com\n');
                process.exit(0);
            }, 2000);

        } catch (error) {
            console.error('❌ Failed to exchange code for token:', error.message);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>❌ Token Exchange Failed</h1><p>${error.message}</p>`);
            server.close();
            process.exit(1);
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3000, () => {
    console.log('🚀 Local server started on http://localhost:3000\n');

    // Step 2: Generate authorization URL and open browser
    const authUrl = `https://public-api.wordpress.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=global`;

    console.log('📋 Authorization URL:');
    console.log(authUrl);
    console.log('\n🌐 Opening browser for authorization...\n');
    console.log('If browser doesn\'t open, copy the URL above and paste in your browser.\n');

    // Open browser (works on macOS, Linux, Windows)
    const openCommand = process.platform === 'darwin' ? 'open'
                      : process.platform === 'win32' ? 'start'
                      : 'xdg-open';

    exec(`${openCommand} "${authUrl}"`, (error) => {
        if (error) {
            console.warn('⚠️  Could not open browser automatically. Please open the URL manually.');
        }
    });
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n⚠️  OAuth setup cancelled');
    server.close();
    process.exit(0);
});
