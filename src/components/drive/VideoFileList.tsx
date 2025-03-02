import React from 'react';
import { Video } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FileItem } from './utils';

interface VideoFileListProps {
  videoFiles: FileItem[];
  selectedEpisode?: number;
  onFileClick: (file: FileItem) => void;
  searchQuery: string;
}

const VideoFileList: React.FC<VideoFileListProps> = ({
  videoFiles,
  selectedEpisode,
  onFileClick,
  searchQuery,
}) => {
  // Get file extension from filename
  const getFileExtension = (filename: string): string => {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : '';
  };

  // Get video quality from filename
  const getVideoQuality = (filename: string): string => {
    const qualityMatch = filename.match(/\b(720p|1080p|2160p|4K)\b/i);
    return qualityMatch ? qualityMatch[0].toUpperCase() : '';
  };

  // Get video source from filename
  const getVideoSource = (filename: string): string => {
    const sourceMatch = filename.match(/\b(BluRay|WEBDL|WEB-DL|WEBRip|HDRip|BRRip|DVDRip)\b/i);
    return sourceMatch ? sourceMatch[0] : '';
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">
        Video Files {searchQuery && `matching "${searchQuery}"`}
      </h3>
      <div className="space-y-1.5">
        {videoFiles.map((file, index) => {
          // Determine highlight intensity based on match score
          let highlightClass = "";
          if (file.matchScore && file.matchScore > 0) {
            if (file.matchScore >= 90) {
              highlightClass = "bg-red-600/20 dark:bg-red-500/20 border border-red-600/30 dark:border-red-500/30";
            } else if (file.matchScore >= 50) {
              highlightClass = "bg-red-600/10 dark:bg-red-500/10 border border-red-600/20 dark:border-red-500/20";
            }
          }
          
          const fileExt = getFileExtension(file.name);
          const videoQuality = getVideoQuality(file.name);
          const videoSource = getVideoSource(file.name);
          
          return (
            <button
              key={index}
              onClick={() => onFileClick(file)}
              className={cn(
                "w-full p-2.5 rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors",
                file.matchScore && file.matchScore > 0 ? highlightClass : "bg-light-surface dark:bg-dark-surface"
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className={cn(
                  "p-1.5 rounded-md flex-shrink-0",
                  file.matchScore && file.matchScore > 0
                    ? "bg-red-600/10 dark:bg-red-500/10" 
                    : "bg-light-text-secondary/10 dark:bg-dark-text-secondary/10"
                )}>
                  <Video className={cn(
                    "w-4 h-4",
                    file.matchScore && file.matchScore > 0
                      ? "text-red-600 dark:text-red-500" 
                      : "text-light-text-secondary dark:text-dark-text-secondary"
                  )} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="font-medium truncate">{file.name}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-light-text-secondary dark:text-dark-text-secondary">
                    {fileExt && (
                      <span className="px-1.5 py-0.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded">
                        {fileExt}
                      </span>
                    )}
                    {videoQuality && (
                      <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded">
                        {videoQuality}
                      </span>
                    )}
                    {videoSource && (
                      <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded">
                        {videoSource}
                      </span>
                    )}
                    {file.matchScore && file.matchScore >= 90 && selectedEpisode && (
                      <span className="px-1.5 py-0.5 bg-red-500/10 text-red-700 dark:text-red-400 rounded">
                        Episode {selectedEpisode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VideoFileList;