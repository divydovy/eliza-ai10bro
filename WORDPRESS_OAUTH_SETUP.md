# WordPress.com OAuth API Setup

## Problem
WordPress.com managed hosting blocks external authenticated REST API requests (Application Passwords don't work for POST/PUT operations from external IPs).

## Solution
Use WordPress.com OAuth2 API which is designed for external applications.

## Setup Steps

### 1. Register OAuth Application

1. Go to: https://developer.wordpress.com/apps/
2. Click "Create New Application"
3. Fill in the form:
   - **Name**: AI10BRO Publishing System
   - **Description**: Automated content publishing for AI10BRO biotech insights
   - **Website URL**: https://ai10bro.com
   - **Redirect URLs**: http://localhost:3000/oauth/callback
   - **JavaScript Origins**: (leave blank)
   - **Type**: Web Application

4. After creating, you'll receive:
   - **Client ID**: (save this)
   - **Client Secret**: (save this)

### 2. WordPress.com OAuth Flow

**Authentication Flow:**
```
1. User authorizes → https://public-api.wordpress.com/oauth2/authorize
2. WordPress redirects back with code → http://localhost:3000/oauth/callback?code=xxx
3. Exchange code for access token → https://public-api.wordpress.com/oauth2/token
4. Use access token for API requests
```

**Token Management:**
- Access tokens expire after 2 weeks
- Refresh tokens for long-lived access
- Store tokens securely in .env.wordpress

### 3. WordPress.com API Endpoints

**Key Differences from REST API:**
```bash
# REST API (doesn't work from external IPs)
POST https://ai10bro.com/wp-json/wp/v2/posts

# WordPress.com API (works from anywhere)
POST https://public-api.wordpress.com/rest/v1.1/sites/ai10bro.com/posts/new
```

**Common Endpoints:**
- Get site info: `GET /sites/{site}/`
- Create post: `POST /sites/{site}/posts/new`
- Upload media: `POST /sites/{site}/media/new`
- Update post: `POST /sites/{site}/posts/{post_id}`
- List posts: `GET /sites/{site}/posts/`

### 4. Environment Variables

Add to `.env.wordpress`:
```bash
# WordPress.com OAuth
WPCOM_CLIENT_ID=your_client_id_here
WPCOM_CLIENT_SECRET=your_client_secret_here
WPCOM_ACCESS_TOKEN=your_access_token_here
WPCOM_SITE_ID=ai10bro.com
```

### 5. OAuth Authentication Script

Run once to get access token:
```bash
node wordpress-oauth-auth.js
```

This will:
1. Open browser for authorization
2. Receive callback with code
3. Exchange code for access token
4. Save token to .env.wordpress

### 6. Publishing Script Updates

Modified `send-pending-to-wordpress.js` to:
- Use WordPress.com API endpoints instead of REST API
- Include OAuth access token in Authorization header
- Handle WordPress.com-specific response formats

## API Reference

**WordPress.com API Documentation:**
- Main docs: https://developer.wordpress.com/docs/api/
- Authentication: https://developer.wordpress.com/docs/oauth2/
- Posts endpoint: https://developer.wordpress.com/docs/api/1.1/post/sites/%24site/posts/new/
- Media endpoint: https://developer.wordpress.com/docs/api/1.1/post/sites/%24site/media/new/

**Example Request:**
```bash
curl -X POST \
  'https://public-api.wordpress.com/rest/v1.1/sites/ai10bro.com/posts/new' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Test Post",
    "content": "<p>Test content</p>",
    "status": "publish"
  }'
```

## Next Steps

1. Register OAuth app (provide Client ID and Secret)
2. Run OAuth authentication flow
3. Test publishing with WordPress.com API
4. Update cron jobs to use new publishing script
