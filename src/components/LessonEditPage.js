import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import NotFound from './NotFound';
import Card from './ui/Card';
import { useToast } from '../hooks/useToast';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

export default function LessonEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [applyToRepeated, setApplyToRepeated] = useState(false);
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationsExpanded, setLocationsExpanded] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    start: '',
    finish: '',
    topic: '',
    location: null,
    location_id: null,
    extra_details: '',
  });

  useEffect(() => {
    fetchLessonData();
  }, [id]);

  const fetchLessonData = async () => {
    try {
      const res = await fetch(`/api/entity-details/lessons/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('not-found');
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch lesson details');
      }
      const lessonData = await res.json();
      setData(lessonData);
      
      const appointment = lessonData.appointment;
      if (appointment) {
        const startDate = appointment.start ? new Date(appointment.start) : new Date();
        const finishDate = appointment.finish ? new Date(appointment.finish) : new Date(startDate.getTime() + 60 * 60 * 1000);
        
        // Parse location if it's a string
        let locationData = appointment.location;
        if (locationData && typeof locationData === 'string') {
          try {
            locationData = JSON.parse(locationData);
          } catch (e) {
            locationData = { name: locationData };
          }
        }
        
        // If no location on lesson, fetch from job/service
        if (!locationData && appointment.service_id) {
          try {
            const jobRes = await fetch(`/api/entity-details/jobs/${appointment.service_id}`);
            if (jobRes.ok) {
              const jobData = await jobRes.json();
              if (jobData.service?.location) {
                locationData = typeof jobData.service.location === 'string'
                  ? JSON.parse(jobData.service.location)
                  : jobData.service.location;
              } else if (jobData.location) {
                locationData = typeof jobData.location === 'string'
                  ? JSON.parse(jobData.location)
                  : jobData.location;
              }
            }
          } catch (e) {
            console.error('Error fetching job location:', e);
          }
        }
        
        setFormData({
          start: startDate.toISOString().slice(0, 16),
          finish: finishDate.toISOString().slice(0, 16),
          topic: appointment.topic || '',
          location: locationData,
          location_id: appointment.location_id || null,
          extra_details: appointment.extra_details || appointment.notes || '',
        });
        
        // Set selected location for display
        if (locationData) {
          setSelectedLocation(locationData);
        }
        
        // Fetch available locations (mock data for now - would come from API)
        // In a real implementation, this would check availability for the time slot
        const locations = [
          { id: 1, name: 'UES Club', address: '1309 Madison Ave, New York, NY 10128', available: true },
          { id: 2, name: 'Park Slope Club', address: '254 7th Ave, Brooklyn NY, 11215', available: true },
          { id: 3, name: 'Online', address: '', available: true, isOnline: true },
          { id: 4, name: 'CPAD', address: '11 W 25th St, 2nd Floor, New York, NY 10010', available: true },
          { id: 5, name: 'The Hero Workshop (Culver City, LA)', address: '4445 Overland Ave, Culver City, 90230', available: true },
          { id: 6, name: 'Brooklyn Game Knight', address: '68 34th St Bldg 6 - 2nd Floor, Brooklyn, NY 11232', available: true },
          { id: 7, name: 'Mirman School', address: '16180 Mulholland Dr., Los Angeles, 90049, US', available: true },
          { id: 8, name: 'Gurney\'s Montauk Resort', address: '290 Old Montauk Hwy, Montauk, NY 11954', available: true },
        ];
        
        // Add the job location if it exists and isn't already in the list
        if (locationData) {
          const locationName = locationData.name || locationData.address || '';
          const locationAddress = locationData.address || locationData.street || '';
          const fullAddress = locationAddress ? 
            `${locationData.street || ''}, ${locationData.town || ''}, ${locationData.state || ''}, ${locationData.postcode || ''}, ${locationData.country || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',') :
            locationAddress;
          
          // Check if this location is already in the list
          const exists = locations.some(loc => 
            loc.name === locationName || 
            loc.address === fullAddress ||
            (locationName && loc.name.includes(locationName.split(' ')[0]))
          );
          
          if (!exists && locationName) {
            locations.push({
              id: 999,
              name: locationName,
              address: fullAddress || locationAddress,
              available: true,
              selected: true
            });
          }
        }
        
        setAvailableLocations(locations);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching lesson:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch(`/api/lessons/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          apply_to_repeated: applyToRepeated,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to update lesson');
      }

      navigate(`/lessons/${id}`);
    } catch (err) {
      console.error('Error updating lesson:', err);
      toast.error('Failed to update lesson. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <div className="text-neutral-500">Loading...</div>
        </div>
    );
  }

  if (error === 'not-found') {
    return (
        <NotFound entityType="Lesson" entityId={id} />
    );
  }

  if (error) {
    return (
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500">Error: {error}</div>
        </div>
    );
  }

  const appointment = data?.appointment;
  if (!appointment) {
    return (
        <NotFound entityType="Lesson" entityId={id} />
    );
  }

  const startDate = formData.start ? new Date(formData.start) : new Date();
  const finishDate = formData.finish ? new Date(formData.finish) : new Date();
  const durationHours = (finishDate - startDate) / (1000 * 60 * 60);

  return (
      <div className="w-full bg-brand-light">
        {/* Custom DatePicker Styles */}
        <style>{`
          .lesson-edit-datepicker .react-datepicker {
            font-family: 'Poppins', sans-serif;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
            background: white;
          }
          .lesson-edit-datepicker .react-datepicker__header {
            background: linear-gradient(to right, #6A469D, #5A3B85);
            border-bottom: none;
            border-radius: 12px 12px 0 0;
            padding-top: 12px;
          }
          .lesson-edit-datepicker .react-datepicker__current-month {
            color: white;
            font-weight: 600;
            font-size: 14px;
            padding-bottom: 8px;
          }
          .lesson-edit-datepicker .react-datepicker__day-name {
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
            font-size: 12px;
          }
          .lesson-edit-datepicker .react-datepicker__day {
            color: #374151;
            border-radius: 8px;
            margin: 2px;
            font-size: 13px;
          }
          .lesson-edit-datepicker .react-datepicker__day:hover {
            background-color: #E8E3F0;
            border-radius: 8px;
          }
          .lesson-edit-datepicker .react-datepicker__day--selected,
          .lesson-edit-datepicker .react-datepicker__day--keyboard-selected {
            background-color: #6A469D;
            color: white;
            font-weight: 600;
            border-radius: 8px;
          }
          .lesson-edit-datepicker .react-datepicker__day--today {
            font-weight: 600;
            color: #6A469D;
          }
          .lesson-edit-datepicker .react-datepicker__time-container {
            border-left: 1px solid #e5e7eb;
          }
          .lesson-edit-datepicker .react-datepicker__time-container .react-datepicker__time {
            background: white;
          }
          .lesson-edit-datepicker .react-datepicker__time-container .react-datepicker__time .react-datepicker__time-box {
            width: 100%;
          }
          .lesson-edit-datepicker .react-datepicker__time-list-item {
            font-size: 13px;
            padding: 8px 12px;
            color: #374151;
          }
          .lesson-edit-datepicker .react-datepicker__time-list-item:hover {
            background-color: #E8E3F0;
          }
          .lesson-edit-datepicker .react-datepicker__time-list-item--selected {
            background-color: #6A469D;
            color: white;
            font-weight: 600;
          }
          .lesson-edit-datepicker .react-datepicker__navigation {
            top: 12px;
          }
          .lesson-edit-datepicker .react-datepicker__navigation-icon::before {
            border-color: white;
          }
          .lesson-edit-datepicker .react-datepicker__navigation:hover *::before {
            border-color: rgba(255, 255, 255, 0.8);
          }
          .lesson-edit-datepicker .react-datepicker__input-container input {
            cursor: pointer;
          }
        `}</style>
        {/* Header */}
        <div className="bg-white border-b border-neutral-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-neutral-900">Edit Lesson</h1>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Date/Time Row */}
            <div className="grid grid-cols-3 gap-4">
              {/* Start time */}
              <div 
                className="bg-white rounded-xl p-6 shadow-sm border border-neutral-200 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200 cursor-pointer"
                onClick={() => document.getElementById('start-time-picker')?.focus()}
              >
                <label 
                  className="block text-sm font-medium text-neutral-700 mb-2 cursor-pointer"
                >
                  Start time *
                </label>
                  <div className="lesson-edit-datepicker">
                  <DatePicker
                    id="start-time-picker"
                    selected={formData.start ? new Date(formData.start) : null}
                    onChange={(date) => {
                      if (date) {
                        // Format date in local time, not UTC
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}T${hours}:${minutes}`;
                        setFormData({ ...formData, start: dateStr });
                        // Auto-update finish time to maintain duration
                        if (formData.finish) {
                          const newStart = date;
                          const currentFinish = new Date(formData.finish);
                          const duration = currentFinish - new Date(formData.start);
                          const newFinish = new Date(newStart.getTime() + duration);
                          const finishYear = newFinish.getFullYear();
                          const finishMonth = String(newFinish.getMonth() + 1).padStart(2, '0');
                          const finishDay = String(newFinish.getDate()).padStart(2, '0');
                          const finishHours = String(newFinish.getHours()).padStart(2, '0');
                          const finishMinutes = String(newFinish.getMinutes()).padStart(2, '0');
                          const finishStr = `${finishYear}-${finishMonth}-${finishDay}T${finishHours}:${finishMinutes}`;
                          setFormData(prev => ({
                            ...prev,
                            start: dateStr,
                            finish: finishStr
                          }));
                        }
                      }
                    }}
                    showTimeSelect
                    timeIntervals={15}
                    dateFormat="MM/dd/yyyy h:mm aa"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-neutral-200 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Duration
                </label>
                <div className="px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-md text-neutral-700">
                  {durationHours > 0 ? `${durationHours.toFixed(1)} hour${durationHours !== 1 ? 's' : ''}` : '0 hours'}
                </div>
              </div>

              {/* Finish time */}
              <div 
                className="bg-white rounded-xl p-6 shadow-sm border border-neutral-200 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200 cursor-pointer"
                onClick={() => document.getElementById('finish-time-picker')?.focus()}
              >
                <label 
                  className="block text-sm font-medium text-neutral-700 mb-2 cursor-pointer"
                >
                  Finish time *
                </label>
                  <div className="lesson-edit-datepicker">
                  <DatePicker
                    id="finish-time-picker"
                    selected={formData.finish ? new Date(formData.finish) : null}
                    onChange={(date) => {
                      if (date) {
                        // Format date in local time, not UTC
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}T${hours}:${minutes}`;
                        setFormData({ ...formData, finish: dateStr });
                      }
                    }}
                    showTimeSelect
                    timeIntervals={15}
                    dateFormat="MM/dd/yyyy h:mm aa"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple cursor-pointer"
                    required
                  />
                </div>
              </div>
            </div>

            <Card>
              <div className="space-y-6">

                {/* Topic */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Topic *
                  </label>
                  <input
                    type="text"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                  />
                  <p className="mt-1 text-sm text-neutral-500">Brief title for the Lesson</p>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Location
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedLocation ? (selectedLocation.name || selectedLocation.address || JSON.stringify(selectedLocation)) : ''}
                      readOnly
                      className="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-md text-neutral-700"
                      placeholder="No location selected"
                    />
                    {selectedLocation && (
                      <button
                        type="button"
                        className="px-3 py-2 text-neutral-500 hover:text-neutral-700"
                        onClick={() => {
                          setSelectedLocation(null);
                          setFormData({ ...formData, location: null, location_id: null });
                        }}
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  
                  {/* Location Availability & Locations List */}
                  <div className="mt-4">
                    {/* Location Availability Banner */}
                    {selectedLocation && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-md mb-3">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircleIcon className="h-5 w-5" />
                          <span className="font-medium">Location Availability {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {finishDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Available Locations List - Collapsible */}
                    {(!selectedLocation || locationsExpanded) && (
                      <>
                        {selectedLocation && (
                          <div className="mb-3 flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => setLocationsExpanded(false)}
                              className="px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                            >
                              Hide Locations
                            </button>
                          </div>
                        )}
                        
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {availableLocations.map((loc) => (
                            <div
                              key={loc.id}
                              className={`p-3 border rounded-md cursor-pointer transition-colors ${
                                selectedLocation && (selectedLocation.name === loc.name || selectedLocation.address === loc.address)
                                  ? 'border-brand-purple bg-brand-purple/5'
                                  : 'border-neutral-200 hover:border-brand-purple/50 hover:bg-neutral-50'
                              }`}
                              onClick={() => {
                                const locationData = {
                                  name: loc.name,
                                  address: loc.address,
                                  id: loc.id
                                };
                                setSelectedLocation(locationData);
                                setFormData({ ...formData, location: locationData, location_id: loc.id });
                                setLocationsExpanded(false); // Collapse after selection
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-neutral-900">
                                    {loc.name}
                                    {selectedLocation && (selectedLocation.name === loc.name || selectedLocation.address === loc.address) && (
                                      <span className="ml-2 text-sm text-brand-purple font-semibold">(selected)</span>
                                    )}
                                  </div>
                                  {loc.address && (
                                    <div className="text-sm text-neutral-600 mt-1">{loc.address}</div>
                                  )}
                                </div>
                                <div className="ml-4">
                                  {loc.available ? (
                                    <span className="inline-flex items-center text-green-700">
                                      <CheckCircleIcon className="h-5 w-5" />
                                      <span className="ml-1 text-sm">Available</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-neutral-500">
                                      <span className="text-sm">No conflicts for this Location</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    
                    {/* Show locations button when collapsed */}
                    {selectedLocation && !locationsExpanded && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setLocationsExpanded(true)}
                          className="text-sm text-brand-purple hover:text-brand-navy font-medium"
                        >
                          Show all available locations
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extra Details */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Extra Details
                  </label>
                  <textarea
                    value={formData.extra_details}
                    onChange={(e) => setFormData({ ...formData, extra_details: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    placeholder="Add any additional notes or details about this lesson..."
                  />
                </div>

                {/* Apply to repeated lessons - Always show */}
                <div className="pt-4 border-t border-neutral-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToRepeated}
                      onChange={(e) => setApplyToRepeated(e.target.checked)}
                      className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple cursor-pointer"
                    />
                    <span className="text-sm text-neutral-700">
                      Apply changes to future lessons
                    </span>
                  </label>
                  <p className="mt-1 text-sm text-neutral-500">
                    Apply the same changes to all future lessons for this job/service.{' '}
                    {(appointment.repeat_pattern || appointment.source_apt || data?.isRepeating) && (
                      <span className="text-brand-purple">This lesson is part of a repeating series.</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3">
              <Link
                to={`/lessons/${id}`}
                className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors disabled:opacity-50"
              >
                {saving ? 'Updating...' : 'Update Lesson'}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}









