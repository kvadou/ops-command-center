/**
 * EventCreator - Create event announcements for posts
 */

import React, { useState } from 'react';
import {
  CalendarDaysIcon,
  MapPinIcon,
  LinkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

const EventCreator = ({ onSave, onCancel, initialData = null }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [startDate, setStartDate] = useState(
    initialData?.start_date 
      ? new Date(initialData.start_date).toISOString().slice(0, 16)
      : ''
  );
  const [endDate, setEndDate] = useState(
    initialData?.end_date 
      ? new Date(initialData.end_date).toISOString().slice(0, 16)
      : ''
  );
  const [location, setLocation] = useState(initialData?.location || '');
  const [link, setLink] = useState(initialData?.link || '');
  const [isAllDay, setIsAllDay] = useState(initialData?.is_all_day || false);

  const handleSave = () => {
    if (!title.trim() || !startDate) {
      return;
    }

    onSave({
      title: title.trim(),
      description: description.trim() || null,
      start_date: new Date(startDate).toISOString(),
      end_date: endDate ? new Date(endDate).toISOString() : null,
      location: location.trim() || null,
      link: link.trim() || null,
      is_all_day: isAllDay,
    });
  };

  const isValid = title.trim() && startDate;

  // Get minimum date (now)
  const minDate = new Date().toISOString().slice(0, 16);

  return (
    <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDaysIcon className="h-5 w-5 text-brand-purple" />
        <h3 className="font-semibold text-neutral-900">Create Event</h3>
      </div>

      {/* Title */}
      <div className="mb-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          maxLength={100}
        />
      </div>

      {/* Description */}
      <div className="mb-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Event description (optional)"
          rows={2}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm resize-none"
          maxLength={500}
        />
      </div>

      {/* Date/Time */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-neutral-600 mb-1">
            <ClockIcon className="h-3 w-3 inline mr-1" />
            Start
          </label>
          <input
            type={isAllDay ? "date" : "datetime-local"}
            value={isAllDay ? startDate.slice(0, 10) : startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={minDate.slice(0, isAllDay ? 10 : 16)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-600 mb-1">
            <ClockIcon className="h-3 w-3 inline mr-1" />
            End (optional)
          </label>
          <input
            type={isAllDay ? "date" : "datetime-local"}
            value={isAllDay ? endDate.slice(0, 10) : endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || minDate.slice(0, isAllDay ? 10 : 16)}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          />
        </div>
      </div>

      {/* All Day Toggle */}
      <div className="mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => setIsAllDay(e.target.checked)}
            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
          />
          <span className="text-sm text-neutral-700">All day event</span>
        </label>
      </div>

      {/* Location */}
      <div className="mb-3">
        <div className="relative">
          <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          />
        </div>
      </div>

      {/* Link */}
      <div className="mb-4">
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Event link (optional)"
            className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isValid}
          className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Event
        </button>
      </div>
    </div>
  );
};

export default EventCreator;

