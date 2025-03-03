import React from 'react';
import { Video, ExternalLink, Smartphone } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FileItem } from '../../lib/drive';

interface VideoFileItemProps {
  file: FileItem;
  onClick: () => void;
  isCard?: boolean;
  onOpenInBrowser?: (url: string) => void;
  onOpenInOutPlayer?: (url: string) => void;
}

const VideoFileItem: React.FC<VideoFileItemProps> = ({ 
  file, 
  onClick, 
  isCard = false,
  onOpenInBrowser,
  onOpenInOutPlayer
}) => {
  // Get file extension from filename
  const getFileExtension = (filename: string): string => {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : '';
  };

  // Format file size from bytes to human-readable format
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    
    if (bytes >= 1e9) {
      return (bytes / 1e9).toFixed(2) + " GB";
    } else if (bytes >= 1e6) {
      return (bytes / 1e6).toFixed(2) + " MB";
    } else if (bytes >= 1e3) {
      return (bytes / 1e3).toFixed(2) + " KB";
    }
    return bytes + " Bytes";
  };

  // Get video quality from filename
  const getVideoQuality = (filename: string): string => {
    const qualityMatch = filename.match(/\b(720p|1080p|2160p|4K)\b/i);
    return qualityMatch ? qualityMatch[1].toUpperCase() : '';
  };

  // Get video source from filename
  const getVideoSource = (filename: string): string => {
    const sourceMatch = filename.match(/\b(BluRay|WEBDL|WEB-DL|WEBRip|HDRip|BRRip|DVDRip)\b/i);
    return sourceMatch ? sourceMatch[1].replace('WEBDL', 'WEB-DL') : '';
  };

  const fileExt = getFileExtension(file.name);
  const fileSize = formatFileSize(file.size);
  const videoQuality = getVideoQuality(file.name);
  const videoSource = getVideoSource(file.name);
  
  // Check if we're on mobile
  const isMobile = window.innerWidth < 768;

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenInBrowser) {
      onOpenInBrowser(file.url);
    } else {
      window.open(file.url, '_blank');
    }
  };

  const handleOpenInOutPlayer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenInOutPlayer) {
      onOpenInOutPlayer(file.url);
    } else {
      window.location.href = `outplayer://${file.url}`;
    }
  };

  if (isCard) {
    return (
      <button
        onClick={onClick}
        className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
      >
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-md bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 flex-shrink-0">
            <Video className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
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
              
              {/* Mobile action buttons */}
              {isMobile && (
                <>
                  <button 
                    onClick={handleOpenInBrowser}
                    className="ml-auto p-1.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded hover:bg-light-text-secondary/20 dark:hover:bg-dark-text-secondary/20"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                  </button>
                  <button 
                    onClick={handleOpenInOutPlayer}
                    className="p-1.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded hover:bg-light-text-secondary/20 dark:hover:bg-dark-text-secondary/20"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                  </button>
                </>
              )}
              
              {/* File size - show on desktop or if no mobile buttons */}
              {(!isMobile && fileSize) && (
                <span className="ml-auto">
                  {fileSize}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-2.5 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors"
    >
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 rounded-md bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 flex-shrink-0">
          <Video className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
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
            
            {/* Mobile action buttons */}
            {isMobile && (
              <>
                <button 
                  onClick={handleOpenInBrowser}
                  className="ml-auto p-1.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded hover:bg-light-text-secondary/20 dark:hover:bg-dark-text-secondary/20"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                </button>
                <button 
                  onClick={handleOpenInOutPlayer}
                  className="p-1.5 bg-light-text-secondary/10 dark:bg-dark-text-secondary/10 rounded hover:bg-light-text-secondary/20 dark:hover:bg-dark-text-secondary/20"
                >
                  <Smartphone className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary" />
                </button>
              </>
            )}
            
            {/* File size - show on desktop or if no mobile buttons */}
            {(!isMobile && fileSize) && (
              <span className="ml-auto">
                {fileSize}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

export default VideoFileItem;