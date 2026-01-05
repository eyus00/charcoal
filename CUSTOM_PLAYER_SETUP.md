# Custom Movie Player - Complete Setup Guide

This guide explains the new custom player implementation that replaces the old iframe-based approach with a unified HTML5 video player.

## 🎯 What Changed

### Before
- Used external embedded players (videasy.net, vidlink.pro, vidsrc.pro, etc.)
- Each player had different UI and popup ads
- No uniform experience across the app
- Progress tracking via postMessage events

### After
- Custom HTML5 video player with consistent UI
- Server-based stream fetching using provider-source
- Quality selection, subtitles, and custom controls
- Clean, ad-free viewing experience
- Fallback to old embedded players if server is unavailable

## 📁 Project Structure

```
root/
├── server/                    # Backend API server (Node.js/Express)
│   ├── src/
│   │   ├── server.ts         # Main Express application
│   │   └── routes/
│   │       ├── source.ts     # Stream fetching endpoints
│   │       └── meta.ts       # TMDB metadata endpoints
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── README.md
├── provider-source/           # Provider library (already uploaded)
├── src/
│   ├── components/
│   │   └── watch/
│   │       └── CustomPlayer.tsx    # New HTML5 player component
│   ├── api/
│   │   └── streamClient.ts         # Client for server API
│   ├── pages/
│   │   └── WatchPage.tsx           # Updated to use CustomPlayer
│   └── ...
├── .env.example               # Environment configuration template
└── ...
```

## 🚀 Getting Started

### Step 1: Install Server Dependencies

```bash
cd server
npm install
```

### Step 2: Configure Environment Variables

#### Frontend (.env)
```bash
# Copy from .env.example
cp .env.example .env
```

Configure for local development:
```env
VITE_TMDB_API_KEY=50404130561567acf3e0725aeb09ec5d
VITE_API_URL=http://localhost:3001/api
```

#### Backend (server/.env)
```bash
cd server
cp .env.example .env
```

Configure:
```env
PORT=3001
TMDB_API_KEY=50404130561567acf3e0725aeb09ec5d
PROXY_URL=https://simple-proxy.eyus00.workers.dev
FRONTEND_URL=http://localhost:5173
```

### Step 3: Run Both Services (Terminal 1: Frontend, Terminal 2: Backend)

**Terminal 1 - Frontend:**
```bash
npm run dev
# Runs on http://localhost:5173
```

**Terminal 2 - Backend:**
```bash
cd server
npm run dev
# Runs on http://localhost:3001
```

## 📊 How It Works

### Flow Diagram
```
User clicks "Watch"
    ↓
WatchPage component loads
    ↓
Fetch stream via: GET /api/sources/get?tmdbId=550&type=movie
    ↓
Server processes request:
  1. Validates input
  2. Will eventually use provider-source to scrape streams
  3. Returns multiple qualities and captions
    ↓
CustomPlayer component receives:
  - Video URL
  - Quality options
  - Captions/subtitles
  - Metadata (title, poster)
    ↓
User sees custom player with controls:
  - Play/Pause (Space)
  - Volume (arrow keys)
  - Seek (click progress bar)
  - Quality selector
  - Subtitles
  - Fullscreen (F)
    ↓
Progress tracked automatically to localStorage
```

## 🎮 Player Controls & Keyboard Shortcuts

### Mouse Controls
- **Click video** → Play/Pause
- **Click progress bar** → Seek
- **Drag volume slider** → Change volume
- **Click buttons** → Various controls

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| → | Forward 5 seconds |
| ← | Back 5 seconds |
| ↑ | Increase volume |
| ↓ | Decrease volume |
| F | Toggle fullscreen |
| M | Toggle mute |
| C | Toggle subtitles menu |

## 🌐 API Endpoints

### Get Stream
```
GET /api/sources/get
Query Parameters:
  - tmdbId: number (required)
  - type: 'movie' | 'tv' (required)
  - season: number (required for TV)
  - episode: number (required for TV)
  - quality: string (optional, default: 'auto')

Response:
{
  "success": true,
  "data": {
    "title": "Fight Club",
    "type": "hls",
    "qualities": [
      {"quality": "1080p", "url": "..."},
      {"quality": "720p", "url": "..."},
      {"quality": "480p", "url": "..."}
    ],
    "captions": [
      {"language": "English", "url": "...", "default": true},
      {"language": "Spanish", "url": "..."}
    ],
    "sourceProvider": "videasy"
  },
  "fallbacks": ["vidlink.pro", "vidsrc.pro"]
}
```

### Search
```
GET /api/meta/search?query=fight%20club&type=movie
```

### Get Details
```
GET /api/meta/movie/:movieId
GET /api/meta/tv/:tvId
GET /api/meta/tv/:tvId/season/:seasonNumber
GET /api/meta/tv/:tvId/season/:seasonNumber/episode/:episodeNumber
```

