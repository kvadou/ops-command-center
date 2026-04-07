/**
 * LinkPreview - OpenGraph link preview card
 */

import React from 'react';
import {
  GlobeAltIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const LinkPreview = ({ preview, className = '' }) => {
  if (!preview || !preview.url) return null;

  const {
    url,
    title,
    description,
    image,
    site_name
  } = preview;

  // Extract domain from URL
  const getDomain = (urlString) => {
    try {
      const url = new URL(urlString);
      return url.hostname.replace('www.', '');
    } catch {
      return urlString;
    }
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        block rounded-lg border border-neutral-200 overflow-hidden
        hover:border-neutral-300 hover:shadow-sm transition-all
        ${className}
      `}
    >
      {/* Image */}
      {image && (
        <div className="aspect-video bg-neutral-100 overflow-hidden">
          <img
            src={image}
            alt={title || 'Link preview'}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        {/* Site name */}
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
          <GlobeAltIcon className="h-3 w-3" />
          <span>{site_name || getDomain(url)}</span>
        </div>

        {/* Title */}
        {title && (
          <h4 className="font-medium text-neutral-900 text-sm line-clamp-2 group-hover:text-brand-purple">
            {title}
          </h4>
        )}

        {/* Description */}
        {description && (
          <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
            {description}
          </p>
        )}

        {/* URL */}
        <div className="flex items-center gap-1 mt-2 text-xs text-brand-purple">
          <span className="truncate">{getDomain(url)}</span>
          <ArrowTopRightOnSquareIcon className="h-3 w-3 flex-shrink-0" />
        </div>
      </div>
    </a>
  );
};

export default LinkPreview;

