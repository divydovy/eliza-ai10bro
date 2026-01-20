# WordPress Image Upload Fix - 2026-01-20

## Problem
WordPress posts were publishing successfully but **featured images were failing** with 500 errors.

**Error**: `"The uploaded file exceeds the upload_max_filesize directive in php.ini"`

## Root Cause
- Broadcast images: ~2.8MB
- PHP upload limit: 2MB (default)
- Images exceeded maximum upload size

## Solution

### 1. Increased PHP Upload Limits ✅
Restarted WordPress server with increased limits:

```bash
cd /Users/davidlockie/Studio/ai10bro
php -S localhost:8885 \
  -d upload_max_filesize=10M \
  -d post_max_size=10M \
  -d memory_limit=256M \
  -t .
```

**New Limits**:
- upload_max_filesize: 2M → 10M
- post_max_size: 8M → 10M
- memory_limit: 128M → 256M

### 2. Created WordPress Application Password ✅
The Basic Auth plugin had issues after server restart. Switched to native WordPress Application Passwords:

```bash
cd /Users/davidlockie/Studio/ai10bro
wp user application-password create admin "Eliza Publishing" --porcelain
# Output: E5fxvB2Yw6MNPrToflNFTlYg
```

### 3. Updated .env.wordpress ✅
```bash
WP_APP_PASSWORD=E5fxvB2Yw6MNPrToflNFTlYg
```

## Test Results

### Image Upload Test
```bash
curl -u 'admin:E5fxvB2Yw6MNPrToflNFTlYg' \
  -F "file=@broadcast-images/001128f5-5fd1-4c54-ba25-2be8d8186598.png" \
  http://localhost:8885/wp-json/wp/v2/media

# ✅ Success - Media ID: 99
```

### Published Posts with Images
Latest 3 posts all have featured images:
- ✅ "Injectable Nanocomposite Biomaterial" (Media ID: 104)
- ✅ "3D Bioprinted Implants with Zinc-Doped Glass" (Media ID: 102)
- ✅ "Genetic Editing Yields Wood as Strong as Steel" (Media ID: 100)

**Image URL Example**:
`http://localhost:8885/wp-content/uploads/2026/01/71e9cd2c-a9f4-654f-18b7-04fb64e27065-scaled.jpg`

## WordPress Server Startup

### Current Running Process
```bash
ps aux | grep "php.*8885"
# php -S localhost:8885 -d upload_max_filesize=10M -d post_max_size=10M -d memory_limit=256M -t .
```

### To Restart (if needed)
```bash
# 1. Find and kill current process
ps aux | grep "php.*8885" | grep -v grep | awk '{print $2}' | xargs kill

# 2. Start with increased limits
cd /Users/davidlockie/Studio/ai10bro
nohup php -S localhost:8885 \
  -d upload_max_filesize=10M \
  -d post_max_size=10M \
  -d memory_limit=256M \
  -t . > /tmp/wordpress-server.log 2>&1 &

# 3. Verify running
ps aux | grep "php.*8885" | grep -v grep
```

### Server Logs
```bash
tail -f /tmp/wordpress-server.log
```

## Current Status

### WordPress Publishing: 🟢 FULLY OPERATIONAL
- **Authentication**: ✅ Working (Application Password)
- **Image Uploads**: ✅ Working (10MB limit)
- **Post Creation**: ✅ Working
- **Publishing Rate**: 54 articles/day
- **Pending Broadcasts**: 726 (with images ready)

### Recent Publishes
All new posts include featured images automatically uploaded from `broadcast-images/` directory.

## Application Password Management

### List Application Passwords
```bash
cd /Users/davidlockie/Studio/ai10bro
wp user application-password list admin
```

### Create New Password
```bash
wp user application-password create admin "New Application Name" --porcelain
```

### Revoke Password
```bash
wp user application-password delete admin <UUID>
```

## Verification Commands

```bash
# Test authentication
curl -u 'admin:E5fxvB2Yw6MNPrToflNFTlYg' \
  http://localhost:8885/wp-json/wp/v2/users/me

# Test image upload
curl -u 'admin:E5fxvB2Yw6MNPrToflNFTlYg' \
  -F "file=@broadcast-images/test.png" \
  http://localhost:8885/wp-json/wp/v2/media

# Check recent posts with images
curl 'http://localhost:8885/wp-json/wp/v2/insight?per_page=5' | \
  jq -r '.[] | "\(.id) | Image: \(if .featured_media > 0 then "✅" else "❌" end) | \(.title.rendered)"'

# Manual WordPress publish test
WP_BASE_URL=http://localhost:8885 \
CLIENT=wordpress_insight \
node send-pending-to-wordpress.js
```

## Files Modified

1. `.env.wordpress` - Updated WP_APP_PASSWORD
2. WordPress server - Restarted with increased upload limits
3. WordPress Application Passwords - Created new password

## Before vs After

### Before
- Image uploads: ❌ FAILING (500 errors)
- Upload limit: 2MB
- Authentication: Basic Auth plugin (unreliable)
- Posts: Text only (no images)

### After
- Image uploads: ✅ WORKING
- Upload limit: 10MB
- Authentication: Native Application Password
- Posts: Text + featured images

---

**Status**: ✅ COMPLETE
**Impact**: High - WordPress posts now include professional featured images
**Next**: Images flow automatically on every WordPress publish

🎉 WordPress image uploads fully operational!
