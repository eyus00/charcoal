import React from 'react';
import { useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useMedia } from '../api/hooks/useMedia';
import { getImageUrl } from '../api/config';
import { MediaType } from '../api/types';

interface MediaDetailsProps {
  type: MediaType;
}

const MediaDetails: React.FC<MediaDetailsProps> = ({ type }) => {
  const { id } = useParams();
  
  const { data: details } = useMedia.useDetails(type, Number(id));

  if (!details) return <div>Loading...</div>;

  const title = type === 'movie' ? details.title : details.name;
  const releaseDate = type === 'movie' ? details.release_date : details.first_air_date;
  const year = new Date(releaseDate).getFullYear();

  return (
    <div>
      <div className="relative aspect-[21/9] mb-8">
        <img
          src={getImageUrl(details.backdrop_path)}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="flex items-start gap-6">
            <img
              src={getImageUrl(details.poster_path, 'w342')}
              alt={title}
              className="w-48 border"
            />
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-white mb-2">
                {title} <span className="text-gray-300">({year})</span>
              </h1>
              <div className="flex items-center mb-4">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                <span className="text-white ml-1 text-lg">
                  {details.vote_average.toFixed(1)}
                </span>
                <span className="text-gray-300 ml-2">
                  ({details.vote_count.toLocaleString()} votes)
                </span>
              </div>
              <p className="text-gray-200 text-lg leading-relaxed">
                {details.overview}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-8">
          <h2 className="text-2xl font-bold mb-4">About {title}</h2>
          <div className="prose max-w-none">
            <p>{details.overview}</p>
          </div>
        </div>
        <div className="col-span-4">
          <h3 className="text-lg font-semibold mb-4">Details</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-gray-600">Status</dt>
              <dd className="font-medium">{details.status}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Original Language</dt>
              <dd className="font-medium">{details.original_language.toUpperCase()}</dd>
            </div>
            {type === 'movie' ? (
              <>
                <div>
                  <dt className="text-gray-600">Budget</dt>
                  <dd className="font-medium">
                    ${details.budget.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-600">Revenue</dt>
                  <dd className="font-medium">
                    ${details.revenue.toLocaleString()}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-gray-600">Number of Seasons</dt>
                  <dd className="font-medium">{details.number_of_seasons}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Number of Episodes</dt>
                  <dd className="font-medium">{details.number_of_episodes}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};

export default MediaDetails;