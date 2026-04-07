import React, { useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { safeRender } from '../utils/safeRender';
import LessonDetailModal from './LessonDetailModal';

export default function TutorCalendar({ lessons = [] }) {
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Transform lessons into FullCalendar events
  const events = useMemo(() => {
    if (!lessons || !Array.isArray(lessons)) return [];
    
    return lessons.map((lesson) => {
      const startDate = new Date(lesson.start);
      const endDate = new Date(lesson.finish);
      
      // Determine event color based on status - using brand colors
      let backgroundColor = '#6A469D'; // Brand purple
      let borderColor = '#6A469D';
      
      if (lesson.status === 'complete' || lesson.status === 'completed') {
        backgroundColor = '#34B256'; // Brand green
        borderColor = '#34B256';
      } else if (lesson.status === 'cancelled') {
        backgroundColor = '#DA2E72'; // Brand pink (for cancelled)
        borderColor = '#DA2E72';
      } else if (lesson.status === 'planned') {
        backgroundColor = '#F79A30'; // Brand orange
        borderColor = '#F79A30';
      }
      
      // Build title with service name and topic
      const serviceName = safeRender(lesson.service_name) || `Service ${lesson.service_id}`;
      const topic = safeRender(lesson.topic);
      
      return {
        id: `lesson-${lesson.appointment_id}`,
        title: serviceName, // Simplified title for calendar
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        textColor: '#ffffff',
        extendedProps: {
          lesson: lesson, // Store full lesson object
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
    
    // Show time prominently, then service name
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
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Custom Calendar Styling */}
        <style>{`
          /* FullCalendar Custom Styling */
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
          
          /* Month view improvements */
          .fc-daygrid-day-events {
            margin-top: 0.25rem;
          }
          
          .fc-daygrid-event {
            border-radius: 0.375rem;
          }
          
          /* Week/Day view improvements */
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
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          height="auto"
          contentHeight="auto"
          eventDisplay="block"
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
      
      <LessonDetailModal
        lesson={selectedLesson}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </>
  );
}

