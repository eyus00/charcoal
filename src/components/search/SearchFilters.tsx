import React, { useState } from 'react';
import { Filter, Star, X, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Genre {
  id: number;
  name: string;
}

interface SearchFiltersProps {
  isOpen: boolean;
  onClose: () => void;
  genres: Genre[];
  selectedGenres: number[];
  minRating: number;
  yearRange: [number, number];
  onGenreToggle: (genreId: number) => void;
  onRatingChange: (rating: number) => void;
  onYearChange: (range: [number, number]) => void;
  onClearFilters: () => void;
  totalResults: number;
}

const YEAR_OPTIONS = [
  { label: '2020s', range: [2020, 2029] },
  { label: '2024', range: [2024, 2024] },
  { label: '2023', range: [2023, 2023] },
  { label: '2022', range: [2022, 2022] },
  { label: '2021', range: [2021, 2021] },
  { label: '2020', range: [2020, 2020] },
  { label: '2019', range: [2019, 2019] },
  { label: '2018', range: [2018, 2018] },
  { label: '2017', range: [2017, 2017] },
  { label: '2016', range: [2016, 2016] },
  { label: '2015', range: [2015, 2015] },
  { label: '2010s', range: [2010, 2019] },
  { label: '2000s', range: [2000, 2009] },
  { label: '1990s', range: [1990, 1999] },
  { label: '1980s', range: [1980, 1989] },
];

const SearchFilters: React.FC<SearchFiltersProps> = ({
  isOpen,
  onClose,
  genres,
  selectedGenres,
  minRating,
  yearRange,
  onGenreToggle,
  onRatingChange,
  onYearChange,
  onClearFilters,
  totalResults,
}) => {
  const [customYear, setCustomYear] = useState('');
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const handleYearSelect = (yearOption: { label: string; range: [number, number] }) => {
    const newSelectedYears = new Set(selectedYears);
    
    if (newSelectedYears.has(yearOption.label)) {
      newSelectedYears.delete(yearOption.label);
    } else {
      newSelectedYears.add(yearOption.label);
    }
    
    setSelectedYears(newSelectedYears);

    // Calculate combined year range from all selected years
    if (newSelectedYears.size === 0) {
      onYearChange([1900, new Date().getFullYear()]);
    } else {
      const selectedRanges = Array.from(newSelectedYears)
        .map(label => YEAR_OPTIONS.find(opt => opt.label === label)?.range)
        .filter((range): range is [number, number] => !!range);

      const minYear = Math.min(...selectedRanges.map(range => range[0]));
      const maxYear = Math.max(...selectedRanges.map(range => range[1]));
      onYearChange([minYear, maxYear]);
    }
  };

  const handleCustomYearSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const year = parseInt(customYear);
    if (year >= 1900 && year <= new Date().getFullYear()) {
      const yearLabel = `${year}`;
      const newSelectedYears = new Set(selectedYears);
      newSelectedYears.add(yearLabel);
      setSelectedYears(newSelectedYears);
      onYearChange([year, year]);
      setCustomYear('');
    }
  };

  const handleRatingSliderChange = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.min(Math.max(x / width, 0), 1);
    const rating = Math.round(percentage * 9);
    onRatingChange(rating);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Mobile bottom sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 bg-light-bg dark:bg-dark-bg rounded-t-2xl transition-transform duration-300 h-[85vh] md:hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <FilterContent
          onClose={onClose}
          onClearFilters={onClearFilters}
          totalResults={totalResults}
          genres={genres}
          selectedGenres={selectedGenres}
          onGenreToggle={onGenreToggle}
          minRating={minRating}
          onRatingChange={onRatingChange}
          selectedYears={selectedYears}
          handleYearSelect={handleYearSelect}
          customYear={customYear}
          setCustomYear={setCustomYear}
          handleCustomYearSubmit={handleCustomYearSubmit}
          handleRatingSliderChange={handleRatingSliderChange}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
        />
      </div>

      {/* Desktop side panel */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-[400px] bg-light-bg dark:bg-dark-bg shadow-lg transition-transform duration-300 hidden md:block",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <FilterContent
          onClose={onClose}
          onClearFilters={onClearFilters}
          totalResults={totalResults}
          genres={genres}
          selectedGenres={selectedGenres}
          onGenreToggle={onGenreToggle}
          minRating={minRating}
          onRatingChange={onRatingChange}
          selectedYears={selectedYears}
          handleYearSelect={handleYearSelect}
          customYear={customYear}
          setCustomYear={setCustomYear}
          handleCustomYearSubmit={handleCustomYearSubmit}
          handleRatingSliderChange={handleRatingSliderChange}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
        />
      </div>
    </>
  );
};

