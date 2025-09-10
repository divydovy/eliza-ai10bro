# Enable YouTube Data API v3 Free Tier

## Steps to Enable Free YouTube API:

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Select project: divydovy-1732191337181

2. **Enable YouTube Data API v3**
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"

3. **Create API Key (if needed)**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Restrict the key to YouTube Data API v3 only

4. **Set Quotas (Optional)**
   - Go to "APIs & Services" > "Quotas"
   - Set daily limit to 10,000 to stay in free tier

## Free Tier Limits:
- 10,000 units per day
- Search costs 100 units
- Video details cost 1 unit each
- Channel info costs 1 unit

## Optimization Tips:
- Cache results to avoid repeated API calls
- Use batch requests when possible
- Only fetch essential fields to reduce quota usage

## Alternative: Use RSS Feeds (No API Key Needed)
YouTube channels have RSS feeds that are completely free:
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID

This would require modifying the fetcher to use RSS instead of API.
