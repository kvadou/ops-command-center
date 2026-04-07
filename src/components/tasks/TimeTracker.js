import React, { useState, useEffect, useRef } from 'react';
import { 
  PlayIcon, 
  StopIcon, 
  ClockIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import ConfirmationModal from '../ConfirmationModal';
import { useToast } from '../../hooks/useToast';

export default function TimeTracker({ taskId, onTimeEntryAdded }) {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timeEntries, setTimeEntries] = useState([]);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [timeEstimate, setTimeEstimate] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const startTimeRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (taskId) {
      fetchTimeEntries();
      fetchTimeEstimate();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [taskId]);

  const fetchTimeEntries = async () => {
    if (!taskId) return;
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/time-entries`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTimeEntries(data.time_entries || []);
      }
    } catch (error) {
      console.error('Error fetching time entries:', error);
    }
  };

  const fetchTimeEstimate = async () => {
    if (!taskId) return;
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/time-estimate`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTimeEstimate(data.estimate);
      }
    } catch (error) {
      console.error('Error fetching time estimate:', error);
    }
  };

  const startTimer = async () => {
    const startTime = new Date();
    startTimeRef.current = startTime;
    setIsRunning(true);
    
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((new Date() - startTime) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);
  };

  const stopTimer = async () => {
    if (!intervalRef.current) return;
    
    clearInterval(intervalRef.current);
    setIsRunning(false);
    
    const endTime = new Date();
    const duration = Math.floor((endTime - startTimeRef.current) / 1000);
    
    // Save time entry
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/time-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: startTimeRef.current.toISOString(),
          end_time: endTime.toISOString(),
          duration_seconds: duration
        }),
      });

      if (response.ok) {
        setElapsedSeconds(0);
        fetchTimeEntries();
        if (onTimeEntryAdded) onTimeEntryAdded();
      }
    } catch (error) {
      console.error('Error saving time entry:', error);
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const totalTime = timeEntries.reduce((sum, entry) => {
    return sum + (entry.duration_seconds || 0);
  }, 0);

  const handleAddManualEntry = async (hours, minutes, notes, isBillable) => {
    const duration = (parseInt(hours) * 3600) + (parseInt(minutes) * 60);
    
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/time-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_seconds: duration,
          notes,
          is_billable: isBillable
        }),
      });

      if (response.ok) {
        setIsAddingManual(false);
        fetchTimeEntries();
        if (onTimeEntryAdded) onTimeEntryAdded();
      }
    } catch (error) {
      console.error('Error adding manual time entry:', error);
    }
  };

  const handleDeleteEntry = (entryId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Time Entry',
      message: 'Are you sure you want to delete this time entry?',
      action: async () => {
        try {
          const response = await fetch(`/api/tasks/time-entries/${entryId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            fetchTimeEntries();
          }
        } catch (error) {
          console.error('Error deleting time entry:', error);
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Timer */}
      <div className="bg-gradient-to-br from-brand-purple/10 to-brand-navy/10 rounded-lg p-4 border border-brand-purple/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">Time Tracker</h3>
            {timeEstimate && (
              <p className="text-xs text-neutral-500">
                Estimate: {timeEstimate.estimated_hours} hours
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-brand-purple">
              {isRunning ? formatDuration(elapsedSeconds) : formatDuration(totalTime)}
            </div>
            <div className="text-xs text-neutral-500">
              {isRunning ? 'Running' : 'Total Time'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={startTimer}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg font-medium hover:bg-brand-navy transition-colors"
            >
              <PlayIcon className="h-5 w-5" />
              Start Timer
            </button>
          ) : (
            <button
              onClick={stopTimer}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <StopIcon className="h-5 w-5" />
              Stop Timer
            </button>
          )}
          <button
            onClick={() => setIsAddingManual(true)}
            className="px-4 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-lg font-medium hover:bg-neutral-50 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Time Entries List */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Time Entries</h3>
        <div className="space-y-2">
          {timeEntries.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">No time entries yet</p>
          ) : (
            timeEntries.map((entry) => (
              <div key={entry.id} className="bg-neutral-50 rounded-lg p-3 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ClockIcon className="h-4 w-4 text-neutral-400" />
                    <span className="text-sm font-medium text-neutral-900">
                      {formatDuration(entry.duration_seconds || 0)}
                    </span>
                    {entry.is_billable && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                        Billable
                      </span>
                    )}
                  </div>
                  {entry.notes && (
                    <p className="text-xs text-neutral-600">{entry.notes}</p>
                  )}
                  <p className="text-xs text-neutral-500 mt-1">
                    {entry.user_first_name || entry.user_email} •{' '}
                    {entry.start_time 
                      ? new Date(entry.start_time).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : 'Manual entry'}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteEntry(entry.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Manual Entry Modal */}
      {isAddingManual && (
        <ManualTimeEntryForm
          onSubmit={handleAddManualEntry}
          onCancel={() => setIsAddingManual(false)}
        />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </div>
  );
}

function ManualTimeEntryForm({ onSubmit, onCancel }) {
  const toast = useToast();
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('0');
  const [notes, setNotes] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  const handleSubmit = () => {
    if (parseInt(hours) === 0 && parseInt(minutes) === 0) {
      toast.error('Please enter a duration');
      return;
    }
    onSubmit(parseInt(hours), parseInt(minutes), notes, isBillable);
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-semibold text-neutral-900">Add Manual Time Entry</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Hours</label>
          <input
            type="number"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Minutes</label>
          <input
            type="number"
            min="0"
            max="59"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-700 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          placeholder="Optional notes..."
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isBillable"
          checked={isBillable}
          onChange={(e) => setIsBillable(e.target.checked)}
          className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
        />
        <label htmlFor="isBillable" className="text-sm text-neutral-700">
          Billable
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy"
        >
          Add Entry
        </button>
      </div>
    </div>
  );
}
