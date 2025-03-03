export interface FileItem {
  name: string;
  url: string;
  size?: number;
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