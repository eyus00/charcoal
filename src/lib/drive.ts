import axios from 'axios';

// Base URL for the file server
export const BASE_URL = "https://a.datadiff.us.kg/";

export interface FileItem {
  name: string;
  url: string;
  size?: string;
  isVideo: boolean;
  isDirectory: boolean;
}

export interface SeasonInfo {
  season_number: number;
  name: string;
  episode_count: number;
}

/**
 * Fetches directory contents from the server
 */
export async function fetchDirectoryContents(path: string): Promise<FileItem[]> {
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
      
      // Add directory items as well, even if not video files
      if (isDirectory) {
        fileItems.push({
          name,
          url: path + href,
          isVideo: false,
          isDirectory: true,
        });
      }

      // Only add video files
      if (isVideo) {
        fileItems.push({
          name,
          url: path + href,
          isVideo: true,
          isDirectory: false,
        });
      }
    });
    
    return fileItems;
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