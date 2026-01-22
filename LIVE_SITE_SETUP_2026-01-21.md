# Live Site Setup - ai10bro.com - 2026-01-21

## Current Status

**Site URL**: https://ai10bro.com
**WordPress REST API**: ✅ Accessible
**Authentication**: ⚠️ Needs configuration (504 timeout on authenticated endpoints)

## Issue Found

Application Password authentication is timing out (504 Gateway Timeout) on the live site. This needs to be configured on ai10bro.com before automated publishing can work.

## Required Setup on Live Site

### 1. Create Application Password for Automation

**Method 1: Via WP-CLI (if SSH access)**
```bash
cd /path/to/ai10bro/public_html
wp user application-password create admin "Eliza Publishing" --porcelain
```

**Method 2: Via WordPress Admin**
1. Log into https://ai10bro.com/wp-admin/
2. Go to Users → Profile
3. Scroll to "Application Passwords"
4. Create new password with name: "Eliza Publishing"
5. Copy the generated password

**Method 3: Install Basic Auth Plugin (Development Only)**
If Application Passwords aren't available, use the Basic Auth REST API plugin:
- Upload `/Users/davidlockie/Studio/ai10bro/wp-content/plugins/basic-auth-rest/` to live site
- Activate via WordPress admin or WP-CLI: `wp plugin activate basic-auth-rest`

### 2. Update Local Configuration

Once Application Password is created on live site, update `.env.wordpress`:
```bash
WP_APP_PASSWORD=[new_password_from_live_site]
```

Current password (`E5fxvB2Yw6MNPrToflNFTlYg`) was created on localhost and won't work on live site.

### 3. Test Authentication

```bash
# Test connection
curl -u 'admin:[APP_PASSWORD]' 'https://ai10bro.com/wp-json/wp/v2/users/me'

# Should return user info:
# {"id":1,"name":"admin",...}
```

### 4. PHP Configuration (if needed)

Ensure live site has adequate upload limits for images (2.8MB average):
- `upload_max_filesize`: 10M or higher
- `post_max_size`: 10M or higher
- `memory_limit`: 256M or higher

Check current limits:
```bash
php -i | grep -E "upload_max_filesize|post_max_size|memory_limit"
```

## Local Configuration Already Updated

### .env.wordpress
```bash
WP_BASE_URL=https://ai10bro.com  # ✅ Updated
WP_USERNAME=admin
WP_APP_PASSWORD=E5fxvB2Yw6MNPrToflNFTlYg  # ⚠️ Needs new password from live site
```

### Cron Jobs
Need to remove `WP_BASE_URL=` override since it's now in .env.wordpress:

```bash
# Current (has localhost override):
20 */4 * * * cd /Users/davidlockie/Documents/Projects/Eliza && WP_BASE_URL=http://localhost:8885 CLIENT=wordpress_insight node send-pending-to-wordpress.js

# Should be (uses .env.wordpress):
20 */4 * * * cd /Users/davidlockie/Documents/Projects/Eliza && CLIENT=wordpress_insight node send-pending-to-wordpress.js
```

## Testing Process

Once Application Password is created:

1. **Update `.env.wordpress`** with new password
2. **Test connection**:
   ```bash
   curl -u 'admin:[NEW_PASSWORD]' 'https://ai10bro.com/wp-json/wp/v2/users/me'
   ```
3. **Test image upload**:
   ```bash
   curl -u 'admin:[NEW_PASSWORD]' \
     -F "file=@broadcast-images/test.png" \
     https://ai10bro.com/wp-json/wp/v2/media
   ```
4. **Manual publish test**:
   ```bash
   CLIENT=wordpress_insight node send-pending-to-wordpress.js
   ```
5. **Update cron jobs** to remove localhost override
6. **Monitor first automated run**

## Current Publishing Pipeline

**Ready to flow** once authentication is configured:
- **Daily Insights**: 673 pending (22.9% avg alignment)
- **Deep Dives**: 139 pending (41.2% avg alignment)

**Expected volume** when live:
- Insights: 54 articles/day (every 4 hours)
- Deep Dives: 2 analyses/day (daily at 10am)

## Post Types on Live Site

Ensure these custom post types exist:
- `/insight` - Daily Insights (800-1200 words)
- `/analysis` - Deep Dives (2000-4000 words)

If not present, copy post type registration from localhost setup.

## Next Steps

1. ⚠️ Create Application Password on ai10bro.com
2. ⏭️ Update `.env.wordpress` with new password
3. ⏭️ Test authentication and publishing
4. ⏭️ Update cron jobs to remove localhost override
5. ⏭️ Monitor first automated publish to live site

---

**Blocker**: Application Password creation on live site
**ETA**: Ready to publish once password is configured (~5 minutes)
