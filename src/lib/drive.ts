import axios from 'axios';

// Base URL for the file server
export const BASE_URL = "https://a.datadiff.us.kg/";

export interface FileItem {
  name: string;
  url: string;
  size?: string;
  isVideo: boolean;
  isDirectory: boolean;
  episodeNumber?: number;
  matchScore?: number;
}

export interface SeasonInfo {
  season_number: number;
  name: string;
  episode_count: number;
}

/**
 * Extracts episode number from a filename using various patterns
 */
export const extractEpisodeNumber = (filename: string): number | undefined => {
  // Common patterns for episode numbers in filenames
  const patterns = [
    /[Ee](\d+)/,                // E01 or e01
    /[Ee][Pp](\d+)/,            // EP01 or ep01
    /Episode\s*(\d+)/i,         // Episode 01
    /\bS\d+E(\d+)\b/i,          // S01E01
    /\b(\d{1,2})v\d+\b/,        // 01v2 (episode 01 version 2)
    /\s(\d{1,2})\s/,            // Space followed by 1-2 digits followed by space
    /\s(\d{1,2})$/              // Space followed by 1-2 digits at the end
  ];
  
  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  
  return undefined;
};

/**
 * Calculate a match score for episode files
 */
export const calculateEpisodeMatchScore = (filename: string, episodeNumber: number, seasonNumber?: number): number => {
  let score = 0;
  const episodeStr = String(episodeNumber).padStart(2, '0');
  
  // Exact episode number patterns
  if (seasonNumber) {
    const seasonStr = String(seasonNumber).padStart(2, '0');
    if (new RegExp(`[Ss]${seasonStr}[Ee]${episodeStr}\\b`, 'i').test(filename)) score += 100; // S01E05 format
    if (new RegExp(`\\bS${seasonNumber}E${episodeStr}\\b`, 'i').test(filename)) score += 100; // S1E5 format
    if (new RegExp(`\\b${seasonNumber}x${episodeStr}\\b`, 'i').test(filename)) score += 100; // 1x05 format
  } else {
    if (new RegExp(`[Ss]\\d+[Ee]${episodeStr}\\b`, 'i').test(filename)) score += 90; // S01E05 format
    if (new RegExp(`\\bS\\d+E${episodeStr}\\b`, 'i').test(filename)) score += 90; // S1E5 format
  }
  
  // Episode with number
  if (new RegExp(`[Ee]pisode\\s*${episodeNumber}\\b`, 'i').test(filename)) score += 90;
  if (new RegExp(`[Ee]p\\s*${episodeNumber}\\b`, 'i').test(filename)) score += 90;
  
  // Just the number with word boundaries
  if (new RegExp(`\\b${episodeNumber}\\b`, 'i').test(filename)) score += 50;
  
  // Padded number
  if (new RegExp(`\\b${episodeStr}\\b`, 'i').test(filename)) score += 70;
  
  return score;
};

/**
 * Fetches directory contents from the server
 */
export async function fetchDirectoryContents(path: string, selectedEpisode?: number, selectedSeason?: number): Promise<FileItem[]> {
  try {
    // Use a CORS proxy to access the directory
    const corsProxy = 'https://api.allorigins.win/raw?url=';
    const response = await fetch(corsProxy + encodeURIComponent(path));
    
    if (!response.ok) {
      throw new Error("Directory not found or inaccessible");
    }
    
    const html = await response.text();
    
    // Parse the directory listing HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract file and directory links
    const links = doc.querySelectorAll('a');
    const fileItems: FileItem[] = [];
    
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href === '../' || href === './') return;
      
      const name = link.textContent?.trim() || href;
      const isDirectory = href.endsWith('/');
      
      // Check if it's a video file
      const isVideo = /\.(mkv|mp4|avi|mov|webm)$/i.test(href);
      
      const fileItem: FileItem = {
        name,
        url: path + href,
        isVideo,
        isDirectory,
      };
      
      // Extract episode number and calculate match score for video files
      if (isVideo) {
        fileItem.episodeNumber = extractEpisodeNumber(name);
        
        if (selectedEpisode) {
          fileItem.matchScore = calculateEpisodeMatchScore(name, selectedEpisode, selectedSeason);
        }
      }
      
      fileItems.push(fileItem);
    });
    
    // Sort files: directories first, then by match score for the selected episode, then by episode number, then by name
    return fileItems.sort((a, b) => {
      // First sort directories to the top
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      
      // If both are directories, sort alphabetically
      if (a.isDirectory && b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      
      // If episode is selected, prioritize matching files by match score
      if (selectedEpisode) {
        const aScore = a.matchScore || 0;
        const bScore = b.matchScore || 0;
        
        if (aScore !== bScore) {
          return bScore - aScore; // Higher score first
        }
      }
      
      // Then sort by episode number
      if (a.episodeNumber && b.episodeNumber) {
        return a.episodeNumber - b.episodeNumber;
      }
      
      // Finally sort by name
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error("Error fetching directory:", error);
    throw new Error("Failed to access directory. The server might be unavailable or the content doesn't exist.");
  }
}

/**
 * Creates a folder path for a TV show based on title and season
 */
export function createTVShowPath(title: string, season?: number): string {
  let folderPath = `${BASE_URL}tvs/${encodeURIComponent(title)}/`;
  
  if (season) {
    folderPath += `Season ${season}/`;
  }
  
  return folderPath;
}

/**
 * Creates a folder path for a movie based on title
 */
export function createMoviePath(title: string): string {
  return `${BASE_URL}movies/${encodeURIComponent(title)}/`;
}

/**
 * Fetches season information from TMDB for a TV show
 */
export async function fetchTVShowSeasons(tvId: number): Promise<SeasonInfo[]> {
  try {
    // Use the existing TMDB API client from the project
    const response = await axios.get(`https://api.themoviedb.org/3/tv/${tvId}`, {
      params: {
        api_key: '50404130561567acf3e0725aeb09ec5d'
      }
    });
    
    if (response.data && response.data.seasons) {
      return response.data.seasons.map((season: any) => ({
        season_number: season.season_number,
        name: season.name,
        episode_count: season.episode_count
      }));
    }
    
    return [];
  } catch (error) {
    console.error("Error fetching TV show seasons:", error);
    return [];
  }
}