## 🔧 Configuration

### Quality Selection
Edit `src/components/watch/CustomPlayer.tsx` to change default quality:
```typescript
const handleQualityChange = (quality: Quality) => {
  // Quality switching logic
}
```

### Subtitle Languages
The player will automatically display available captions from the API response.

### Player Styling
Customize colors in `src/components/watch/CustomPlayer.tsx`:
- Primary color (progress bar, controls): Currently red (`bg-red-500`)
- Hover color: White with 20% opacity (`hover:bg-white/20`)
- Background: Black (`bg-black`)

## 📱 Responsive Design

The player is fully responsive:
- **Desktop**: Full controls visible, hover effects enabled
- **Tablet**: Touch-friendly control buttons
- **Mobile**: Landscape orientation optimized, auto-hide controls after 3 seconds

Controls automatically hide when:
- Video is playing and user stops moving mouse
- Shows again on mouse move or when paused

## 🐛 Troubleshooting

### Server won't start
```bash
cd server
npm install
npm run dev
```

### CORS errors
Make sure `FRONTEND_URL` in `server/.env` matches your frontend URL:
```env
# For local development
FRONTEND_URL=http://localhost:5173

# For production
FRONTEND_URL=https://your-frontend.com
```

### API not responding
1. Check server is running: `curl http://localhost:3001/health`
2. Check network tab in browser DevTools
3. Verify `VITE_API_URL` in frontend `.env` matches server URL

### Stream won't play
- Check TMDB ID is correct
- Check server can reach TMDB API (verify API key)
- Check proxy URL is accessible
- Browser console will show detailed errors

## 🚀 Deployment

### Deploy Backend to Vercel

1. **Create GitHub Repository:**
```bash
git init
git add .
git commit -m "Add custom player implementation"
git push -u origin main
```

2. **Deploy to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import GitHub repository
   - Set Root Directory: `server`
   - Add Environment Variables:
     - `TMDB_API_KEY`: Your TMDB key
     - `PROXY_URL`: `https://simple-proxy.eyus00.workers.dev`
     - `FRONTEND_URL`: Your frontend domain
   - Deploy!

3. **Update Frontend `.env`:**
```env
VITE_API_URL=https://your-project.vercel.app/api
```

### Deploy Frontend
- Push to GitHub
- Vercel auto-deploys via GitHub integration

## 📚 Next Steps: Integrating provider-source

The server currently returns mock stream data. To integrate real stream scraping:

1. **In `server/src/routes/source.ts`**, replace the mock response with actual provider-source integration:

```typescript
import { buildProviders, makeSimpleProxyFetcher } from '../../provider-source/index';

const providers = buildProviders({
  fetcher: makeSimpleProxyFetcher(config.proxyUrl)
});

// Then use in the /api/sources/get endpoint:
const stream = await providers.scrapeSource({
  id: tmdbId,
  type,
  season,
  episode
});
```

2. **Add caching** to avoid repeated scraping:
```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
```

3. **Add error handling** for multiple source fallbacks

## 🎓 Architecture Details

### CustomPlayer Component
- **Location**: `src/components/watch/CustomPlayer.tsx`
- **Size**: ~527 lines
- **Features**:
  - HTML5 video element
  - Custom controls UI
  - Quality selection
  - Caption support
  - Fullscreen capability
  - Keyboard shortcuts
  - Auto-hiding controls
  - Progress tracking callback
  - Buffering indicator
  - Volume control with slider
  - Time display formatter

### StreamClient
- **Location**: `src/api/streamClient.ts`
- **Purpose**: Type-safe API client for server endpoints
- **Methods**:
  - `getStream()` - Fetch streams
  - `getProviders()` - List available providers
  - `proxyRequest()` - Route requests through proxy
  - `search()` - Search TMDB
  - `getMovieDetails()` - Movie metadata
  - `getTVDetails()` - TV metadata
  - `getSeasonDetails()` - Season metadata
  - `getEpisodeDetails()` - Episode metadata

### Watch Tracking
- **Location**: `src/hooks/useWatchTracking.ts`
- **Updated**: Still works with CustomPlayer
- **Tracks**: Progress, completion, watch history

## 🤝 Support

For issues or questions:
1. Check `server/README.md` for server-specific help
2. Check browser console for error messages
3. Check network tab for API calls
4. Review environment configuration

## 📝 Summary

You now have:
✅ Custom HTML5 video player with unified UI
✅ Backend API server for stream management
✅ Quality selection support
✅ Subtitle/caption support
✅ Keyboard shortcuts
✅ Fallback to old players if server unavailable
✅ Ready to deploy on Vercel

The old iframe-based approach is still available as a fallback - if the custom server is down, the app automatically uses the old embedded players.
