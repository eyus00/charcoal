import React, { useState, useEffect } from 'react';
import { Loader2, FileIcon, Film, Calendar, Clock, Database } from 'lucide-react';

interface MovieFile {
  name: string;
  size: string;
  type: string;
  url: string;
}

function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<MovieFile[]>([]);
  const [movieInfo, setMovieInfo] = useState<{
    title: string;
    year: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    const fetchMovieData = async () => {
      try {
        setLoading(true);
        const corsProxy = 'https://api.allorigins.win/raw?url=';
        const targetUrl = 'https://a.datadiff.us.kg/movies/Anora%20%282024%29/';
        const response = await fetch(`${corsProxy}${encodeURIComponent(targetUrl)}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Parse the HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Extract movie title from the title element
        const pageTitle = doc.title || 'Sonic the Hedgehog 3 (2024)';
        const titleMatch = pageTitle.match(/\/movies\/(.+)/) || ['', 'Sonic the Hedgehog 3 (2024)'];
        const title = titleMatch[1];
        const year = title.match(/\((\d{4})\)/) ? title.match(/\((\d{4})\)/)?.[1] || '2024' : '2024';
        
        // Extract files information - look for tr elements that have the class "file"
        const fileRows = Array.from(doc.querySelectorAll('tr.file'));
        
        const extractedFiles: MovieFile[] = fileRows.map(row => {
          const nameElement = row.querySelector('.name a');
          const sizeElement = row.querySelector('size');
          
          if (nameElement) {
            const name = nameElement.textContent || '';
            const url = nameElement.getAttribute('href') || '';
            const size = sizeElement ? sizeElement.textContent || '' : '';
            const type = name.split('.').pop() || '';
            
            return {
              name,
              size,
              type,
              url: `https://a.datadiff.us.kg/movies/Sonic%20the%20Hedgehog%203%20(2024)/${url}`
            };
          }
          return {
            name: '',
            size: '',
            type: '',
            url: ''
          };
        }).filter(file => file.name && !file.name.includes('../'));
        
        setFiles(extractedFiles);
        setMovieInfo({
          title: title.replace(/\(\d{4}\)/, '').trim(),
          year,
          description: 'Sonic the Hedgehog 3 is an upcoming American action-adventure comedy film based on the video game franchise published by Sega.'
        });
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch movie data. Please check the console for more details.');
      } finally {
        setLoading(false);
      }
    };

    fetchMovieData();
  }, []);

  const formatFileSize = (size: string) => {
    // If size is a number, convert it to a readable format
    if (/^\d+$/.test(size)) {
      const num = parseInt(size, 10);
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let unitIndex = 0;
      let formattedSize = num;
      
      while (formattedSize >= 1024 && unitIndex < units.length - 1) {
        formattedSize /= 1024;
        unitIndex++;
      }
      
      return `${formattedSize.toFixed(2)} ${units[unitIndex]}`;
    }
    return size.trim();
  };

  const getFileTypeIcon = (type: string) => {
    switch(type.toLowerCase()) {
      case 'mp4':
      case 'mkv':
      case 'avi':
        return <Film className="w-5 h-5 text-blue-500" />;
      case 'srt':
      case 'txt':
        return <FileIcon className="w-5 h-5 text-gray-500" />;
      default:
        return <Database className="w-5 h-5 text-purple-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="mt-4 text-lg text-gray-700">Loading movie data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : (
          <>
            {/* Movie Info Header */}
            {movieInfo && (
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                  {movieInfo.title} 
                  <span className="ml-2 text-gray-500 flex items-center">
                    <Calendar className="w-5 h-5 mr-1" />
                    {movieInfo.year}
                  </span>
                </h1>
                <p className="text-gray-600 mt-2">{movieInfo.description}</p>
              </div>
            )}

            {/* Files List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="p-4 bg-blue-500 text-white">
                <h2 className="text-xl font-semibold">Files ({files.length})</h2>
              </div>
              
              {files.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No information available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          File Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Size
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {files.map((file, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              {getFileTypeIcon(file.type)}
                              <div className="ml-4">
                                <a 
                                  href={file.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-900"
                                >
                                  {file.name}
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatFileSize(file.size)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                            {file.type}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;