import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import {
  CalendarIcon,
  FunnelIcon,
  XMarkIcon,
  CheckIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { safeRender } from '../utils/safeRender';
import LessonDetailModal from './LessonDetailModal';
import SearchableSelect from './SearchableSelect';
import CreateLessonModal from './CreateLessonModal';

export default function CalendarPage() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalDefaults, setCreateModalDefaults] = useState({ start: null, end: null });
  const [currentDateRange, setCurrentDateRange] = useState({ start: null, end: null });
  const fetchTimeoutRef = useRef(null);
  const lastFetchRef = useRef({ filters: {}, dateRange: null });
  
  // Filter states
  const [filters, setFilters] = useState({
    tutor: '',
    student: '',
    client: '',
    job: '',
    lessonStatus: '',
    location: '',
    entireCompanyView: false
  });

  // Location button state (replaces location dropdown) - null means no button selected
  const [selectedLocationButton, setSelectedLocationButton] = useState(null);

  // Sync location button state with filter state
  useEffect(() => {
    if (!filters.location || filters.location === '') {
      setSelectedLocationButton(null);
    } else if (filters.location === 'Home') {
      setSelectedLocationButton('home');
    } else if (filters.location === 'Online') {
      setSelectedLocationButton('online');
    } else if (filters.location === 'School') {
      setSelectedLocationButton('schools');
    } else if (filters.location === 'Club') {
      setSelectedLocationButton('clubs');
    }
  }, [filters.location]);


  // Cache for fetched events by date range
  const eventsCacheRef = useRef(new Map());
  
  // Debug mode - enable with localStorage.setItem('calendarDebug', 'true')
  const isDebugMode = typeof window !== 'undefined' && localStorage.getItem('calendarDebug') === 'true';
  
  const debugLog = (...args) => {
    if (isDebugMode) {
      console.log('[Calendar Debug]', ...args);
    }
  };
  
  // Fetch lessons based on current filters and date range
  const fetchLessons = useCallback(async (startDate, endDate, currentFilters) => {
    const fetchStartTime = performance.now();
    debugLog('Fetch started', { startDate, endDate, filters: currentFilters });
    
    // Check if we already fetched this exact combination
    const filtersKey = JSON.stringify(currentFilters);
    const dateRangeKey = `${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const cacheKey = `${filtersKey}_${dateRangeKey}`;
    
    // Check cache first
    if (eventsCacheRef.current.has(cacheKey)) {
      const cachedData = eventsCacheRef.current.get(cacheKey);
      debugLog('Using cached data', { cacheKey, count: cachedData.length });
      setLessons(cachedData);
      return;
    }
    
    if (
      lastFetchRef.current.filters === filtersKey &&
      lastFetchRef.current.dateRange === dateRangeKey
    ) {
      debugLog('Skipping duplicate fetch');
      return; // Skip duplicate fetch
    }
    
    setLoading(true);
    try {
      // Use optimized calendar endpoint
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString()
      });
      
      // Add filters
      if (currentFilters.tutor) params.append('tutor_id', currentFilters.tutor);
      if (currentFilters.student) params.append('student_id', currentFilters.student);
      if (currentFilters.client) params.append('client_id', currentFilters.client);
      if (currentFilters.job) params.append('service_id', currentFilters.job);
      if (currentFilters.lessonStatus) params.append('status', currentFilters.lessonStatus);
      if (currentFilters.location && currentFilters.location !== '') {
        params.append('location', currentFilters.location);
      }
      
      const url = `/api/entity-lists/calendar/events?${params.toString()}`;
      debugLog('Fetching from API', { url });
      
      const apiStartTime = performance.now();
      const response = await fetch(url);
      const apiTime = performance.now() - apiStartTime;
      
      debugLog('API response received', { 
        status: response.status, 
        apiTime: `${apiTime.toFixed(2)}ms` 
      });
      
      const data = await response.json();
      
      // Transform to calendar format
      const lessonsData = data.events || data.lessons || data.data || [];
      
      debugLog('Data processed', { 
        count: lessonsData.length,
        queryTime: data.queryTime ? `${data.queryTime}ms` : 'N/A',
        totalTime: `${(performance.now() - fetchStartTime).toFixed(2)}ms`
      });
      
      // Cache the results
      eventsCacheRef.current.set(cacheKey, lessonsData);
      
      // Limit cache size to prevent memory issues (keep last 10 date ranges)
      if (eventsCacheRef.current.size > 10) {
        const firstKey = eventsCacheRef.current.keys().next().value;
        eventsCacheRef.current.delete(firstKey);
        debugLog('Cache evicted', { evictedKey: firstKey });
      }
      
      setLessons(lessonsData);
      
      // Update last fetch ref
      lastFetchRef.current = {
        filters: filtersKey,
        dateRange: dateRangeKey
      };
    } catch (error) {
      console.error('Error fetching lessons:', error);
      debugLog('Fetch error', { error: error.message, stack: error.stack });
    } finally {
      setLoading(false);
      debugLog('Fetch completed', { 
        totalTime: `${(performance.now() - fetchStartTime).toFixed(2)}ms` 
      });
    }
  }, []);

  // Handle date range changes from FullCalendar
  const handleDatesSet = useCallback((dateInfo) => {
    // Optimize: Only fetch visible range + small buffer (1 week before/after)
    // Reduced buffer for faster loading
    const start = new Date(dateInfo.start);
    start.setDate(start.getDate() - 7); // 1 week buffer
    const end = new Date(dateInfo.end);
    end.setDate(end.getDate() + 7); // 1 week buffer
    
    setCurrentDateRange({ start, end });
    
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // Debounce the fetch (reduced from 300ms to 200ms for faster response)
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLessons(start, end, filters);
    }, 200);
  }, [filters, fetchLessons]);

  // Auto-load all events on mount so calendar is immediately useful
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    // Auto-select "All" so calendar loads events immediately
    setSelectedLocationButton('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch lessons when filters change (debounced)
  // Require at least one filter to be selected - prevents loading ALL events with no filters
  useEffect(() => {
    if (!currentDateRange.start || !currentDateRange.end) {
      return; // Wait for initial date range
    }

    // Check if ANY filter is selected (prevents loading all events with no filtering)
    // Location button counts as a filter if a button is selected (including "all")
    const hasAnyFilter = filters.job || filters.tutor || filters.student ||
                        filters.client || filters.lessonStatus || 
                        selectedLocationButton !== null;

    if (!hasAnyFilter) {
      // Keep calendar blank if no filters selected
      setLessons([]);
      setLoading(false);
      return;
    }

    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Debounce filter changes
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLessons(currentDateRange.start, currentDateRange.end, filters);
    }, 500);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [filters, currentDateRange, fetchLessons, selectedLocationButton]);

  // Transform lessons into FullCalendar events
  const events = useMemo(() => {
    if (!lessons || !Array.isArray(lessons)) return [];

    return lessons.map((lesson) => {
      const startDate = new Date(lesson.start);
      const endDate = new Date(lesson.finish);

      // Use service label color if available, otherwise fall back to status-based colors
      let backgroundColor = '#6A469D'; // Default brand purple
      let borderColor = '#6A469D';

      if (lesson.label_color) {
        // Use the label color from the service
        backgroundColor = lesson.label_color;
        borderColor = lesson.label_color;
      } else {
        // Fallback to status-based colors
        if (lesson.status === 'complete' || lesson.status === 'completed') {
          backgroundColor = '#34B256'; // Brand green
          borderColor = '#34B256';
        } else if (lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable') {
          backgroundColor = '#DA2E72'; // Brand pink (for cancelled)
          borderColor = '#DA2E72';
        } else if (lesson.status === 'planned') {
          backgroundColor = '#F79A30'; // Brand orange
          borderColor = '#F79A30';
        }
      }

      // Build title with service name
      const serviceName = safeRender(lesson.service_name) || `Service ${lesson.service_id}`;
      const topic = safeRender(lesson.topic);
      const title = topic ? `${serviceName} - ${topic}` : serviceName;

      return {
        id: `lesson-${lesson.appointment_id}`,
        title: title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        textColor: '#ffffff',
        extendedProps: {
          lesson: lesson,
          lessonId: lesson.appointment_id,
          serviceId: lesson.service_id,
          serviceName: serviceName,
          topic: topic,
          status: lesson.status,
          labelColor: lesson.label_color
        }
      };
    });
  }, [lessons]);

  const handleEventClick = (clickInfo) => {
    const lesson = clickInfo.event.extendedProps.lesson;
    if (lesson) {
      setSelectedLesson(lesson);
      setIsModalOpen(true);
    }
  };

  // Handle clicking/dragging a time slot to create a lesson
  const handleSelect = (selectInfo) => {
    setCreateModalDefaults({
      start: selectInfo.start,
      end: selectInfo.end,
    });
    setIsCreateModalOpen(true);
    selectInfo.view.calendar.unselect();
  };

  // Handle clicking an empty day cell in month view
  const handleDateClick = (dateClickInfo) => {
    if (dateClickInfo.view.type === 'dayGridMonth') {
      const start = new Date(dateClickInfo.date);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start);
      end.setHours(10, 0, 0, 0);
      setCreateModalDefaults({ start, end });
      setIsCreateModalOpen(true);
    }
  };

  const renderEventContent = (eventInfo) => {
    const { serviceName, topic } = eventInfo.event.extendedProps;
    const timeText = eventInfo.timeText;
    
    return (
      <div className="fc-event-main-frame fc-event-main">
        <div className="fc-event-time fc-event-time-container">
          <span className="fc-event-time-text font-semibold">{timeText}</span>
        </div>
        <div className="fc-event-title-container">
          <div className="fc-event-title fc-sticky text-sm font-medium">
            {serviceName}
          </div>
        </div>
      </div>
    );
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLesson(null);
  };

  // Cache for search results
  const searchCache = useRef({});
  
  // Lazy search functions for each filter type
  const searchTutors = useCallback(async (query) => {
    const cacheKey = `tutors_${query}`;
    if (searchCache.current[cacheKey]) {
      return searchCache.current[cacheKey];
    }
    
    try {
      const response = await fetch(`/api/contractors/search/autocomplete?q=${encodeURIComponent(query)}&limit=20`);
      if (response.ok) {
        const tutors = await response.json();
        searchCache.current[cacheKey] = tutors;
        return tutors;
      }
    } catch (error) {
      console.warn('Error searching tutors:', error);
    }
    return [];
  }, []);
  
  const searchClients = useCallback(async (query) => {
    const cacheKey = `clients_${query}`;
    if (searchCache.current[cacheKey]) {
      return searchCache.current[cacheKey];
    }
    
    try {
      const response = await fetch(`/api/tutorcruncher-data/clients?search=${encodeURIComponent(query)}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        const clients = data.clients || data.results || [];
        searchCache.current[cacheKey] = clients;
        return clients;
      }
    } catch (error) {
      console.warn('Error searching clients:', error);
    }
    return [];
  }, []);
  
  const searchStudents = useCallback(async (query) => {
    const cacheKey = `students_${query}`;
    if (searchCache.current[cacheKey]) {
      return searchCache.current[cacheKey];
    }
    
    try {
      const response = await fetch(`/api/entity-lists/students?search=${encodeURIComponent(query)}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        const students = data.students || data.data || [];
        // Format students to have consistent structure
        const formatted = students.map(s => ({
          id: s.recipient_id,
          recipient_id: s.recipient_id,
          name: s.recipient_name,
          recipient_name: s.recipient_name
        }));
        searchCache.current[cacheKey] = formatted;
        return formatted;
      }
    } catch (error) {
      console.warn('Error searching students:', error);
    }
    return [];
  }, []);
  
  const searchJobs = useCallback(async (query) => {
    const cacheKey = `jobs_${query}`;
    if (searchCache.current[cacheKey]) {
      return searchCache.current[cacheKey];
    }
    
    try {
      const response = await fetch(`/api/entity-lists/jobs?search=${encodeURIComponent(query)}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        const jobs = data.data || data.jobs || [];
        // Format jobs to have consistent structure
        const formatted = jobs.map(j => ({
          id: j.service_id || j.id,
          serviceId: j.service_id || j.id,
          name: j.name || j.serviceName,
          serviceName: j.name || j.serviceName
        }));
        searchCache.current[cacheKey] = formatted;
        return formatted;
      }
    } catch (error) {
      console.warn('Error searching jobs:', error);
    }
    return [];
  }, []);

  const lessonStatusOptions = [
    { value: '', label: 'All' },
    { value: 'planned', label: 'Planned' },
    { value: 'complete', label: 'Complete' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'cancelled-chargeable', label: 'Cancelled (Chargeable)' }
  ];

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      tutor: '',
      student: '',
      client: '',
      job: '',
      lessonStatus: '',
      location: '',
      entireCompanyView: false
    });
    setSelectedLocationButton(null);
  };

  return (
    <div className="w-full px-2 sm:px-4 py-3">
          <div className="flex gap-3">
            {/* Main Content Area */}
            <div className="flex-1 space-y-3 min-w-0">
              {/* Location Filter Buttons */}
              <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedLocationButton('all');
                    updateFilter('location', '');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium ${
                    selectedLocationButton === 'all'
                      ? 'bg-brand-purple text-white hover:bg-brand-navy'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setSelectedLocationButton('home');
                    updateFilter('location', 'Home');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium ${
                    selectedLocationButton === 'home'
                      ? 'bg-brand-purple text-white hover:bg-brand-navy'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => {
                    setSelectedLocationButton('online');
                    updateFilter('location', 'Online');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium ${
                    selectedLocationButton === 'online'
                      ? 'bg-brand-purple text-white hover:bg-brand-navy'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Online
                </button>
                <button
                  onClick={() => {
                    setSelectedLocationButton('schools');
                    updateFilter('location', 'School');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium ${
                    selectedLocationButton === 'schools'
                      ? 'bg-brand-purple text-white hover:bg-brand-navy'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Schools
                </button>
                <button
                  onClick={() => {
                    setSelectedLocationButton('clubs');
                    updateFilter('location', 'Club');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 font-medium ${
                    selectedLocationButton === 'clubs'
                      ? 'bg-brand-purple text-white hover:bg-brand-navy'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  Clubs
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(prev => !prev)}
                  className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors font-medium text-sm ${
                    showFilters
                      ? 'bg-[#6A469D]/10 text-[#6A469D]'
                      : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  <FunnelIcon className="h-4 w-4" />
                  Filters
                </button>
                <button
                  onClick={() => {
                    setCreateModalDefaults({ start: null, end: null });
                    setIsCreateModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium text-sm"
                >
                  <PlusIcon className="h-5 w-5" />
                  Add Lesson
                </button>
              </div>
              </div>

              {/* Calendar Container */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden relative">
              {/* Custom Calendar Styling - Same as TutorCalendar */}
              <style>{`
                .fc {
                  font-family: 'Poppins', sans-serif;
                }
                
                .fc-header-toolbar {
                  padding: 0.75rem 1rem;
                  margin-bottom: 0;
                  background: white;
                  border-bottom: 1px solid #e5e7eb;
                }

                .fc-toolbar-title {
                  color: #171717;
                  font-weight: 700;
                  font-size: 1.125rem;
                }

                .fc-button {
                  background-color: white !important;
                  border: 1px solid #e5e7eb !important;
                  color: #525252 !important;
                  padding: 0.375rem 0.75rem !important;
                  border-radius: 0.5rem !important;
                  font-size: 0.8125rem !important;
                  font-weight: 500 !important;
                  transition: all 0.15s !important;
                  box-shadow: none !important;
                }

                .fc-button:hover {
                  background-color: #f5f5f5 !important;
                  border-color: #d4d4d4 !important;
                  color: #171717 !important;
                }

                .fc-button-active {
                  background-color: #6A469D !important;
                  border-color: #6A469D !important;
                  color: white !important;
                  font-weight: 600 !important;
                }

                .fc-button-active:hover {
                  background-color: #2D2F8E !important;
                  border-color: #2D2F8E !important;
                }
                
                .fc-daygrid-day {
                  border-color: #e5e7eb !important;
                }
                
                .fc-daygrid-day-top {
                  padding: 0.5rem;
                }
                
                .fc-daygrid-day-number {
                  font-weight: 600;
                  color: #374151;
                  padding: 0.5rem;
                }
                
                .fc-day-today {
                  background-color: #E8FBFF !important;
                }
                
                .fc-day-today .fc-daygrid-day-number {
                  color: #6A469D;
                  font-weight: 700;
                }
                
                .fc-col-header-cell {
                  background-color: #f9fafb;
                  border-color: #e5e7eb;
                  padding: 0.75rem;
                  font-weight: 600;
                  color: #374151;
                  text-transform: uppercase;
                  font-size: 0.75rem;
                  letter-spacing: 0.05em;
                }
                
                .fc-event {
                  border-radius: 0.5rem !important;
                  border: none !important;
                  padding: 0.25rem 0.5rem !important;
                  margin: 0.125rem 0 !important;
                  cursor: pointer;
                  transition: all 0.2s;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                }
                
                .fc-event:hover {
                  transform: translateY(-1px);
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
                  z-index: 10;
                }
                
                .fc-event-main-frame {
                  display: flex;
                  flex-direction: column;
                  gap: 0.25rem;
                }
                
                .fc-event-time {
                  font-weight: 700;
                  font-size: 0.75rem;
                  opacity: 0.95;
                  line-height: 1.2;
                }
                
                .fc-event-title {
                  font-size: 0.75rem;
                  line-height: 1.3;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }
                
                .fc-timegrid-slot {
                  border-color: #f3f4f6;
                }
                
                .fc-timegrid-now-indicator-line {
                  border-color: #6A469D;
                  border-width: 2px;
                }
                
                .fc-timegrid-now-indicator-arrow {
                  border-left-color: #6A469D;
                }
                
                .fc-list-event:hover td {
                  background-color: #f9fafb;
                }
                
                .fc-daygrid-event {
                  margin: 0.125rem 0.25rem;
                }
                
                .fc-daygrid-event-dot {
                  display: none;
                }
                
                .fc-daygrid-day-events {
                  margin-top: 0.25rem;
                }
                
                .fc-daygrid-event {
                  border-radius: 0.375rem;
                }
                
                .fc-timegrid-event {
                  border-radius: 0.5rem;
                  border: none;
                  padding: 0.5rem;
                }
                
                .fc-timegrid-event .fc-event-main {
                  padding: 0;
                }
                
                .fc-timegrid-event .fc-event-time {
                  font-weight: 700;
                  margin-bottom: 0.25rem;
                }
                
                .fc-timegrid-event .fc-event-title {
                  font-weight: 500;
                }
              `}</style>
              
              {/* Show calendar immediately, even while loading */}
              {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="text-neutral-500">Loading calendar events...</div>
                </div>
              )}

              {/* Empty state - prompt user to select a filter */}
              {!loading && !filters.job && !filters.tutor && !filters.student &&
               !filters.client && !filters.lessonStatus && selectedLocationButton === null && (
                <div className="absolute inset-0 bg-gradient-to-br from-purple-50/80 to-blue-50/80 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="text-center max-w-md px-6 py-8 bg-white rounded-lg shadow-lg border border-purple-100">
                    <CalendarIcon className="h-16 w-16 text-brand-purple mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                      Select a Location to Get Started
                    </h3>
                    <p className="text-sm text-neutral-600 mb-4">
                      To improve performance and load times, please click one of the location buttons above (All, Home, Online, Schools, or Clubs) to display events on the calendar.
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                      <FunnelIcon className="h-4 w-4" />
                      <span>You can also filter by tutor, student, client, job, or lesson status using the filters on the right</span>
                    </div>
                  </div>
                </div>
              )}

              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
                }}
                initialView="timeGridWeek"
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={3}
                moreLinkClick="popover"
                weekends={true}
                events={events}
                datesSet={handleDatesSet}
                eventClick={handleEventClick}
                select={handleSelect}
                dateClick={handleDateClick}
                eventContent={renderEventContent}
                height="calc(100vh - 200px)"
                eventDisplay="block"
                lazyFetching={true}
                eventTimeFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }}
                slotMinTime="06:00:00"
                slotMaxTime="22:00:00"
                allDaySlot={false}
                nowIndicator={true}
                slotLabelFormat={{
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                }}
                dayHeaderFormat={{
                  weekday: 'short'
                }}
                eventMouseEnter={(info) => {
                  info.el.style.cursor = 'pointer';
                  info.el.style.zIndex = '10';
                }}
                eventMouseLeave={(info) => {
                  info.el.style.zIndex = '1';
                }}
              />
              </div>
              
              {/* Note */}
              <div className="text-sm text-neutral-500 italic">
                Note: Completed or cancelled Lessons cannot be moved.
              </div>
            </div>

            {/* Filter Sidebar - Right Side (toggleable) */}
            {showFilters && (
            <div className="hidden md:block w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-neutral-900">Filters</h3>
                <button
                  onClick={clearFilters}
                  className="text-sm text-brand-purple hover:text-brand-navy font-medium"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-4">
                {/* Tutor Filter */}
                <SearchableSelect
                  label="Tutor"
                  placeholder="Search tutor..."
                  value={filters.tutor}
                  onChange={(value) => updateFilter('tutor', value)}
                  searchFunction={searchTutors}
                  getDisplayValue={(tutor) => tutor.name || `${tutor.first_name || ''} ${tutor.last_name || ''}`.trim()}
                  getItemValue={(tutor) => tutor.id || tutor.contractor_id}
                  emptyLabel="All Tutors"
                  emptyValue=""
                  minSearchLength={2}
                />

                {/* Student Filter */}
                <SearchableSelect
                  label="Student"
                  placeholder="Search student..."
                  value={filters.student}
                  onChange={(value) => updateFilter('student', value)}
                  searchFunction={searchStudents}
                  getDisplayValue={(student) => student.name || student.recipient_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Unknown'}
                  getItemValue={(student) => student.id || student.recipient_id}
                  emptyLabel="All Students"
                  emptyValue=""
                  minSearchLength={2}
                />

                {/* Client Filter */}
                <SearchableSelect
                  label="Client"
                  placeholder="Search client..."
                  value={filters.client}
                  onChange={(value) => updateFilter('client', value)}
                  searchFunction={searchClients}
                  getDisplayValue={(client) => client.name || `${client.first_name || ''} ${client.last_name || ''}`.trim()}
                  getItemValue={(client) => client.id}
                  emptyLabel="All Clients"
                  emptyValue=""
                  minSearchLength={2}
                />

                {/* Job Filter */}
                <SearchableSelect
                  label="Job"
                  placeholder="Search job..."
                  value={filters.job}
                  onChange={(value) => updateFilter('job', value)}
                  searchFunction={searchJobs}
                  getDisplayValue={(job) => job.name || job.serviceName || `Job ${job.serviceId || job.id}`}
                  getItemValue={(job) => job.serviceId || job.id}
                  emptyLabel="All Jobs"
                  emptyValue=""
                  minSearchLength={2}
                />

                {/* Lesson Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Lesson Status
                  </label>
                  <select
                    value={filters.lessonStatus}
                    onChange={(e) => updateFilter('lessonStatus', e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                  >
                    {lessonStatusOptions.map((option) => (
                      <option key={`status-${option.value || 'all'}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Entire Company View Checkbox */}
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.entireCompanyView}
                      onChange={(e) => updateFilter('entireCompanyView', e.target.checked)}
                      className="w-4 h-4 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple"
                    />
                    <span className="text-sm font-medium text-neutral-700">
                      Entire Company View
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-neutral-500">
                    View all Lessons for this Company, not just the ones on this Branch.
                  </p>
                </div>
              </div>
            </div>
          </div>
            )}
        </div>

        <LessonDetailModal
          lesson={selectedLesson}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
        {isCreateModalOpen && (
          <CreateLessonModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            defaultStart={createModalDefaults.start}
            defaultEnd={createModalDefaults.end}
            onLessonCreated={() => {
              eventsCacheRef.current.clear();
              if (currentDateRange.start && currentDateRange.end) {
                fetchLessons(currentDateRange.start, currentDateRange.end, filters);
              }
            }}
          />
        )}
    </div>
  );
}

