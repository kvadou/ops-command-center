import React, { useState, useMemo } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon,
  CalendarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

export default function TasksCalendarView({ tasks, onTaskClick, viewMode = 'month' }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedView, setSelectedView] = useState(viewMode);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const tasksByDate = useMemo(() => {
    const map = {};
    tasks.forEach(task => {
      if (task.due_date) {
        const date = new Date(task.due_date);
        const dateKey = date.toISOString().split('T')[0];
        if (!map[dateKey]) {
          map[dateKey] = [];
        }
        map[dateKey].push(task);
      }
    });
    return map;
  }, [tasks]);

  const navigateMonth = (direction) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const navigateDay = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const getWeekStart = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  };

  const getWeekDays = (startDate) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSameMonth = (date) => {
    return date.getMonth() === month && date.getFullYear() === year;
  };

  const getTaskColor = (task) => {
    if (task.status === 'done') return 'bg-green-100 border-green-300 text-green-700';
    if (task.status === 'blocked') return 'bg-red-100 border-red-300 text-red-700';
    if (task.priority === 'urgent') return 'bg-red-100 border-red-300 text-red-700';
    if (task.priority === 'high') return 'bg-orange-100 border-orange-300 text-orange-700';
    return 'bg-blue-100 border-blue-300 text-blue-700';
  };

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-neutral-200">
          {weekDays.map(day => (
            <div key={day} className="px-4 py-3 text-center text-xs font-semibold text-neutral-700 bg-neutral-50">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            if (!date) {
              return <div key={index} className="min-h-[100px] border-r border-b border-neutral-200 bg-neutral-50" />;
            }
            
            const dateKey = date.toISOString().split('T')[0];
            const dayTasks = tasksByDate[dateKey] || [];
            const isCurrentDay = isToday(date);
            
            return (
              <div
                key={index}
                className={`min-h-[100px] border-r border-b border-neutral-200 p-2 ${
                  isCurrentDay ? 'bg-brand-light/20' : 'bg-white'
                } ${!isSameMonth(date) ? 'opacity-50' : ''}`}
              >
                <div className={`text-sm font-medium mb-1 ${isCurrentDay ? 'text-brand-purple' : 'text-neutral-700'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map(task => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={`text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80 transition-opacity truncate ${getTaskColor(task)}`}
                      title={task.name}
                    >
                      {task.name}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-xs text-neutral-500 px-2">
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = getWeekStart(currentDate);
    const weekDays = getWeekDays(weekStart);
    const weekDaysNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-neutral-200">
          {weekDays.map((date, index) => {
            const isCurrentDay = isToday(date);
            return (
              <div
                key={index}
                className={`px-4 py-3 text-center border-r border-neutral-200 ${
                  isCurrentDay ? 'bg-brand-purple text-white' : 'bg-neutral-50'
                } ${index === 6 ? 'border-r-0' : ''}`}
              >
                <div className="text-xs font-medium">{weekDaysNames[index]}</div>
                <div className="text-lg font-semibold mt-1">{date.getDate()}</div>
                <div className="text-xs opacity-75">{date.toLocaleDateString('en-US', { month: 'short' })}</div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 min-h-[400px]">
          {weekDays.map((date, index) => {
            const dateKey = date.toISOString().split('T')[0];
            const dayTasks = tasksByDate[dateKey] || [];
            const isCurrentDay = isToday(date);
            
            return (
              <div
                key={index}
                className={`border-r border-neutral-200 p-3 ${isCurrentDay ? 'bg-brand-light/10' : 'bg-white'} ${
                  index === 6 ? 'border-r-0' : ''
                }`}
              >
                <div className="space-y-2">
                  {dayTasks.map(task => (
                    <div
                      key={task.id}
                      onClick={() => onTaskClick(task)}
                      className={`p-2 rounded-lg cursor-pointer hover:shadow-md transition-shadow ${getTaskColor(task)}`}
                    >
                      <div className="font-medium text-sm mb-1">{task.name}</div>
                      {task.due_date && (
                        <div className="flex items-center gap-1 text-xs opacity-75">
                          <ClockIcon className="h-3 w-3" />
                          {new Date(task.due_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  ))}
                  {dayTasks.length === 0 && (
                    <div className="text-xs text-neutral-400 text-center py-4">No tasks</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dateKey = currentDate.toISOString().split('T')[0];
    const dayTasks = tasksByDate[dateKey] || [];
    const isCurrentDay = isToday(currentDate);
    
    // Group tasks by time
    const tasksByTime = {};
    dayTasks.forEach(task => {
      if (task.due_date) {
        const time = new Date(task.due_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        if (!tasksByTime[time]) {
          tasksByTime[time] = [];
        }
        tasksByTime[time].push(task);
      } else {
        if (!tasksByTime['No time']) {
          tasksByTime['No time'] = [];
        }
        tasksByTime['No time'].push(task);
      }
    });
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className={`px-6 py-4 border-b border-neutral-200 ${isCurrentDay ? 'bg-brand-purple text-white' : 'bg-neutral-50'}`}>
          <div className="text-2xl font-bold">
            {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div className="p-6 space-y-4">
          {Object.keys(tasksByTime).sort().map(time => (
            <div key={time}>
              <div className="text-sm font-semibold text-neutral-700 mb-2 flex items-center gap-2">
                <ClockIcon className="h-4 w-4" />
                {time}
              </div>
              <div className="space-y-2">
                {tasksByTime[time].map(task => (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className={`p-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow ${getTaskColor(task)}`}
                  >
                    <div className="font-medium text-sm mb-1">{task.name}</div>
                    {task.description && (
                      <div className="text-xs opacity-75 line-clamp-2">{task.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs opacity-75">
                      {task.assignee_email && (
                        <span>{task.assignee_first_name || task.assignee_email}</span>
                      )}
                      {task.priority && (
                        <span className="px-2 py-0.5 bg-white/50 rounded">Priority: {task.priority}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {dayTasks.length === 0 && (
            <div className="text-center py-12 text-neutral-400">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tasks scheduled for this day</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with navigation and view selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedView === 'month') navigateMonth(-1);
                else if (selectedView === 'week') navigateWeek(-1);
                else navigateDay(-1);
              }}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                if (selectedView === 'month') navigateMonth(1);
                else if (selectedView === 'week') navigateWeek(1);
                else navigateDay(1);
              }}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Today
            </button>
          </div>
          <div className="text-lg font-semibold text-neutral-900">
            {selectedView === 'month' && currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {selectedView === 'week' && `Week of ${getWeekStart(currentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            {selectedView === 'day' && currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-neutral-100 rounded-lg p-1">
          <button
            onClick={() => setSelectedView('month')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              selectedView === 'month' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setSelectedView('week')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              selectedView === 'week' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setSelectedView('day')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              selectedView === 'day' ? 'bg-white text-brand-purple shadow-sm' : 'text-neutral-700'
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* Calendar content */}
      {selectedView === 'month' && renderMonthView()}
      {selectedView === 'week' && renderWeekView()}
      {selectedView === 'day' && renderDayView()}
    </div>
  );
}
