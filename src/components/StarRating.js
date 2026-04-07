import React from 'react';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';

/**
 * StarRating component - displays a star rating (1-5 stars)
 * @param {number} rating - The rating value (0-5)
 * @param {number} maxRating - Maximum rating (default: 5)
 * @param {string} size - Size of stars: 'sm', 'md', 'lg' (default: 'md')
 * @param {boolean} showValue - Whether to show the numeric value next to stars
 */
export default function StarRating({ 
  rating = 0, 
  maxRating = 5, 
  size = 'md',
  showValue = false 
}) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  const starSize = sizeClasses[size] || sizeClasses.md;
  const normalizedRating = Math.min(Math.max(0, rating), maxRating);
  const fullStars = Math.floor(normalizedRating);
  const hasHalfStar = normalizedRating % 1 >= 0.5;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxRating }).map((_, index) => {
        if (index < fullStars) {
          return (
            <StarIcon
              key={index}
              className={`${starSize} text-yellow-400`}
            />
          );
        } else if (index === fullStars && hasHalfStar) {
          return (
            <div key={index} className="relative">
              <StarOutlineIcon className={`${starSize} text-yellow-400`} />
              <StarIcon
                className={`${starSize} text-yellow-400 absolute inset-0`}
                style={{ clipPath: 'inset(0 50% 0 0)' }}
              />
            </div>
          );
        } else {
          return (
            <StarOutlineIcon
              key={index}
              className={`${starSize} text-neutral-300`}
            />
          );
        }
      })}
      {showValue && (
        <span className="ml-1 text-sm text-neutral-600 font-medium">
          {normalizedRating > 0 ? normalizedRating.toFixed(1) : 'No rating'}
        </span>
      )}
    </div>
  );
}

