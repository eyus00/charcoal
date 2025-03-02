import React from 'react';
import { FolderOpen } from 'lucide-react';
import { FileItem } from './utils';

interface DirectoryListProps {
  directories: string[];
  onDirectorySelect: (dirName: string) => void;
  isManualSearch: boolean;
  currentPath: string;
  BASE_URL: string;
  directories: FileItem[];
  onFileClick: (file: FileItem) => void;
}

const DirectoryList: React.FC<DirectoryListProps> = ({
  directories,
  onDirectorySelect,
  isManualSearch,
  currentPath,
  BASE_URL,
  directories: directoryItems,
  onFileClick,
}) => {
  if (directories.length === 0) return null;

  return (
    <div className={directoryItems.length > 0 ? "mt-4" : ""}>
      <h3 className="text-sm font-semibold mb-2">Folders</h3>
      <div className="space-y-1.5">
        {isManualSearch && (currentPath === `${BASE_URL}movies/` || currentPath === `${BASE_URL}tvs/`) ? (
          directories.map((dirName, index) => (
            <button
              key={index}
              onClick={() => onDirectorySelect(dirName)}
              className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
            >
              <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0 truncate">{dirName}</div>
            </button>
          ))
        ) : (
          directoryItems.map((dir, index) => (
            <button
              key={index}
              onClick={() => onFileClick(dir)}
              className="w-full p-2.5 bg-light-surface dark:bg-dark-surface rounded-lg hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 transition-colors flex items-center gap-3 text-left"
            >
              <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0 truncate">{dir.name}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default DirectoryList;