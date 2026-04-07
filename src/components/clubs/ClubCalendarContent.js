import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import {
  PlusIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { safeRender } from '../../utils/safeRender';
import LessonDetailModal from '../LessonDetailModal';

export default function ClubCalendarContent() {
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

  // Visibility toggles for calendar legend
  const [visibility, setVisibility] = useState({
    lessons: true,
    support: true,
    cancelled: true,
  });

  // Club labels for Park Slope
  const clubLabels = ['Club - Park Slope', 'Club - Park Slope Support'];

  // Cache for fetched events by date range
  const eventsCacheRef = useRef(new Map());

  // Fetch lessons based on current filters and date range
  const fetchLessons = useCallback(async (startDate, endDate, currentFilters) => {
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
      // Use optimized calendar endpoint with club label filtering
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        labels: JSON.stringify(clubLabels)
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

    return lessons
      .filter((lesson) => {
        // Determine if this is a support session
        const labels = lesson.service_labels || [];
        const isSupport = Array.isArray(labels)
          ? labels.some(l => typeof l === 'string' && l.includes('Support'))
          : typeof labels === 'string' && labels.includes('Support');

        // Determine if cancelled
        const isCancelled = lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable';

        // Apply visibility filters
        if (isCancelled && !visibility.cancelled) return false;
        if (isSupport && !visibility.support) return false;
        if (!isSupport && !isCancelled && !visibility.lessons) return false;

        return true;
      })
      .map((lesson) => {
      const startDate = new Date(lesson.start);
      const endDate = new Date(lesson.finish);

      // Determine event color based on label (support vs lesson), with status override
      let backgroundColor;
      let borderColor;
      let textColor = '#ffffff';

      // Cancelled lessons always show in yellow
      const isCancelled = lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable';
      if (isCancelled) {
        backgroundColor = '#FACC29'; // Brand yellow for cancelled
        borderColor = '#FACC29';
        textColor = '#1f2937'; // Dark text for readability on yellow
      } else {
        // Color by label: Support work (pink) vs Teaching lessons (blue)
        const labels = lesson.service_labels || [];
        const isSupport = Array.isArray(labels)
          ? labels.some(l => typeof l === 'string' && l.includes('Support'))
          : typeof labels === 'string' && labels.includes('Support');
        backgroundColor = isSupport ? '#ff1493' : '#1e90ff';
        borderColor = backgroundColor;
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
        textColor: textColor,
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
  }, [lessons, visibility]);

  const handleEventClick = (clickInfo) => {
    const lesson = clickInfo.event.extendedProps.lesson;
    if (lesson) {
      setSelectedLesson(lesson);
      setIsModalOpen(true);
    }
  };

  const renderEventContent = (eventInfo) => {
    const { serviceName } = eventInfo.event.extendedProps;
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

  return (
    <>
      <div className="space-y-6">
        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium">
            <PlusIcon className="h-5 w-5" />
            Add New Lesson
          </button>
          <Link
            to="/lessons"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors duration-200 font-medium"
          >
            <ListBulletIcon className="h-5 w-5" />
            View in list
          </Link>
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

          {/* Calendar Legend - Clickable Toggles */}
          <div className="flex items-center gap-4 mt-2 mb-4 px-2">
            <button
              onClick={() => setVisibility(v => ({ ...v, lessons: !v.lessons }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                visibility.lessons
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-neutral-300 bg-neutral-100 opacity-50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded ${visibility.lessons ? 'bg-blue-500' : 'bg-neutral-400'}`}
              />
              <span className={`text-sm font-medium ${visibility.lessons ? 'text-neutral-700' : 'text-neutral-400'}`}>
                Lessons
              </span>
            </button>
            <button
              onClick={() => setVisibility(v => ({ ...v, support: !v.support }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                visibility.support
                  ? 'border-pink-500 bg-pink-50'
                  : 'border-neutral-300 bg-neutral-100 opacity-50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded ${visibility.support ? 'bg-pink-500' : 'bg-neutral-400'}`}
              />
              <span className={`text-sm font-medium ${visibility.support ? 'text-neutral-700' : 'text-neutral-400'}`}>
                Support
              </span>
            </button>
            <button
              onClick={() => setVisibility(v => ({ ...v, cancelled: !v.cancelled }))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                visibility.cancelled
                  ? 'border-yellow-500 bg-yellow-50'
                  : 'border-neutral-300 bg-neutral-100 opacity-50'
              }`}
            >
              <div
                className={`w-4 h-4 rounded ${visibility.cancelled ? 'bg-brand-yellow' : 'bg-neutral-400'}`}
              />
              <span className={`text-sm font-medium ${visibility.cancelled ? 'text-neutral-700' : 'text-neutral-400'}`}>
                Cancelled
              </span>
            </button>
          </div>

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
            initialView="timeGridWeek"
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

      <LessonDetailModal
        lesson={selectedLesson}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
}
