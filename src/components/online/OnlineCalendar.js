import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import {
  PlusIcon,
  CalendarIcon,
  UserGroupIcon,
  ListBulletIcon,
  XMarkIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { safeRender } from '../../utils/safeRender';
import LessonDetailModal from '../LessonDetailModal';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import SearchableSelect from '../SearchableSelect';

export default function OnlineCalendar() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    invoiceStatus: '',
    colourBy: 'job',
  });

  // Cache for fetched events by date range
  const eventsCacheRef = useRef(new Map());
  
  // Fetch lessons based on current filters and date range - filter by Online label
  const fetchLessons = useCallback(async (startDate, endDate, currentFilters) => {
    const fetchStartTime = performance.now();
    
    // Check if we already fetched this exact combination
    const filtersKey = JSON.stringify(currentFilters);
    const dateRangeKey = `${startDate?.toISOString()}_${endDate?.toISOString()}`;
    const cacheKey = `${filtersKey}_${dateRangeKey}`;
    
    // Check cache first
    if (eventsCacheRef.current.has(cacheKey)) {
      const cachedData = eventsCacheRef.current.get(cacheKey);
      setLessons(cachedData);
      return;
    }
    
    if (
      lastFetchRef.current.filters === filtersKey &&
      lastFetchRef.current.dateRange === dateRangeKey
    ) {
      return; // Skip duplicate fetch
    }
    
    setLoading(true);
    try {
      // Use optimized calendar endpoint with Online label filtering
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        labels: JSON.stringify(['Online'])
      });
      
      // Add filters
      if (currentFilters.tutor) params.append('tutor_id', currentFilters.tutor);
      if (currentFilters.student) params.append('student_id', currentFilters.student);
      if (currentFilters.client) params.append('client_id', currentFilters.client);
      if (currentFilters.job) params.append('service_id', currentFilters.job);
      if (currentFilters.lessonStatus) params.append('status', currentFilters.lessonStatus);
      if (currentFilters.location) params.append('location', currentFilters.location);
      
      const url = `/api/entity-lists/calendar/events?${params.toString()}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      // Transform to calendar format
      const lessonsData = data.events || data.lessons || data.data || [];
      
      // Cache the results
      eventsCacheRef.current.set(cacheKey, lessonsData);
      
      // Limit cache size to prevent memory issues
      if (eventsCacheRef.current.size > 10) {
        const firstKey = eventsCacheRef.current.keys().next().value;
        eventsCacheRef.current.delete(firstKey);
      }
      
      setLessons(lessonsData);
      
      // Update last fetch ref
      lastFetchRef.current = {
        filters: filtersKey,
        dateRange: dateRangeKey
      };
    } catch (error) {
      console.error('Error fetching lessons:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle date range changes from FullCalendar
  const handleDatesSet = useCallback((dateInfo) => {
    const start = new Date(dateInfo.start);
    start.setDate(start.getDate() - 7); // 1 week buffer
    const end = new Date(dateInfo.end);
    end.setDate(end.getDate() + 7); // 1 week buffer
    
    setCurrentDateRange({ start, end });
    
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // Debounce the fetch
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLessons(start, end, filters);
    }, 200);
  }, [filters, fetchLessons]);

  // Initial fetch
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setCurrentDateRange({ start, end });
    fetchLessons(start, end, {
      tutor: '',
      student: '',
      client: '',
      job: '',
      lessonStatus: '',
      location: '',
      invoiceStatus: '',
      colourBy: 'job',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch lessons when filters change
  useEffect(() => {
    if (!currentDateRange.start || !currentDateRange.end) {
      return;
    }
    
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLessons(currentDateRange.start, currentDateRange.end, filters);
    }, 500);
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [filters, currentDateRange, fetchLessons]);

  // Transform lessons into FullCalendar events
  const events = useMemo(() => {
    if (!lessons || !Array.isArray(lessons)) return [];
    
    return lessons.map((lesson) => {
      const startDate = new Date(lesson.start);
      const endDate = new Date(lesson.finish);
      
      // Determine event color based on status
      let backgroundColor = '#6A469D'; // Brand purple
      let borderColor = '#6A469D';
      
      if (lesson.status === 'complete' || lesson.status === 'completed') {
        backgroundColor = '#34B256'; // Brand green
        borderColor = '#34B256';
      } else if (lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable') {
        backgroundColor = '#DA2E72'; // Brand pink
        borderColor = '#DA2E72';
      } else if (lesson.status === 'planned') {
        backgroundColor = '#F79A30'; // Brand orange
        borderColor = '#F79A30';
      }
      
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
          status: lesson.status
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

  // Filter options
  const [locations] = useState(['Online']);
  
  // Cache for search results
  const searchCache = useRef({});
  
  // Fetch search options
  const fetchSearchOptions = async (type, query) => {
    const cacheKey = `${type}_${query}`;
    if (searchCache.current[cacheKey]) {
      return searchCache.current[cacheKey];
    }
    
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/search/${type}?${params}`);
      const data = await response.json();
      const results = data.results || data.data || [];
      searchCache.current[cacheKey] = results;
      return results;
    } catch (error) {
      console.error(`Error fetching ${type}:`, error);
      return [];
    }
  };

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Online Calendar</h1>
                <p className="text-sm text-neutral-600 mt-1">
                  View and manage all online lessons
                </p>
              </div>
              <Link
                to="/online/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
              >
                <ChartBarIcon className="h-5 w-5" />
                View Dashboard
              </Link>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SearchableSelect
                  label="Tutor"
                  value={filters.tutor}
                  onChange={(value) => setFilters({ ...filters, tutor: value })}
                  fetchOptions={(query) => fetchSearchOptions('tutors', query)}
                  getOptionLabel={(option) => `${option.first_name || ''} ${option.last_name || ''}`.trim() || option.name || 'Unknown'}
                  getOptionValue={(option) => option.id || option.contractor_id}
                />
                <SearchableSelect
                  label="Student"
                  value={filters.student}
                  onChange={(value) => setFilters({ ...filters, student: value })}
                  fetchOptions={(query) => fetchSearchOptions('students', query)}
                  getOptionLabel={(option) => `${option.first_name || ''} ${option.last_name || ''}`.trim() || option.name || 'Unknown'}
                  getOptionValue={(option) => option.id || option.recipient_id}
                />
                <SearchableSelect
                  label="Client"
                  value={filters.client}
                  onChange={(value) => setFilters({ ...filters, client: value })}
                  fetchOptions={(query) => fetchSearchOptions('clients', query)}
                  getOptionLabel={(option) => `${option.first_name || ''} ${option.last_name || ''}`.trim() || option.name || 'Unknown'}
                  getOptionValue={(option) => option.id || option.client_id}
                />
                <SearchableSelect
                  label="Job/Service"
                  value={filters.job}
                  onChange={(value) => setFilters({ ...filters, job: value })}
                  fetchOptions={(query) => fetchSearchOptions('services', query)}
                  getOptionLabel={(option) => option.name || `Service ${option.service_id || option.id}`}
                  getOptionValue={(option) => option.service_id || option.id}
                />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Lesson Status
                  </label>
                  <select
                    value={filters.lessonStatus}
                    onChange={(e) => setFilters({ ...filters, lessonStatus: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                  >
                    <option value="">All Statuses</option>
                    <option value="planned">Planned</option>
                    <option value="complete">Complete</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="cancelled-chargeable">Cancelled (Chargeable)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Calendar */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              {loading && lessons.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-neutral-500">Loading calendar...</div>
                </div>
              ) : (
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                  initialView="timeGridWeek"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
                  }}
                  events={events}
                  eventClick={handleEventClick}
                  eventContent={renderEventContent}
                  datesSet={handleDatesSet}
                  height="auto"
                  slotMinTime="06:00:00"
                  slotMaxTime="22:00:00"
                  weekends={true}
                  editable={false}
                  selectable={false}
                  dayMaxEvents={true}
                  eventDisplay="block"
                />
              )}
            </div>

            {/* Lesson Detail Modal */}
            {isModalOpen && selectedLesson && (
              <LessonDetailModal
                lesson={selectedLesson}
                onClose={handleCloseModal}
              />
            )}
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}









