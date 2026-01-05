# Provider-Source Integration Guide

## ✅ What Was Updated

Your server has been updated to use **provider-source** for real stream scraping. The server now:

1. **Loads provider-source dynamically** - Safely imports the library without breaking if unavailable
2. **Scrapes real streams** - Uses actual providers (videasy, vidlink, vidsrc, etc.)
3. **Extracts qualities & captions** - Gets multiple quality options and subtitles
4. **Falls back gracefully** - If provider-source fails, returns fallback message
5. **Uses your proxy** - Routes all requests through `simple-proxy.eyus00.workers.dev`

## 🚀 Quick Start

### 1. Update Your Server on Vercel

The code is already updated! Just push to GitHub and Vercel will auto-deploy:

```bash
git add server/src/
git commit -m "Integrate provider-source for real stream scraping"
git push
```

Vercel will rebuild automatically in ~2 minutes.

### 2. Test the Endpoint

Once deployed, test it in your browser:

```
https://charcoal-backend.vercel.app/api/sources/get?tmdbId=550&type=movie
```

You should see:
- ✅ `"success": true`
- ✅ Multiple qualities in the `qualities` array
- ✅ Real streaming URLs (not `example.com`)
- ✅ Captions/subtitles in the `captions` array

## 📊 Expected Response Structure

### Success Response (with real streams):
```json
{
  "success": true,
  "data": {
    "title": "550",
    "type": "hls",
    "qualities": [
      {
        "quality": "1080p",
        "url": "https://actual-stream-url.m3u8"
      },
      {
        "quality": "720p",
        "url": "https://actual-stream-url-720p.m3u8"
      }
    ],
    "captions": [
      {
        "language": "English",
        "url": "https://captions-url.vtt",
        "default": true
      }
    ],
    "sourceProvider": "videasy",
    "duration": null
  },
  "fallbacks": ["videasy.net", "vidlink.pro", "vidsrc.pro"]
}
```

### Fallback Response (provider-source unavailable):
```json
{
  "success": false,
  "error": "Real stream scraping unavailable, using embedded players",
  "fallbacks": ["videasy.net", "vidlink.pro", "vidsrc.pro", "superembed"]
}
```

## 🔧 How It Works

```
User clicks "Watch"
    ↓
Frontend calls: GET /api/sources/get?tmdbId=550&type=movie
    ↓
Server tries provider-source:
    1. Load provider library ✅
    2. Create fetcher with proxy URL
    3. Search for media using TMDB ID
    4. Scrape available sources (videasy, vidlink, vidsrc, etc.)
    5. Extract quality options and captions
    6. Return best streams
    ↓
If success → Return real stream URLs ✅
If failed → Return fallback message
    ↓
Frontend receives response:
    - If real streams: Use custom player
    - If fallback: Use embedded players
```

## 🧪 Testing Checklist

### Local Testing (if running server locally)

```bash
cd server
npm run dev
```

Then test:
```bash
# Test 1: Health check
curl http://localhost:3001/health

# Test 2: Get providers list
curl http://localhost:3001/api/sources/providers

# Test 3: Get a real stream (example: Fight Club, tmdbId=550)
curl "http://localhost:3001/api/sources/get?tmdbId=550&type=movie"

# Test 4: Get TV show stream
curl "http://localhost:3001/api/sources/get?tmdbId=1399&type=tv&season=1&episode=1"
```

### Production Testing (on Vercel)

```bash
# Test the live endpoint
# Visit in browser or use curl:
https://charcoal-backend.vercel.app/api/sources/get?tmdbId=550&type=movie
```

### Frontend Testing

1. Go to your frontend: https://your-frontend.vercel.app
2. Find a movie to watch
3. Click "Watch"
4. You should see:
   - **Blue spinner** while loading streams
   - **Custom player** with real video (if provider-source works)
   - **OR fallback to embedded player** (if provider-source unavailable)

## 📝 What to Expect

### When Provider-Source Works ✅
- Streams load in 2-5 seconds
- Custom player shows with real video
- Quality selector has real options (1080p, 720p, etc.)
- Captions dropdown shows subtitles
- Clean, ad-free viewing experience

### When Provider-Source Fails (Falls Back) ⚠️
- Blue spinner appears, then disappears
- Falls back to embedded player (old approach)
- You see the old iframe player with ads
- Still works! Just different experience

## 🐛 Troubleshooting

### Test Endpoint Returns 500 Error
```
{
  "success": false,
  "error": "Error message here"
}
```

**Solution:**
- Check server logs in Vercel dashboard
- Provider-source might not be imported correctly
- Check if provider-source directory exists in root

### Test Endpoint Returns "success": false, "error": "Real stream scraping unavailable..."
**This is OK!** It means:
- Provider-source loaded but found no streams for that media
- Frontend will automatically fall back to embedded players
- App still works!

### Custom Player Doesn't Work, Falls Back to Embeds
**Possible causes:**
- Provider-source is not available on the server
- No streams found for that media
- Timeout during scraping (taking too long)

**Solution:**
- Frontend automatically falls back to old players (by design)
- Check server logs: `vercel logs`
- Wait a few seconds and try again

## 🔍 Server Logs

To see what's happening on the server:

**Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Deployments"
4. Find latest deployment
5. Click "Logs" → "Function Logs"

**Local Development:**
```bash
cd server
npm run dev
# Logs appear in terminal
```

Look for lines starting with `[STREAM]` or `[SCRAPER]`:
- `[STREAM] Scraping movie 550` - Started scraping
- `[SCRAPER] Success: videasy` - Found a provider
- `[STREAM] Success: 3 quality options found` - Success!
- `[SCRAPER] Provider source unavailable` - Fallback mode

## 🚀 Optimization Tips

### 1. Caching Results
Add caching to avoid re-scraping same media:

```typescript
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

// In /api/sources/get route:
const cacheKey = `${type}:${tmdbId}:${season}:${episode}`;
const cached = cache.get(cacheKey);
if (cached) return res.json(cached);
```

### 2. Timeout Management
Set timeouts to prevent long waits:

```typescript
const results = await providers.runSourceScraper({
  media,
  timeout: 5000, // 5 second timeout
  // ...
});
```

### 3. Multiple Provider Fallbacks
Try multiple providers in sequence if first fails:

```typescript
for (let i = 0; i < results.sources.length; i++) {
  const source = results.sources[i];
  // Try to get streams from this source
  if (streams.length > 0) break; // Stop on first success
}
```

## 📚 Files Changed

- `server/src/routes/source.ts` - Updated with provider-source integration
- `server/src/utils/providerManager.ts` - New utility for managing provider lifecycle

## ✨ What's Next

Once provider-source integration is working:

1. **Add caching** - Avoid re-scraping same media
2. **Improve error handling** - Better user messages
3. **Add analytics** - Track which sources work best
4. **Optimize timeouts** - Balance speed vs reliability
5. **Add user preferences** - Let users choose preferred provider

## 🤝 Support

If provider-source isn't working:

1. **Check server logs** - Most detailed error info
2. **Test health endpoint** - Verify server is running
3. **Test fallback** - Embedded players should still work
4. **Check proxy URL** - Verify PROXY_URL environment variable

Remember: Even if provider-source fails, the app gracefully falls back to embedded players, so users can still watch!
