import React from 'react';
import { Search, History } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SearchBarProps {
  searchQuery: string;
  handleSearchInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearch: () => void;
  searchHistory: string[];
  showSearchHistory: boolean;
  setShowSearchHistory: (show: boolean) => void;
  handleSearchHistorySelect: (query: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  searchHistoryRef: React.RefObject<HTMLDivElement>;
  hasVideoFiles: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  handleSearchInputChange,
  handleSearch,
  searchHistory,
  showSearchHistory,
  setShowSearchHistory,
  handleSearchHistorySelect,
  searchInputRef,
  searchHistoryRef,
  hasVideoFiles
}) => {
  return (
    <div className="p-3 border-b border-border-light dark:border-border-dark">
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={handleSearchInputChange}
              onFocus={() => searchHistory.length > 0 && setShowSearchHistory(true)}
              placeholder={hasVideoFiles ? "Search files and directories..." : "Search directories..."}
              className="w-full px-3 py-2 text-sm bg-light-surface dark:bg-dark-surface border border-border-light dark:border-border-dark rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 pr-8"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {searchHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSearchHistory(!showSearchHistory)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10 rounded transition-colors"
              >
                <History className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary" />
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        
        {/* Search History Dropdown */}
        {showSearchHistory && searchHistory.length > 0 && (
          <div 
            ref={searchHistoryRef}
            className="absolute z-10 mt-1 w-full bg-light-bg dark:bg-dark-bg border border-border-light dark:border-border-dark rounded-lg shadow-lg max-h-48 overflow-y-auto"
          >
            {searchHistory.map((query, index) => (
              <button
                key={index}
                onClick={() => handleSearchHistorySelect(query)}
                className="w-full px-3 py-2 text-left hover:bg-light-surface dark:hover:bg-dark-surface flex items-center gap-2"
              >
                <History className="w-4 h-4 text-light-text-secondary dark:text-dark-text-secondary flex-shrink-0" />
                <span className="truncate">{query}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchBar;