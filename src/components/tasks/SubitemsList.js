import React, { useState, useEffect } from 'react';
import { 
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import CustomFieldRenderer from './CustomFieldRenderer';
import { useToast } from '../../hooks/useToast';

export default function SubitemsList({ taskId, onSubitemClick, customFields = [] }) {
  const toast = useToast();
  const [subitems, setSubitems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (taskId) {
      fetchSubitems();
    }
  }, [taskId]);

  const fetchSubitems = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/subitems`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setSubitems(data.subitems || []);
      }
    } catch (error) {
      console.error('Error fetching subitems:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubitem = async (name, description, status, priority) => {
    try {
      const response = await fetch(`/api/tasks/items/${taskId}/subitems`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          status: status || 'todo',
          priority: priority || 'medium'
        }),
      });

      if (response.ok) {
        setIsAdding(false);
        fetchSubitems();
      }
    } catch (error) {
      console.error('Error creating subitem:', error);
    }
  };

  const handleToggleSubitem = async (subitemId, currentStatus) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    try {
      const response = await fetch(`/api/tasks/items/${subitemId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        fetchSubitems();
      }
    } catch (error) {
      console.error('Error updating subitem:', error);
    }
  };

  const completedCount = subitems.filter(s => s.status === 'done').length;
  const totalCount = subitems.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-semibold text-neutral-900 hover:text-brand-purple"
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronRightIcon className="h-4 w-4" />
          )}
          <span>Subitems ({completedCount}/{totalCount})</span>
        </button>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-brand-purple hover:bg-brand-purple/10 rounded"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {totalCount > 0 && (
        <div className="w-full bg-neutral-200 rounded-full h-2">
          <div
            className="bg-brand-purple h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {isExpanded && (
        <div className="space-y-2">
          {isAdding && (
            <SubitemForm
              onSubmit={handleCreateSubitem}
              onCancel={() => setIsAdding(false)}
            />
          )}
          {subitems.length === 0 && !isAdding ? (
            <p className="text-sm text-neutral-500 text-center py-4">No subitems yet</p>
          ) : (
            subitems.map((subitem) => (
              <div
                key={subitem.id}
                className="flex items-start gap-2 p-2 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                <button
                  onClick={() => handleToggleSubitem(subitem.id, subitem.status)}
                  className={`flex-shrink-0 mt-0.5 ${
                    subitem.status === 'done' ? 'text-green-600' : 'text-neutral-400'
                  }`}
                >
                  <CheckCircleIcon className={`h-5 w-5 ${subitem.status === 'done' ? 'fill-current' : ''}`} />
                </button>
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onSubitemClick && onSubitemClick(subitem)}
                >
                  <div className={`text-sm ${subitem.status === 'done' ? 'line-through text-neutral-500' : 'text-neutral-900'}`}>
                    {subitem.name}
                  </div>
                  {subitem.description && (
                    <div className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                      {subitem.description}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      subitem.status === 'done' ? 'bg-green-100 text-green-700' :
                      subitem.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                      subitem.status === 'blocked' ? 'bg-red-100 text-red-700' :
                      'bg-neutral-100 text-neutral-700'
                    }`}>
                      {subitem.status.replace('_', ' ')}
                    </span>
                    {subitem.priority && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        subitem.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        subitem.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        subitem.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-neutral-100 text-neutral-700'
                      }`}>
                        {subitem.priority}
                      </span>
                    )}
                    {subitem.due_date && (
                      <span className="text-xs text-neutral-500">
                        {new Date(subitem.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubitemForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Subitem name is required');
      return;
    }
    onSubmit(name, description, status, priority);
    setName('');
    setDescription('');
    setStatus('todo');
    setPriority('medium');
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3 space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Subitem name..."
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        autoFocus
        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        rows={2}
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy"
        >
          Add
        </button>
      </div>
    </div>
  );
}
