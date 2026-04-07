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

export default function ClubsCalendar() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDateRange, setCurrentDateRange] = useState({ start: null, end: null });
  const [selectedClub, setSelectedClub] = useState('park-slope');
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

  // Club labels to filter by
  const clubLabels = {
    'all': ['Club - Park Slope', 'Club - Park Slope Support'],
    'park-slope': ['Club - Park Slope', 'Club - Park Slope Support'],
  };


  // Cache for fetched events by date range
  const eventsCacheRef = useRef(new Map());
  
  // Fetch lessons based on current filters and date range
  const fetchLessons = useCallback(async (startDate, endDate, currentFilters, clubFilter) => {
    const fetchStartTime = performance.now();
    
    // Check if we already fetched this exact combination
    const filtersKey = JSON.stringify({ ...currentFilters, clubFilter });
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
      // Use optimized calendar endpoint with club label filtering
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        labels: JSON.stringify(clubLabels[clubFilter] || clubLabels.all)
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
      fetchLessons(start, end, filters, selectedClub);
    }, 200);
  }, [filters, selectedClub, fetchLessons]);

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
    }, selectedClub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch lessons when filters or club selection change
  useEffect(() => {
    if (!currentDateRange.start || !currentDateRange.end) {
      return;
    }
    
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLessons(currentDateRange.start, currentDateRange.end, filters, selectedClub);
    }, 500);
    
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [filters, selectedClub, currentDateRange, fetchLessons]);

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
  const [locations] = useState(['Online', 'Home', 'School', 'Club']);
  
  // Cache for search results
  const searchCache = useRef({});
  
  // Lazy search functions
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
      invoiceStatus: '',
      colourBy: 'job',
    });
  };

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="flex gap-6">
            {/* Main Content Area */}
            <div className="flex-1 space-y-6 min-w-0">
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium">
                  <PlusIcon className="h-5 w-5" />
                  Add New Lesson
                </button>
                <Link
                  to="/clubs/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors duration-200 font-medium"
                >
                  <ChartBarIcon className="h-5 w-5" />
                  Dashboard
                </Link>
                <Link
                  to="/lessons"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors duration-200 font-medium"
                >
                  <ListBulletIcon className="h-5 w-5" />
                  View in list
                </Link>
              </div>

              {/* Club Filter */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Filter by Club
                </label>
                <select
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                >
                  <option value="park-slope">Park Slope Club</option>
                </select>
              </div>

              {/* Calendar Container */}
              <div className="bg-white rounded-xl shadow-lg overflow-hidden relative">
                {/* Custom Calendar Styling */}
                <style>{`
                  .fc {
                    font-family: 'Poppins', sans-serif;
                  }
                  
                  .fc-header-toolbar {
                    padding: 1.5rem;
                    margin-bottom: 0;
                    background: linear-gradient(to right, #6A469D, #2D2F8E);
                    border-radius: 0.75rem 0.75rem 0 0;
                  }
                  
                  .fc-toolbar-title {
                    color: white;
                    font-weight: 700;
                    font-size: 1.5rem;
                  }
                  
                  .fc-button {
                    background-color: rgba(255, 255, 255, 0.2) !important;
                    border: 1px solid rgba(255, 255, 255, 0.3) !important;
                    color: white !important;
                    padding: 0.5rem 1rem !important;
                    border-radius: 0.5rem !important;
                    font-weight: 500 !important;
                    transition: all 0.2s !important;
                  }
                  
                  .fc-button:hover {
                    background-color: rgba(255, 255, 255, 0.3) !important;
                    border-color: rgba(255, 255, 255, 0.5) !important;
                  }
                  
                  .fc-button-active {
                    background-color: white !important;
                    color: #6A469D !important;
                    font-weight: 600 !important;
                  }
                  
                  .fc-daygrid-day {
                    border-color: #e5e7eb !important;
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
                `}</style>
              
                {loading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                    <div className="text-neutral-500">Loading calendar events...</div>
                  </div>
                )}
              
                <FullCalendar
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth'
                  }}
                  initialView="dayGridMonth"
                  editable={false}
                  selectable={false}
                  selectMirror={false}
                  dayMaxEvents={3}
                  moreLinkClick="popover"
                  weekends={true}
                  events={events}
                  datesSet={handleDatesSet}
                  eventClick={handleEventClick}
                  eventContent={renderEventContent}
                  height="auto"
                  contentHeight="auto"
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
                />
              </div>
              
              {/* Note */}
              <div className="text-sm text-neutral-500 italic">
                Note: Completed or cancelled Lessons cannot be moved.
              </div>
            </div>

            {/* Filter Sidebar - Right Side */}
            <div className="hidden lg:block w-80 flex-shrink-0">
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sticky top-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-neutral-900">Filters</h3>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-brand-purple hover:text-brand-navy font-medium"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-6">
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

                  {/* Location Filter */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Location
                    </label>
                    <select
                      value={filters.location}
                      onChange={(e) => updateFilter('location', e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    >
                      <option value="">All Locations</option>
                      {locations.map((location) => (
                        <option key={`location-${location}`} value={location}>
                          {location}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <LessonDetailModal
            lesson={selectedLesson}
            isOpen={isModalOpen}
            onClose={handleCloseModal}
          />
      </BranchProvider>
    </RoleProvider>
  );
}









