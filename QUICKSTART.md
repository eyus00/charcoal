# 🚀 Quick Start Checklist

## ✅ What's Been Done

- ✅ Created backend Node.js/Express server in `/server` directory
- ✅ Built custom HTML5 video player component (`CustomPlayer.tsx`)
- ✅ Created API client for server communication (`streamClient.ts`)
- ✅ Updated WatchPage to use custom player with fallback to old players
- ✅ Added quality selection support
- ✅ Added subtitle/caption support
- ✅ Implemented keyboard shortcuts
- ✅ Added fullscreen, volume, progress tracking
- ✅ Created comprehensive documentation

## 🎬 To Get Started Locally

### 1. Open Two Terminal Windows

**Terminal 1 - Frontend:**
```bash
npm install  # (if needed)
npm run dev
# Opens at http://localhost:5173
```

**Terminal 2 - Backend Server:**
```bash
cd server
npm install
npm run dev
# Starts at http://localhost:3001
```

### 2. Configure Environment Variables (Optional)
If your frontend `.env` doesn't exist, create it:
```bash
cat > .env << EOF
VITE_TMDB_API_KEY=50404130561567acf3e0725aeb09ec5d
VITE_API_URL=http://localhost:3001/api
EOF
```

And in `server/`:
```bash
cat > server/.env << EOF
PORT=3001
TMDB_API_KEY=50404130561567acf3e0725aeb09ec5d
PROXY_URL=https://simple-proxy.eyus00.workers.dev
FRONTEND_URL=http://localhost:5173
EOF
```

### 3. Test It!
- Go to a movie/show page
- Click watch
- You should see the new custom player with:
  - Play/pause button
  - Volume control
  - Progress bar
  - Settings menu (for quality)
  - Subtitles button
  - Fullscreen button

## 📋 What's in Each Folder

### `/server`
- **Node.js/Express backend**
- Provides API endpoints for streams and metadata
- Currently returns mock stream data (ready to integrate provider-source)
- Can be deployed to Vercel independently

### `/src/components/watch/CustomPlayer.tsx`
- **New custom HTML5 video player**
- Replaces the old iframe-based players
- Full featured with keyboard shortcuts
- ~530 lines of code

### `/src/api/streamClient.ts`
- **Type-safe API client** for the server
- Methods for fetching streams, searching, getting metadata

### `/src/pages/WatchPage.tsx`
- **Updated to use custom player**
- Falls back to old embedded players if server unavailable
- Handles both movies and TV episodes

## 🔌 How to Deploy

### Step 1: Create GitHub Repository
```bash
git init
git add .
git commit -m "Initial commit with custom player"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

### Step 2: Deploy Server to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Select your GitHub repo
4. **Root Directory**: `server`
5. **Environment Variables**:
   - `TMDB_API_KEY`: `50404130561567acf3e0725aeb09ec5d`
   - `PROXY_URL`: `https://simple-proxy.eyus00.workers.dev`
   - `FRONTEND_URL`: Your frontend domain (e.g., `https://myapp.vercel.app`)
6. Click Deploy!

### Step 3: Deploy Frontend (if not already on Vercel)
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Select your GitHub repo (same repo)
4. Keep default settings
5. **Environment Variables**:
   - `VITE_API_URL`: Your Vercel server URL (e.g., `https://server-name.vercel.app/api`)
   - `VITE_TMDB_API_KEY`: `50404130561567acf3e0725aeb09ec5d`
6. Click Deploy!

## 🎮 Player Features

### Controls
- **Play/Pause**: Click video or click play button
- **Volume**: Slider in bottom-left (also arrow up/down keys)
- **Quality**: Settings icon in bottom-right
- **Subtitles**: CC button in bottom-right
- **Fullscreen**: Expand button in bottom-right
- **Seek**: Click anywhere on progress bar

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| Space | Play/Pause |
| F | Fullscreen |
| M | Mute |
| C | Subtitles menu |
| ← / → | Skip -5 / +5 seconds |
| ↑ / ↓ | Volume up / down |

## 📚 Documentation

Read these for more details:
- `CUSTOM_PLAYER_SETUP.md` - Complete setup guide
- `server/README.md` - Backend server documentation
- `QUICKSTART.md` - This file (quick reference)

## ⚠️ Important Notes

### Current State
- The custom player is fully functional ✅
- Server currently returns mock stream data (for development)
- App automatically falls back to old players if server is unavailable
- All existing features still work (watch history, recommendations, etc.)

### Next Steps
1. **For Production**: Integrate real stream scraping using provider-source
2. **Add Caching**: Cache stream URLs to reduce server load
3. **Add Analytics**: Track which streams are popular
4. **Improve Error Handling**: Better error messages for users

### Testing the Server
```bash
# Check if server is running
curl http://localhost:3001/health

# Test stream endpoint
curl "http://localhost:3001/api/sources/get?tmdbId=550&type=movie"
```

## 🆘 Troubleshooting

**Server won't start?**
```bash
cd server && npm install && npm run dev
```

**CORS errors?**
- Check `FRONTEND_URL` in server `.env`
- Restart server after changing `.env`

**API not responding?**
- Make sure server terminal shows "running on http://localhost:3001"
- Check `.env` files are created
- Check network tab in browser DevTools

**Player not showing?**
- Check browser console for errors
- Check network tab for API calls
- Verify `VITE_API_URL` in frontend `.env`

## 🎉 You're All Set!

Your custom player is ready to go. Start the services and test it out!

Questions? Check the detailed docs in `CUSTOM_PLAYER_SETUP.md`.
