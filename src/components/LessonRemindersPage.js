import React, { useState } from 'react';
import LessonReminderModal from './LessonReminderModal';
import ConfirmationModal from './ConfirmationModal';
import { PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';

export default function LessonRemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  React.useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/lesson-reminders?limit=100');
      if (!response.ok) throw new Error('Failed to fetch reminders');
      const data = await response.json();
      setReminders(data.data || data['lesson-reminders'] || []);
    } catch (err) {
      console.error('Error fetching reminders:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingReminder(null);
    setIsModalOpen(true);
  };

  const handleEdit = (reminder) => {
    setEditingReminder(reminder);
    setIsModalOpen(true);
  };

  const handleDelete = (id, name) => {
    setConfirmState({
      isOpen: true,
      action: async () => {
        try {
          const response = await fetch(`/api/lesson-reminders/${id}`, {
            method: 'DELETE'
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to delete reminder');
          }

          await fetchReminders();
        } catch (err) {
          console.error('Error deleting reminder:', err);
          setError(err.message);
        }
      },
      title: 'Delete Reminder',
      message: `Are you sure you want to delete "${name}"?`,
    });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingReminder(null);
    fetchReminders(); // Refresh list
  };

  return (
    <>
      <div className="max-w-7xl mx-auto w-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Reminders</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Configure automated reminder emails sent before lessons
              </p>
            </div>
            <button
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              Add Reminder
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-sm text-neutral-600">Loading reminders...</p>
            </div>
          ) : reminders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <p className="text-sm text-neutral-600">No reminders configured yet</p>
              <button
                onClick={handleAdd}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
              >
                <PlusIcon className="h-5 w-5" />
                Add Your First Reminder
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Enabled
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Delivery time offset
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {reminders.map((reminder) => (
                      <tr key={reminder.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleEdit(reminder)}
                            className="text-sm font-medium text-brand-purple hover:text-brand-navy"
                          >
                            {reminder.name}
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {reminder.enabled ? (
                            <CheckIcon className="h-5 w-5 text-green-600" />
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {reminder.delivery_time_offset}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDelete(reminder.id, reminder.name)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      {isModalOpen && (
        <LessonReminderModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          reminder={editingReminder}
        />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        isDestructive={true}
      />
    </>
  );
}

