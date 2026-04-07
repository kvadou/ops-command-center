/**
 * EventCard - Event announcement display component
 */

import React from 'react';
import {
  CalendarDaysIcon,
  ClockIcon,
  MapPinIcon,
  LinkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const EventCard = ({ eventData }) => {
  if (!eventData) return null;

  const {
    title,
    description,
    start_date,
    end_date,
    location,
    link,
    is_all_day
  } = eventData;

  const startDate = start_date ? new Date(start_date) : null;
  const endDate = end_date ? new Date(end_date) : null;

  // Format date
  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
  };

  // Format time
  const formatTime = (date) => {
    if (!date || is_all_day) return '';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Check if event is happening soon (within 24 hours)
  const isHappeningSoon = startDate && 
    (startDate.getTime() - Date.now()) <= 24 * 60 * 60 * 1000 &&
    startDate.getTime() > Date.now();

  // Check if event has passed
  const isPast = startDate && startDate < new Date();

  // Generate calendar link (Google Calendar)
  const generateCalendarLink = () => {
    if (!startDate) return null;
    
    const formatGoogleDate = (date) => {
      return date.toISOString().replace(/-|:|\.\d+/g, '');
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate || new Date(startDate.getTime() + 60 * 60 * 1000))}`,
      details: description || '',
      location: location || '',
    });

    return `https://calendar.google.com/calendar/render?${params}`;
  };

  return (
    <div className={`
      rounded-lg border overflow-hidden
      ${isPast ? 'bg-neutral-50 border-neutral-200' : 'bg-gradient-to-r from-brand-purple/5 to-brand-light/20 border-brand-purple/20'}
    `}>
      {/* Header with icon */}
      <div className={`
        flex items-center gap-2 px-4 py-2 border-b
        ${isPast ? 'bg-neutral-100 border-neutral-200' : 'bg-brand-purple/10 border-brand-purple/20'}
      `}>
        <CalendarDaysIcon className={`h-5 w-5 ${isPast ? 'text-neutral-500' : 'text-brand-purple'}`} />
        <span className={`text-sm font-medium ${isPast ? 'text-neutral-600' : 'text-brand-purple'}`}>
          {isPast ? 'Past Event' : isHappeningSoon ? '🔥 Happening Soon!' : 'Event'}
        </span>
      </div>

      <div className="p-4">
        {/* Title */}
        <h4 className={`font-semibold ${isPast ? 'text-neutral-600' : 'text-neutral-900'}`}>
          {title}
        </h4>

        {/* Description */}
        {description && (
          <p className="text-sm text-neutral-600 mt-1 line-clamp-2">
            {description}
          </p>
        )}

        {/* Date/Time */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1.5 text-neutral-700">
            <CalendarDaysIcon className="h-4 w-4 text-neutral-400" />
            <span>{formatDate(startDate)}</span>
            {endDate && formatDate(endDate) !== formatDate(startDate) && (
              <span>- {formatDate(endDate)}</span>
            )}
          </div>

          {!is_all_day && startDate && (
            <div className="flex items-center gap-1.5 text-neutral-700">
              <ClockIcon className="h-4 w-4 text-neutral-400" />
              <span>{formatTime(startDate)}</span>
              {endDate && (
                <span>- {formatTime(endDate)}</span>
              )}
            </div>
          )}

          {is_all_day && (
            <span className="text-neutral-500 text-xs">All day</span>
          )}
        </div>

        {/* Location */}
        {location && (
          <div className="flex items-center gap-1.5 mt-2 text-sm text-neutral-600">
            <MapPinIcon className="h-4 w-4 text-neutral-400" />
            <span>{location}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-4">
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-purple/10 rounded-lg transition-colors"
            >
              <LinkIcon className="h-4 w-4" />
              Event Link
              <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          )}

          {!isPast && startDate && (
            <a
              href={generateCalendarLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              <CalendarDaysIcon className="h-4 w-4" />
              Add to Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default EventCard;

