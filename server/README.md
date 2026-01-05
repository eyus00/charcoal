# Movie Player Server

Backend API server for the custom movie player application. Provides endpoints for fetching video streams and metadata from TMDB.

## Features

- **Stream Fetching**: Get video streams for movies and TV shows
- **Quality Selection**: Support for multiple quality options (1080p, 720p, 480p)
- **Subtitle Support**: Fetch subtitles/captions for content
- **Metadata**: Retrieve movie/TV show information from TMDB
- **Proxy Integration**: Route requests through proxy for bypassing restrictions
- **Multi-source Fallback**: Support for multiple stream sources with fallbacks

## Prerequisites

- Node.js 16+
- npm or yarn

## Local Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
PORT=3001
TMDB_API_KEY=your_tmdb_api_key
PROXY_URL=https://simple-proxy.eyus00.workers.dev
FRONTEND_URL=http://localhost:5173
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

### 4. Run Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Sources

#### Get Stream URLs
```
GET /api/sources/get?tmdbId=550&type=movie&quality=auto
```

Query Parameters:
- `tmdbId` (required): TMDB ID of the media
- `type` (required): 'movie' or 'tv'
- `season` (required for TV): Season number
- `episode` (required for TV): Episode number
- `quality` (optional): Preferred quality ('best', '1080p', '720p', '480p', 'auto')

Response:
```json
{
  "success": true,
  "data": {
    "title": "Fight Club",
    "type": "hls",
    "qualities": [
      {"quality": "1080p", "url": "..."},
      {"quality": "720p", "url": "..."}
    ],
    "captions": [
      {"language": "English", "url": "...", "default": true}
    ],
    "sourceProvider": "videasy"
  },
  "fallbacks": ["vidlink.pro", "vidsrc.pro"]
}
```

#### Get Available Providers
```
GET /api/sources/providers
```

#### Proxy Request
```
POST /api/sources/proxy
Content-Type: application/json

{
  "url": "https://example.com/stream.m3u8",
  "headers": {"Authorization": "Bearer token"}
}
```

### Metadata

#### Search Movies/Shows
```
GET /api/meta/search?query=Fight%20Club&type=movie
```

#### Get Movie Details
```
GET /api/meta/movie/550
```

#### Get TV Show Details
```
GET /api/meta/tv/1399
```

#### Get Season Details
```
GET /api/meta/tv/1399/season/1
```

#### Get Episode Details
```
GET /api/meta/tv/1399/season/1/episode/1
```

## Deployment to Vercel

### 1. Create GitHub Repository

```bash
cd ..
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Select the `server` folder as the root directory in project settings
5. Add environment variables in Vercel dashboard:
   - `TMDB_API_KEY`
   - `PROXY_URL`
   - `FRONTEND_URL` (your frontend domain)
6. Deploy

### 3. Update Frontend Configuration

Update the frontend's API client to point to your Vercel server:

```typescript
const API_BASE_URL = process.env.VITE_API_URL || 'https://your-vercel-domain.vercel.app/api';
```

## Integration with Provider-Source

The server is set up to integrate with the `provider-source` library for advanced stream scraping. To enable:

1. The `provider-source` directory in the root contains all provider implementations
2. Can be imported and used in the routes to fetch real streams
3. Supports HLS, MP4, and direct streams
4. Handles proxying for CORS and geo-blocking

### Example Integration (Future)

```typescript
import { buildProviders, makeSimpleProxyFetcher } from '../provider-source/index';

const providers = buildProviders({
  fetcher: makeSimpleProxyFetcher(PROXY_URL)
});

const stream = await providers.scrapeSource({
  id: tmdbId,
  type: 'movie'
});
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message"
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Node environment |
| `TMDB_API_KEY` | - | TMDB API key (required) |
| `PROXY_URL` | https://simple-proxy.eyus00.workers.dev | Proxy URL for bypassing restrictions |
| `FRONTEND_URL` | * | Frontend URL for CORS (use specific domain in production) |

## Development Notes

- The server uses TypeScript for type safety
- All routes are in the `src/routes` directory
- Request config (TMDB API key, proxy URL) is passed via middleware
- Error handling middleware catches all unhandled errors
- All endpoints return consistent JSON response structure

## Next Steps

1. Integrate real stream scraping using provider-source library
2. Add caching for metadata and stream URLs
3. Add user authentication and watchlist functionality
4. Implement rate limiting and request throttling
5. Add logging and monitoring
