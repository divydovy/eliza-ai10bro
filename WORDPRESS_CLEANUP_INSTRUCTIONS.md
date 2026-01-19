# WordPress Site Cleanup Instructions

## Database Cleanup: ✅ COMPLETE

**What We Did:**
- Deleted 14 malformed broadcasts from database
- Reset 4 good broadcasts to 'pending' for proper republishing
- Database now has **725 pending WordPress Insights** ready to publish

## WordPress Site Cleanup: ⚠️ ACTION REQUIRED

### Posts to Delete from WordPress Site

You need to manually delete approximately **14 malformed posts** from your WordPress site. These posts will have:

**Symptoms:**
- Visible JSON in the title or content (e.g., title shows as `{`)
- Title shows as "Here is the article in the specified JSON format:"
- Content displays raw JSON instead of formatted article
- May have `\`\`\`json` markdown code fences visible

**How to Identify:**
1. Go to your WordPress admin: `http://localhost:8885/wp-admin/edit.php`
2. Look for posts with:
   - Title = `{` or similar malformed JSON
   - Recent publication dates (last few days)
   - Content preview showing JSON/code instead of article text

### Good Posts to Keep (4 posts)

These posts have proper formatting and can stay published:
1. **"Bio-Concrete Achieves Breakthrough 52.5 MPa Strength While Sequestering CO2"**
2. **"Bioengineering Breakthrough: Sustainable Alternative to Single-Use Plastics"**
3. **"Data-Driven Synthetic Microbes Enable Sustainable Biomanufacturing"**
4. **"Data-Driven Omics Integration Reveals Multilayer Biological Insights"**

**Note:** These 4 will be republished automatically on next send run (with proper wordpress_post_id tracking this time). You can either:
- Keep them as-is (they're good content)
- Delete them if you want fresh republish with proper tracking

## Next Automated Steps

After you delete the malformed posts from WordPress:

1. **Automatic Republishing** (no action needed)
   - The 4 good broadcasts are now back in 'pending' status
   - Next WordPress send run (every 4 hours at :20) will publish them properly
   - This time with proper `wordpress_post_id` tracking

2. **New Content Flow** (no action needed)
   - 725 pending broadcasts ready to go
   - 721 new + 4 re-queued = continuous quality content
   - Generator fix prevents future JSON malformation

## WordPress Admin Commands

```bash
# Access WordPress admin
open http://localhost:8885/wp-admin/

# Or if running remotely
# Navigate to: http://your-domain/wp-admin/
```

### Quick Delete Process

1. Login to WordPress admin
2. Go to Posts → All Posts
3. Sort by date (newest first)
4. Look for posts with malformed titles
5. Bulk select malformed posts
6. Choose "Move to Trash" from bulk actions
7. Apply

**Estimated Time:** 5 minutes

## Verification

After cleanup, your WordPress site should have:
- ✅ Only properly formatted articles
- ✅ No visible JSON or code fences
- ✅ All titles readable and descriptive
- ✅ Content displays as formatted HTML

## Future Prevention

✅ **Already Fixed:**
- Generator now strips markdown wrappers before parsing
- Future broadcasts will have clean JSON
- No more `{` titles or "Here is..." preambles

---

**Status:** Database cleanup complete, manual WordPress site cleanup required
**Expected Result:** Clean site + 725 broadcasts ready to publish
