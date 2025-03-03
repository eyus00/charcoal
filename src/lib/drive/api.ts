import axios from 'axios';
import { BASE_URL } from './constants';
import { FileItem, SeasonInfo } from './types';
import { parseFileSizeToBytes, extractEpisodeNumber, calculateEpisodeMatchScore } from './utils';

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
      
      // Extract file size from the HTML
      let fileSize: number | undefined = undefined;
      
      // Find the parent row element
      const parentRow = link.closest('tr');
      if (parentRow) {
        // Look for the size column (typically the 4th column in most directory listings)
        const sizeCell = parentRow.querySelector('td:nth-child(4)');
        if (sizeCell) {
          const sizeText = sizeCell.textContent?.trim();
          if (sizeText) {
            // Convert size text to bytes
            fileSize = parseFileSizeToBytes(sizeText);
          }
        }
      }
      
      const fileItem: FileItem = {
        name,
        url: path + href,
        size: fileSize,
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
 * Creates a folder path for a movie based on title and year
 */
export function createMoviePath(title: string, year?: string): string {
  // If year is provided, append it to the title in parentheses
  const formattedTitle = year ? `${title} (${year})` : title;
  return `${BASE_URL}movies/${encodeURIComponent(formattedTitle)}/`;
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