// Extracted common content into a separate component
const FilterContent: React.FC<{
  onClose: () => void;
  onClearFilters: () => void;
  totalResults: number;
  genres: Genre[];
  selectedGenres: number[];
  onGenreToggle: (id: number) => void;
  minRating: number;
  onRatingChange: (rating: number) => void;
  selectedYears: Set<string>;
  handleYearSelect: (yearOption: { label: string; range: [number, number] }) => void;
  customYear: string;
  setCustomYear: (year: string) => void;
  handleCustomYearSubmit: (e: React.FormEvent) => void;
  handleRatingSliderChange: (e: React.MouseEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
}> = ({
  onClose,
  onClearFilters,
  totalResults,
  genres,
  selectedGenres,
  onGenreToggle,
  minRating,
  onRatingChange,
  selectedYears,
  handleYearSelect,
  customYear,
  setCustomYear,
  handleCustomYearSubmit,
  handleRatingSliderChange,
  isDragging,
  setIsDragging,
}) => (
  <div className="h-full flex flex-col">
    {/* Header */}
    <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Filter className="w-5 h-5" />
        <h2 className="text-lg font-semibold">Filters</h2>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onClearFilters}
          className="text-sm text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
        >
          Clear All
        </button>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-light-surface dark:hover:bg-dark-surface rounded-full"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>

    {/* Results Count */}
    <div className="px-4 py-3 border-b border-border-light dark:border-border-dark bg-light-surface dark:bg-dark-surface">
      <div className="text-sm text-light-text-secondary dark:text-dark-text-secondary">
        {totalResults.toLocaleString()} results found
      </div>
    </div>

    {/* Filter Sections */}
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="p-4 space-y-6">
        {/* Years Section */}
        <section>
          <h3 className="text-sm font-semibold mb-3">Release Year</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {YEAR_OPTIONS.map((yearOption) => (
              <button
                key={yearOption.label}
                onClick={() => handleYearSelect(yearOption)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full transition-colors",
                  selectedYears.has(yearOption.label)
                    ? "bg-red-600 text-white"
                    : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10"
                )}
              >
                {yearOption.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleCustomYearSubmit} className="relative">
            <input
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              value={customYear}
              onChange={(e) => setCustomYear(e.target.value)}
              placeholder="Enter year..."
              className="w-full px-3 py-1.5 pr-9 text-sm bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary hover:text-red-600 dark:hover:text-red-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </section>

        {/* Genres Section */}
        <section>
          <h3 className="text-sm font-semibold mb-3">Genres</h3>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <button
                key={genre.id}
                onClick={() => onGenreToggle(genre.id)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full transition-colors",
                  selectedGenres.includes(genre.id)
                    ? "bg-red-600 text-white"
                    : "bg-light-surface dark:bg-dark-surface text-light-text-primary dark:text-dark-text-primary hover:bg-light-text-secondary/10 dark:hover:bg-dark-text-secondary/10"
                )}
              >
                {genre.name}
              </button>
            ))}
          </div>
        </section>

        {/* Rating Section */}
        <section className="pb-4">
          <h3 className="text-sm font-semibold mb-3">Minimum Rating</h3>
          <div className="space-y-4">
            <div 
              className="relative w-full h-2 bg-light-surface dark:bg-dark-surface rounded-full overflow-hidden cursor-pointer"
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onMouseMove={handleRatingSliderChange}
            >
              <div
                className="absolute inset-y-0 left-0 bg-red-600 dark:bg-red-500 transition-all"
                style={{ width: `${(minRating / 9) * 100}%` }}
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-red-600 dark:bg-red-500 rounded-full shadow-lg transform -translate-x-1/2 cursor-grab"
                style={{ left: `${(minRating / 9) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-light-text-secondary dark:text-dark-text-secondary">Any Rating</span>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span className="font-medium">
                  {minRating === 0 ? 'Any' : `${minRating}+`}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
);

export default SearchFilters;