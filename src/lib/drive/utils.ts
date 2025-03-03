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
 * Converts file size string to bytes
 */
export function parseFileSizeToBytes(sizeStr: string): number | undefined {
  // Remove any HTML tags that might be present
  sizeStr = sizeStr.replace(/<[^>]*>/g, '');
  
  // Common file size patterns
  const match = sizeStr.match(/^([\d,.]+)\s*([KMGT]?B)$/i);
  if (!match) return undefined;
  
  let size = parseFloat(match[1].replace(/,/g, ''));
  const unit = match[2].toUpperCase();
  
  // Convert to bytes based on unit
  switch (unit) {
    case 'KB':
      size *= 1024;
      break;
    case 'MB':
      size *= 1024 * 1024;
      break;
    case 'GB':
      size *= 1024 * 1024 * 1024;
      break;
    case 'TB':
      size *= 1024 * 1024 * 1024 * 1024;
      break;
  }
  
  return Math.round(size);
}