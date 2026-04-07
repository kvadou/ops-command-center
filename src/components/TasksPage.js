import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  ClipboardDocumentListIcon,
  PlusIcon,
  Squares2X2Icon,
  TableCellsIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  EllipsisVerticalIcon,
  UserIcon,
  CalendarIcon,
  FlagIcon,
  ChatBubbleLeftRightIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
  UsersIcon,
  UserGroupIcon,
  BriefcaseIcon,
  Bars3Icon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { Menu, MenuButton, MenuItem, MenuItems, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import ConfirmationModal from './ConfirmationModal';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RoleProvider } from '../contexts/RoleContext';
import { BranchProvider } from '../contexts/BranchContext';
import TaskWorkflowTemplatesGallery from './TaskWorkflowTemplatesGallery';
import TaskAutomationManager from './TaskAutomationManager';
import CustomFieldEditor from './tasks/CustomFieldEditor';
import CustomFieldRenderer from './tasks/CustomFieldRenderer';
import TasksCalendarView from './tasks/TasksCalendarView';
import TasksTimelineView from './tasks/TasksTimelineView';
import TaskFilters from './tasks/TaskFilters';
import QuickFilters, { QUICK_FILTERS } from './tasks/QuickFilters';
import GroupingOptions from './tasks/GroupingOptions';
import SortingOptions from './tasks/SortingOptions';
import RichTextCommentEditor from './tasks/RichTextCommentEditor';
import CommentThread from './tasks/CommentThread';
import ActivityFeed from './tasks/ActivityFeed';
import TimeTracker from './tasks/TimeTracker';
import SubitemsList from './tasks/SubitemsList';
import TasksDashboard from './tasks/TasksDashboard';
import ItemRelations from './tasks/ItemRelations';
import BulkActions from './tasks/BulkActions';
import KeyboardShortcuts from './tasks/KeyboardShortcuts';

// Custom Field Input Component for editing
function CustomFieldEditorInput({ field, value, onChange }) {
  const handleChange = (newValue) => {
    onChange(newValue);
  };

  switch (field.field_type) {
    case 'text':
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          placeholder={`Enter ${field.name.toLowerCase()}...`}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          step={field.field_subtype === 'integer' ? 1 : 0.01}
          value={value || ''}
          onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          placeholder="0"
        />
      );

    case 'date':
    case 'datetime':
      const dateValue = value ? new Date(value).toISOString().slice(0, field.field_type === 'datetime' ? 16 : 10) : '';
      return (
        <input
          type={field.field_type === 'datetime' ? 'datetime-local' : 'date'}
          value={dateValue}
          onChange={(e) => handleChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      );

    case 'status':
      const options = field.field_config?.options || [];
      return (
        <select
          value={value?.label || ''}
          onChange={(e) => {
            const selected = options.find(opt => opt.label === e.target.value);
            handleChange(selected || null);
          }}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        >
          <option value="">Select status...</option>
          {options.map((opt, idx) => (
            <option key={idx} value={opt.label}>{opt.label}</option>
          ))}
        </select>
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => handleChange(e.target.checked)}
            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
          />
          <span className="text-sm text-neutral-700">Checked</span>
        </label>
      );

    case 'rating':
      const maxRating = field.field_config?.max || 5;
      const rating = parseInt(value) || 0;
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: maxRating }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleChange(idx + 1)}
              className={`text-2xl ${idx < rating ? 'text-yellow-400' : 'text-neutral-300'}`}
            >
              ★
            </button>
          ))}
        </div>
      );

    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      );
  }
}

// Task Card Component (for board view) - Now sortable
function TaskCard({ task, onUpdate, onViewDetails, isSelected, onSelect }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'low': return 'bg-neutral-100 text-neutral-700 border-neutral-300';
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-300';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return 'bg-green-100 text-green-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      case 'blocked': return 'bg-red-100 text-red-700';
      case 'todo': return 'bg-neutral-100 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
  const isDueSoon = task.due_date && !isOverdue && new Date(task.due_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg border p-4 hover:shadow-md transition-all duration-200 cursor-pointer ${
        isDragging ? 'shadow-lg' : ''
      } ${
        isSelected 
          ? 'border-brand-purple border-2 bg-brand-purple/5' 
          : 'border-neutral-200 hover:border-brand-purple/30'
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={(e) => {
            e.stopPropagation();
            if (onSelect) onSelect(task.id, e.target.checked);
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
        />
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-brand-purple transition-colors mt-0.5"
        >
          <Bars3Icon className="h-4 w-4" />
        </div>
        <div className="flex-1" onClick={() => onViewDetails(task)}>
          <div className="flex items-start justify-between">
            <h4 className="text-sm font-semibold text-neutral-900 flex-1 leading-tight">{task.name}</h4>
            <Menu as="div" className="relative">
          <MenuButton className="p-1 rounded hover:bg-neutral-100">
            <EllipsisVerticalIcon className="h-4 w-4 text-neutral-500" />
          </MenuButton>
          <MenuItems className="absolute right-0 mt-2 w-48 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50" anchor="bottom end">
            <div className="py-1">
              <MenuItem>
                {({ focus }) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewDetails(task); }}
                    className={`${focus ? 'bg-neutral-100' : ''} block w-full text-left px-4 py-2 text-sm text-neutral-700`}
                  >
                    View Details
                  </button>
                )}
              </MenuItem>
              <MenuItem>
                {({ focus }) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdate(task.id, { status: task.status === 'done' ? 'todo' : 'done' }); }}
                    className={`${focus ? 'bg-neutral-100' : ''} block w-full text-left px-4 py-2 text-sm text-neutral-700`}
                  >
                    {task.status === 'done' ? 'Mark Incomplete' : 'Mark Complete'}
                  </button>
                )}
              </MenuItem>
            </div>
            </MenuItems>
          </Menu>
        </div>
      </div>

      {task.description && (
        <p className="text-xs text-neutral-600 mb-3 line-clamp-2 leading-relaxed">{task.description}</p>
      )}

      {task.subitem_count > 0 && (
        <div className="flex items-center gap-1 mb-2 text-xs text-neutral-500">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span>{task.subitem_count} subitem{task.subitem_count !== 1 ? 's' : ''}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(task.priority)}`}>
          {task.priority}
        </span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
          {task.status.replace('_', ' ')}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div className="flex items-center gap-3">
          {task.assignee_email && (
            <div className="flex items-center gap-1">
              <UserIcon className="h-3.5 w-3.5" />
              <span className="truncate max-w-[100px]">{task.assignee_first_name || task.assignee_email}</span>
            </div>
          )}
          {task.due_date && (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : isDueSoon ? 'text-orange-600' : ''}`}>
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>
        {task.comment_count > 0 && (
          <div className="flex items-center gap-1">
            <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
            <span>{task.comment_count}</span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// Group Column Component (for board view) - Now sortable and droppable
function GroupColumn({ group, tasks, onUpdate, onViewDetails, onCreateTask, isDraggingGroup, selectedTaskIds, onTaskSelect }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isGroupDragging,
  } = useSortable({ id: `group-${group.id}` });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${group.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isGroupDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`flex-shrink-0 w-80 bg-white rounded-xl shadow-sm border border-neutral-200 p-4 ${isOver ? 'ring-2 ring-brand-purple' : ''} ${isGroupDragging ? 'shadow-lg' : ''} hover:shadow-md hover:border-brand-purple/20 transition-all duration-200`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 flex-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-brand-purple transition-colors"
          >
            <Bars3Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-900">{group.name}</h3>
          <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 text-xs font-medium rounded">
            {tasks.length}
          </span>
          {group.aggregation !== null && group.aggregation !== undefined && (
            <span className="px-2 py-0.5 bg-brand-purple/20 text-brand-purple text-xs font-medium rounded">
              {typeof group.aggregation === 'number' && group.aggregation % 1 !== 0 
                ? group.aggregation.toFixed(2) 
                : group.aggregation}
            </span>
          )}
        </div>
        <button
          onClick={() => onCreateTask(group.id)}
          className="p-1 rounded hover:bg-neutral-200 text-neutral-500 hover:text-brand-purple transition-colors"
          title="Add task"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
      <div 
        ref={setDroppableRef}
        className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto"
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              onViewDetails={onViewDetails}
              isSelected={selectedTaskIds?.has(task.id)}
              onSelect={onTaskSelect}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="text-center py-8 text-neutral-400 text-sm">
            No tasks in this group
          </div>
        )}
      </div>
    </div>
  );
}

// Task Detail Modal
function TaskDetailModal({ task, isOpen, onClose, onUpdate, onAddComment, customFields = [] }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fieldValues, setFieldValues] = useState({});
  const [users, setUsers] = useState([]);
  const fileInputRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (isOpen && task) {
      fetchComments();
      fetchAttachments();
      fetchFieldValues();
    }
  }, [isOpen, task]);

  const fetchFieldValues = async () => {
    if (!task) return;
    try {
      const response = await fetch(`/api/tasks/items/${task.id}/field-values`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const valuesMap = {};
        data.field_values.forEach(fv => {
          // Extract the actual value based on field type
          let value = null;
          if (fv.text_value !== null) value = fv.text_value;
          else if (fv.number_value !== null) value = fv.number_value;
          else if (fv.date_value !== null) value = fv.date_value;
          else if (fv.boolean_value !== null) value = fv.boolean_value;
          else if (fv.json_value) value = JSON.parse(fv.json_value);
          valuesMap[fv.field_id] = value;
        });
        setFieldValues(valuesMap);
      }
    } catch (error) {
      console.error('Error fetching field values:', error);
    }
  };

  const handleFieldValueUpdate = async (fieldId, value) => {
    if (!task) return;
    try {
      const response = await fetch(`/api/tasks/items/${task.id}/field-values`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_values: [{ field_id: fieldId, value }]
        }),
      });

      if (response.ok) {
        setFieldValues({ ...fieldValues, [fieldId]: value });
      }
    } catch (error) {
      console.error('Error updating field value:', error);
    }
  };

  const fetchComments = async () => {
    if (!task) return;
    try {
      const response = await fetch(`/api/tasks/items/${task.id}/comments`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        return data.users || [];
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    return [];
  };

  useEffect(() => {
    if (isOpen && task) {
      fetchUsers().then(setUsers);
    }
  }, [isOpen, task]);

  const fetchAttachments = async () => {
    if (!task) return;
    try {
      const response = await fetch(`/api/tasks/items/${task.id}/attachments`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.attachments || []);
      }
    } catch (error) {
      console.error('Error fetching attachments:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !task) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 201) {
          fetchAttachments();
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.addEventListener('error', () => {
        console.error('Upload failed');
        setUploading(false);
        setUploadProgress(0);
      });

      xhr.open('POST', `/api/tasks/items/${task.id}/attachments`);
      xhr.withCredentials = true;
      xhr.send(formData);
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Attachment',
      message: 'Are you sure you want to delete this attachment?',
      action: async () => {
        try {
          const response = await fetch(`/api/tasks/attachments/${attachmentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            fetchAttachments();
          }
        } catch (error) {
          console.error('Error deleting attachment:', error);
        }
      }
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    return '📎';
  };

  const handleAddComment = async (content, parentCommentId = null) => {
    if (!content.trim() || !task) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/items/${task.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parent_comment_id: parentCommentId }),
      });

      if (response.ok) {
        fetchComments();
        if (onAddComment) onAddComment();
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditComment = async (commentId, content) => {
    try {
      const response = await fetch(`/api/tasks/comments/${commentId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        fetchComments();
      }
    } catch (error) {
      console.error('Error editing comment:', error);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      const response = await fetch(`/api/tasks/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        fetchComments();
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleReactToComment = async (commentId, emoji) => {
    try {
      const response = await fetch(`/api/tasks/comments/${commentId}/reactions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });

      if (response.ok) {
        fetchComments();
      }
    } catch (error) {
      console.error('Error reacting to comment:', error);
    }
  };

  // Pass these functions to TaskDetailTabs
  const taskDetailProps = {
    task,
    onUpdate,
    customFields,
    fieldValues,
    handleFieldValueUpdate,
    comments,
    users,
    handleAddComment,
    handleEditComment,
    handleDeleteComment,
    handleReactToComment,
    attachments,
    handleFileUpload,
    handleDeleteAttachment,
    uploading,
    uploadProgress,
    fileInputRef,
    formatFileSize,
    getFileIcon
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold text-neutral-900">{task.name}</DialogTitle>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TaskDetailTabs {...taskDetailProps} />
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

// Task Detail Tabs Component
function TaskDetailTabs({ 
  task, 
  onUpdate, 
  customFields, 
  fieldValues, 
  handleFieldValueUpdate,
  comments,
  users,
  handleAddComment,
  handleEditComment,
  handleDeleteComment,
  handleReactToComment,
  attachments,
  handleFileUpload,
  handleDeleteAttachment,
  uploading,
  uploadProgress,
  fileInputRef,
  formatFileSize,
  getFileIcon
}) {
  const [activeTab, setActiveTab] = useState('details');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-neutral-200 mb-4">
        <div className="flex space-x-4">
          <button 
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'details' 
                ? 'text-brand-purple border-b-2 border-brand-purple' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Details
          </button>
          <button 
            onClick={() => setActiveTab('comments')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'comments' 
                ? 'text-brand-purple border-b-2 border-brand-purple' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Comments ({comments.length})
          </button>
          <button 
            onClick={() => setActiveTab('time')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'time' 
                ? 'text-brand-purple border-b-2 border-brand-purple' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Time
          </button>
          <button 
            onClick={() => setActiveTab('activity')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'activity' 
                ? 'text-brand-purple border-b-2 border-brand-purple' 
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            Activity
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'details' && (
          <>
            {task.description && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">Description</h3>
                <p className="text-sm text-neutral-700 leading-relaxed">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase mb-1 block">Status</label>
                <select
                  value={task.status}
                  onChange={(e) => onUpdate(task.id, { status: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase mb-1 block">Priority</label>
                <select
                  value={task.priority}
                  onChange={(e) => onUpdate(task.id, { priority: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {customFields.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 mb-3">Custom Fields</h3>
                <div className="space-y-4">
                  {customFields.map((field) => {
                    const fieldValue = fieldValues[field.id];
                    return (
                      <div key={field.id}>
                        <label className="block text-xs font-semibold text-neutral-500 uppercase mb-1">
                          {field.name}
                          {field.is_required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <CustomFieldEditorInput
                          field={field}
                          value={fieldValue}
                          onChange={(value) => handleFieldValueUpdate(field.id, value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">Attachments</h3>
              <div className="space-y-2 mb-4">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between bg-neutral-50 rounded-lg p-3 hover:bg-neutral-100 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl">{getFileIcon(attachment.mime_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {attachment.original_filename}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatFileSize(attachment.file_size)} • {new Date(attachment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/tasks/attachments/${attachment.id}/download`}
                        download
                        className="p-1 text-brand-purple hover:text-brand-navy transition-colors"
                        title="Download"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </a>
                      <button
                        onClick={() => handleDeleteAttachment(attachment.id)}
                        className="p-1 text-red-600 hover:text-red-700 transition-colors"
                        title="Delete"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
                {attachments.length === 0 && (
                  <p className="text-sm text-neutral-500 text-center py-4">No attachments yet</p>
                )}
              </div>
              <div className="border-2 border-dashed border-neutral-300 rounded-lg p-4 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className={`cursor-pointer ${uploading ? 'opacity-50' : ''}`}
                >
                  {uploading ? (
                    <div>
                      <div className="text-sm text-neutral-600 mb-2">Uploading... {uploadProgress.toFixed(0)}%</div>
                      <div className="w-full bg-neutral-200 rounded-full h-2">
                        <div
                          className="bg-brand-purple h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <svg className="mx-auto h-8 w-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mt-2 text-sm text-neutral-600">
                        <span className="font-medium text-brand-purple hover:text-brand-navy">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">Max file size: 10MB</p>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">Subitems</h3>
              <SubitemsList
                taskId={task.id}
                onSubitemClick={(subitem) => {
                  // Could open subitem in modal or navigate
                }}
                customFields={customFields}
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">Relations</h3>
              <ItemRelations
                taskId={task.id}
                onRelationClick={(relatedItemId) => {
                  // Fetch and show related item
                }}
              />
            </div>
          </>
        )}

        {activeTab === 'comments' && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Comments</h3>
            <div className="space-y-3 mb-4">
              {comments.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-4">No comments yet</p>
              ) : (
                comments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    onEdit={handleEditComment}
                    onDelete={handleDeleteComment}
                    onReply={(parentId, content) => handleAddComment(content, parentId)}
                    onReact={handleReactToComment}
                    currentUserId={user?.id?.toString() || user?.email}
                    users={users}
                  />
                ))
              )}
            </div>
            <RichTextCommentEditor
              onSubmit={(content) => handleAddComment(content)}
              placeholder="Add a comment..."
              users={users}
            />
          </div>
        )}

        {activeTab === 'time' && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Time Tracking</h3>
            <TimeTracker 
              taskId={task.id} 
              onTimeEntryAdded={() => {
                // Refresh task data if needed
              }}
            />
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Activity</h3>
            <ActivityFeed taskId={task.id} />
          </div>
        )}
      </div>
    </>
  );
}

// Main Tasks Page Component
export default function TasksPage() {
  const [viewMode, setViewMode] = useState('board'); // 'board', 'table', 'calendar', 'timeline', or 'dashboard'
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [taskDependencies, setTaskDependencies] = useState([]);
  const [boards, setBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ status: '', priority: '', assignee: '' });
  const [advancedFilters, setAdvancedFilters] = useState([]);
  const [filterLogic, setFilterLogic] = useState('AND');
  const [quickFilter, setQuickFilter] = useState(null);
  const [savedFilterPresets, setSavedFilterPresets] = useState([]);
  const [groupBy, setGroupBy] = useState('none');
  const [sorts, setSorts] = useState([{ id: Date.now(), field: 'due_date', direction: 'asc' }]);
  const [aggregations, setAggregations] = useState({});
  const [isGroupingModalOpen, setIsGroupingModalOpen] = useState(false);
  const [isSortingModalOpen, setIsSortingModalOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isCreateBoardModalOpen, setIsCreateBoardModalOpen] = useState(false);
  const [isWorkflowGalleryOpen, setIsWorkflowGalleryOpen] = useState(false);
  const [isAutomationManagerOpen, setIsAutomationManagerOpen] = useState(false);
  const [isCustomFieldsModalOpen, setIsCustomFieldsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [customFields, setCustomFields] = useState([]);
  const [newBoardName, setNewBoardName] = useState('');
  const [newTask, setNewTask] = useState({ name: '', description: '', group_id: '', status: 'todo', priority: 'medium' });
  const [activeId, setActiveId] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const lastFetchedBoardId = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const companyName = user?.company_name || 'Acme Operations';
  const isMainBranch = !user?.branch_id || user.branch_id === 'main';

  const fetchBoards = useCallback(async () => {
    try {
      const response = await fetch('/api/tasks/boards?archived=false', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setBoards(data.boards || []);
        // Only set selected board if we don't have one and we have boards
        if (data.boards && data.boards.length > 0) {
          setSelectedBoard(prev => prev || data.boards[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching boards:', error);
    }
  }, []); // Remove selectedBoard from dependencies

  const fetchBoardData = useCallback(async (boardId) => {
    if (!boardId || lastFetchedBoardId.current === boardId) return;
    lastFetchedBoardId.current = boardId;
    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/boards/${boardId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // Flatten tasks from groups
        const allTasks = [];
        if (data.board.groups) {
          data.board.groups.forEach(group => {
            if (group.items) {
              group.items.forEach(item => {
                allTasks.push({ ...item, group_name: group.name, group_id: group.id });
              });
            }
          });
        }
        setTasks(allTasks);
        // Update selectedBoard with the full board data
        setSelectedBoard(data.board);
      }
    } catch (error) {
      console.error('Error fetching board data:', error);
      lastFetchedBoardId.current = null; // Reset on error so we can retry
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch boards only once on mount
  useEffect(() => {
    fetchBoards();
  }, []); // Only run once on mount

  // Fetch board data when selectedBoard changes (but only if it has an id)
  useEffect(() => {
    if (selectedBoard?.id) {
      fetchBoardData(selectedBoard.id);
      fetchCustomFields(selectedBoard.id);
      fetchDependencies(selectedBoard.id);
    }
  }, [selectedBoard?.id, fetchBoardData]);

  const fetchDependencies = useCallback(async (boardId) => {
    if (!boardId) return;
    try {
      // Fetch dependencies for all tasks in the board
      const allDependencies = [];
      for (const task of tasks) {
        try {
          const response = await fetch(`/api/tasks/items/${task.id}/dependencies`, { credentials: 'include' });
          if (response.ok) {
            const data = await response.json();
            if (data.depends_on && data.depends_on.length > 0) {
              data.depends_on.forEach(dep => {
                allDependencies.push({
                  ...dep,
                  task_id: task.id,
                  item_id: task.id,
                  depends_on_task_id: dep.task_id || dep.depends_on_task_id,
                  depends_on_item_id: dep.task_id || dep.depends_on_task_id
                });
              });
            }
          }
        } catch (error) {
          // Continue if one task fails
        }
      }
      setTaskDependencies(allDependencies);
    } catch (error) {
      console.error('Error fetching dependencies:', error);
    }
  }, [tasks]);

  const fetchCustomFields = useCallback(async (boardId) => {
    if (!boardId) return;
    try {
      const response = await fetch(`/api/tasks/boards/${boardId}/fields`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setCustomFields(data.fields || []);
      }
    } catch (error) {
      console.error('Error fetching custom fields:', error);
    }
  }, []);

  const handleSaveCustomField = async (fieldData) => {
    if (!selectedBoard) return;
    try {
      const url = editingField
        ? `/api/tasks/fields/${editingField.id}`
        : `/api/tasks/boards/${selectedBoard.id}/fields`;
      const method = editingField ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldData),
      });

      if (response.ok) {
        await fetchCustomFields(selectedBoard.id);
        setEditingField(null);
        if (!editingField) {
          setIsCustomFieldsModalOpen(false);
        }
      }
    } catch (error) {
      console.error('Error saving custom field:', error);
    }
  };

  const handleDeleteCustomField = (fieldId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Custom Field',
      message: 'Are you sure you want to delete this field? All values will be lost.',
      action: async () => {
        try {
          const response = await fetch(`/api/tasks/fields/${fieldId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            await fetchCustomFields(selectedBoard.id);
            setEditingField(null);
          }
        } catch (error) {
          console.error('Error deleting custom field:', error);
        }
      }
    });
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      const response = await fetch('/api/tasks/boards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBoardName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setBoards([...boards, data.board]);
        setSelectedBoard(data.board);
        setNewBoardName('');
        setIsCreateBoardModalOpen(false);
      }
    } catch (error) {
      console.error('Error creating board:', error);
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.name.trim() || !newTask.group_id) return;
    try {
      const response = await fetch(`/api/tasks/boards/${selectedBoard.id}/items`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });

      if (response.ok) {
        fetchBoardData(selectedBoard.id);
        setNewTask({ name: '', description: '', group_id: '', status: 'todo', priority: 'medium' });
        setIsCreateTaskModalOpen(false);
      }
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      const response = await fetch(`/api/tasks/items/${taskId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        fetchBoardData(selectedBoard.id);
        if (selectedTask && selectedTask.id === taskId) {
          setSelectedTask({ ...selectedTask, ...updates });
        }
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleBulkUpdate = async (taskIds, updates) => {
    try {
      // Update all selected tasks
      const updatePromises = taskIds.map(taskId => {
        if (updates.deleted) {
          // Soft delete
          return fetch(`/api/tasks/items/${taskId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        } else {
          return fetch(`/api/tasks/items/${taskId}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
        }
      });

      await Promise.all(updatePromises);
      setSelectedTaskIds(new Set());
      fetchBoardData(selectedBoard.id);
    } catch (error) {
      console.error('Error bulk updating tasks:', error);
    }
  };

  const handleTaskSelect = (taskId, isSelected) => {
    const newSelected = new Set(selectedTaskIds);
    if (isSelected) {
      newSelected.add(taskId);
    } else {
      newSelected.delete(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);
    
    // Find the dragged task if it's a task
    if (typeof active.id === 'string' && !active.id.startsWith('group-')) {
      const task = tasks.find(t => t.id === active.id);
      if (task) {
        setDraggedTask(task);
      }
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    setDraggedTask(null);

    if (!over || !selectedBoard) return;

    // Handle group reordering
    if (active.id.toString().startsWith('group-') && over.id.toString().startsWith('group-')) {
      const activeGroupId = active.id.toString().replace('group-', '');
      const overGroupId = over.id.toString().replace('group-', '');
      
      if (activeGroupId === overGroupId) return;

      const groups = [...(selectedBoard.groups || [])];
      const activeIndex = groups.findIndex(g => g.id === activeGroupId);
      const overIndex = groups.findIndex(g => g.id === overGroupId);

      if (activeIndex !== -1 && overIndex !== -1) {
        const reorderedGroups = arrayMove(groups, activeIndex, overIndex);
        
        // Update positions
        try {
          // Update group positions
          const updatePromises = reorderedGroups.map((group, index) =>
            fetch(`/api/tasks/groups/${group.id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ position: index }),
            })
          );
          await Promise.all(updatePromises);

          // Update local state
          setSelectedBoard({
            ...selectedBoard,
            groups: reorderedGroups.map((g, idx) => ({ ...g, position: idx }))
          });
        } catch (error) {
          console.error('Error updating group positions:', error);
          fetchBoardData(selectedBoard.id); // Revert on error
        }
      }
      return;
    }

    // Handle task movement within or between groups
    const activeTaskId = active.id;
    const overId = over.id.toString();

    // Find the target group (could be a group or a task in a group)
    let targetGroupId = null;
    if (overId.startsWith('droppable-')) {
      targetGroupId = overId.replace('droppable-', '');
    } else {
      // If dropped on a task, find that task's group
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) {
        targetGroupId = overTask.group_id;
      }
    }

    if (!targetGroupId) return;

    const activeTask = tasks.find(t => t.id === activeTaskId);
    if (!activeTask) return;

    const sourceGroupId = activeTask.group_id;

    // If moving to a different group, update the task
    if (sourceGroupId !== targetGroupId) {
      try {
        // Get tasks in target group to determine new position
        const targetGroupTasks = filteredTasks.filter(t => t.group_id === targetGroupId);
        const newPosition = targetGroupTasks.length;

        await handleUpdateTask(activeTaskId, {
          group_id: targetGroupId,
          position: newPosition,
        });
      } catch (error) {
        console.error('Error moving task:', error);
        fetchBoardData(selectedBoard.id); // Revert on error
      }
    } else {
      // Reordering within the same group
      const groupTasks = filteredTasks
        .filter(t => t.group_id === sourceGroupId)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
      
      const activeIndex = groupTasks.findIndex(t => t.id === activeTaskId);
      const overIndex = groupTasks.findIndex(t => t.id === overId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const reorderedTasks = arrayMove(groupTasks, activeIndex, overIndex);
        
        try {
          // Update positions for all affected tasks
          for (let i = 0; i < reorderedTasks.length; i++) {
            await fetch(`/api/tasks/items/${reorderedTasks[i].id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ position: i }),
            });
          }

          fetchBoardData(selectedBoard.id);
        } catch (error) {
          console.error('Error updating task positions:', error);
          fetchBoardData(selectedBoard.id); // Revert on error
        }
      }
    }
  };

  const applyAdvancedFilter = (task, filter) => {
    const fieldType = getFieldType(filter.field);
    let fieldValue = getFieldValue(task, filter.field);

    switch (filter.operator) {
      case 'contains':
        return String(fieldValue || '').toLowerCase().includes(String(filter.value || '').toLowerCase());
      case 'does not contain':
        return !String(fieldValue || '').toLowerCase().includes(String(filter.value || '').toLowerCase());
      case 'equals':
        return String(fieldValue) === String(filter.value);
      case 'not equals':
        return String(fieldValue) !== String(filter.value);
      case 'starts with':
        return String(fieldValue || '').toLowerCase().startsWith(String(filter.value || '').toLowerCase());
      case 'ends with':
        return String(fieldValue || '').toLowerCase().endsWith(String(filter.value || '').toLowerCase());
      case 'greater than':
        return parseFloat(fieldValue) > parseFloat(filter.value);
      case 'less than':
        return parseFloat(fieldValue) < parseFloat(filter.value);
      case 'greater than or equal':
        return parseFloat(fieldValue) >= parseFloat(filter.value);
      case 'less than or equal':
        return parseFloat(fieldValue) <= parseFloat(filter.value);
      case 'before':
        return new Date(fieldValue) < new Date(filter.value);
      case 'after':
        return new Date(fieldValue) > new Date(filter.value);
      case 'between':
        return new Date(fieldValue) >= new Date(filter.value.start) && new Date(fieldValue) <= new Date(filter.value.end);
      case 'is':
        return String(fieldValue) === String(filter.value);
      case 'is not':
        return String(fieldValue) !== String(filter.value);
      case 'is empty':
        return !fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined;
      case 'is not empty':
        return fieldValue && fieldValue !== '' && fieldValue !== null && fieldValue !== undefined;
      default:
        return true;
    }
  };

  const getFieldType = (fieldName) => {
    if (['name', 'description'].includes(fieldName)) return 'text';
    if (['status'].includes(fieldName)) return 'status';
    if (['priority'].includes(fieldName)) return 'priority';
    if (['due_date', 'start_date', 'created_at', 'updated_at'].includes(fieldName)) return 'date';
    if (['assignee_id', 'creator_id'].includes(fieldName)) return 'people';
    if (['tags'].includes(fieldName)) return 'tags';
    const customField = customFields.find(cf => cf.id === fieldName || cf.name === fieldName);
    if (customField) return customField.field_type;
    return 'text';
  };

  const getFieldValue = (task, fieldName) => {
    // Standard fields
    if (fieldName === 'name') return task.name;
    if (fieldName === 'description') return task.description;
    if (fieldName === 'status') return task.status;
    if (fieldName === 'priority') return task.priority;
    if (fieldName === 'due_date') return task.due_date;
    if (fieldName === 'start_date') return task.start_date;
    if (fieldName === 'assignee_id') return task.assignee_id;
    if (fieldName === 'creator_id') return task.creator_id;
    if (fieldName === 'tags') return task.tags;
    if (fieldName === 'created_at') return task.created_at;
    if (fieldName === 'updated_at') return task.updated_at;

    // Custom fields
    const customField = customFields.find(cf => cf.id === fieldName || cf.name === fieldName);
    if (customField) {
      const fieldValue = task.custom_field_values?.find(fv => fv.field_id === customField.id);
      if (fieldValue) {
        if (fieldValue.text_value !== null) return fieldValue.text_value;
        if (fieldValue.number_value !== null) return fieldValue.number_value;
        if (fieldValue.date_value !== null) return fieldValue.date_value;
        if (fieldValue.boolean_value !== null) return fieldValue.boolean_value;
        if (fieldValue.json_value) return typeof fieldValue.json_value === 'string' ? JSON.parse(fieldValue.json_value) : fieldValue.json_value;
      }
    }

    return null;
  };

  const filteredTasks = tasks.filter(task => {
    // Quick filter
    if (quickFilter) {
      const quickFilterDef = QUICK_FILTERS.find(qf => qf.id === quickFilter);
      if (quickFilterDef && !quickFilterDef.filter(task, user?.id?.toString() || user?.email)) {
        return false;
      }
    }

    // Basic filters
    const matchesSearch = !searchQuery || 
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = !filters.status || task.status === filters.status;
    const matchesPriority = !filters.priority || task.priority === filters.priority;
    
    if (!matchesSearch || !matchesStatus || !matchesPriority) {
      return false;
    }

    // Advanced filters
    if (advancedFilters.length > 0) {
      const filterResults = advancedFilters.map(filter => {
        if (!filter.field || !filter.operator) return true;
        return applyAdvancedFilter(task, filter);
      });

      if (filterLogic === 'AND') {
        return filterResults.every(result => result);
      } else {
        return filterResults.some(result => result);
      }
    }

    return true;
  });

  // Apply sorting
  const sortedTasks = useMemo(() => {
    if (sorts.length === 0 || sorts.every(s => !s.field)) {
      return filteredTasks;
    }

    return [...filteredTasks].sort((a, b) => {
      for (const sort of sorts) {
        if (!sort.field) continue;

        let aValue, bValue;

        if (sort.field.startsWith('custom_')) {
          const fieldId = sort.field.replace('custom_', '');
          const aFieldValue = a.custom_field_values?.find(fv => fv.field_id === fieldId);
          const bFieldValue = b.custom_field_values?.find(fv => fv.field_id === fieldId);
          aValue = aFieldValue?.number_value || aFieldValue?.text_value || aFieldValue?.date_value || '';
          bValue = bFieldValue?.number_value || bFieldValue?.text_value || bFieldValue?.date_value || '';
        } else {
          aValue = a[sort.field] || '';
          bValue = b[sort.field] || '';
        }

        if (aValue === bValue) continue;

        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue - bValue;
        } else {
          comparison = aValue > bValue ? 1 : -1;
        }

        if (sort.direction === 'desc') {
          comparison = -comparison;
        }

        if (comparison !== 0) {
          return comparison;
        }
      }
      return 0;
    });
  }, [filteredTasks, sorts]);

  // Apply grouping
  const groupedTasks = useMemo(() => {
    if (groupBy === 'none' || groupBy === 'group') {
      // Use board groups
      return selectedBoard?.groups?.map(group => ({
        ...group,
        items: sortedTasks.filter(task => task.group_id === group.id)
      })) || [];
    }

    // Group by selected field
    const groups = {};
    sortedTasks.forEach(task => {
      let groupKey = 'Unassigned';

      if (groupBy === 'status') {
        groupKey = task.status || 'Unassigned';
      } else if (groupBy === 'priority') {
        groupKey = task.priority || 'Unassigned';
      } else if (groupBy === 'assignee') {
        groupKey = task.assignee_email || task.assignee_first_name || 'Unassigned';
      } else if (groupBy === 'due_date') {
        if (task.due_date) {
          const date = new Date(task.due_date);
          groupKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else {
          groupKey = 'No Due Date';
        }
      } else if (groupBy === 'tags') {
        if (task.tags && Array.isArray(task.tags) && task.tags.length > 0) {
          task.tags.forEach(tag => {
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push(task);
          });
          return; // Skip adding to single group
        } else {
          groupKey = 'No Tags';
        }
      } else if (groupBy.startsWith('custom_')) {
        const fieldId = groupBy.replace('custom_', '');
        const fieldValue = task.custom_field_values?.find(fv => fv.field_id === fieldId);
        if (fieldValue) {
          groupKey = fieldValue.text_value || fieldValue.number_value || 'Unassigned';
        } else {
          groupKey = 'Unassigned';
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });

    // Convert to array and calculate aggregations
    return Object.entries(groups).map(([key, items]) => {
      let aggregation = null;
      if (aggregations[groupBy]) {
        const aggType = aggregations[groupBy];
        if (aggType === 'count') {
          aggregation = items.length;
        } else if (aggType === 'sum' || aggType === 'average') {
          // For numeric custom fields
          const values = items.map(item => {
            if (groupBy.startsWith('custom_')) {
              const fieldId = groupBy.replace('custom_', '');
              const fv = item.custom_field_values?.find(v => v.field_id === fieldId);
              return fv?.number_value || 0;
            }
            return 0;
          }).filter(v => !isNaN(v));
          if (aggType === 'sum') {
            aggregation = values.reduce((a, b) => a + b, 0);
          } else {
            aggregation = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          }
        }
      }

      return {
        id: key,
        name: key,
        items,
        aggregation
      };
    }).sort((a, b) => {
      // Sort groups by name
      return a.name.localeCompare(b.name);
    });
  }, [sortedTasks, groupBy, selectedBoard, aggregations]);

  const searchInputRef = useRef(null);

  return (
    <RoleProvider>
      <BranchProvider>
        <KeyboardShortcuts
          onSwitchView={setViewMode}
          onCreateTask={() => setIsCreateTaskModalOpen(true)}
          onFocusSearch={() => searchInputRef.current?.focus()}
          onSelectAll={handleSelectAll}
          onDeselectAll={() => setSelectedTaskIds(new Set())}
        />
          <div className="max-w-7xl mx-auto w-full">
            {/* Header Section - White Background Container */}
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <ClipboardDocumentListIcon className="h-6 w-6 text-brand-purple" />
                  <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Task Management</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsAutomationManagerOpen(true)}
                    className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 min-h-[44px] sm:min-h-0"
                    title="Manage automation rules"
                  >
                    <BellIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Automations</span>
                  </button>
                  <button
                    onClick={() => setIsWorkflowGalleryOpen(true)}
                    className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 min-h-[44px] sm:min-h-0"
                    title="Execute workflow templates"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span className="hidden sm:inline">Workflows</span>
                  </button>
                  {selectedBoard && (
                    <button
                      onClick={() => setIsCustomFieldsModalOpen(true)}
                      className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2 min-h-[44px] sm:min-h-0"
                      title="Manage custom fields"
                    >
                      <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      <span className="hidden sm:inline">Fields</span>
                    </button>
                  )}
                  <button
                    onClick={() => setIsCreateBoardModalOpen(true)}
                    className="px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors min-h-[44px] sm:min-h-0"
                  >
                    New Board
                  </button>
                  <button
                    onClick={() => setIsCreateTaskModalOpen(true)}
                    disabled={!selectedBoard}
                    className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] sm:min-h-0"
                  >
                    <PlusIcon className="h-4 w-4 inline mr-1" />
                    New Task
                  </button>
                </div>
              </div>

              {/* Board Selector */}
              {boards.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-neutral-700">Board:</span>
                  <select
                    value={selectedBoard?.id || ''}
                    onChange={(e) => {
                      const board = boards.find(b => b.id === e.target.value);
                      setSelectedBoard(board);
                    }}
                    className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple min-h-[44px] sm:min-h-0"
                  >
                    {boards.map(board => (
                      <option key={board.id} value={board.id}>{board.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Filters */}
              <div className="mb-4">
                <QuickFilters
                  activeFilter={quickFilter}
                  onFilterChange={setQuickFilter}
                  tasks={tasks}
                  userId={user?.id?.toString() || user?.email}
                />
              </div>

              {/* Search and Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks... (Press 'f' to focus)"
                    className="w-full pl-10 pr-4 py-2.5 sm:py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple min-h-[44px] sm:min-h-0"
                  />
                </div>
                <TaskFilters
                  filters={advancedFilters}
                  onFiltersChange={setAdvancedFilters}
                  customFields={customFields}
                  savedPresets={savedFilterPresets}
                  onSavePreset={(preset) => {
                    setSavedFilterPresets([...savedFilterPresets, { ...preset, id: Date.now() }]);
                  }}
                  onLoadPreset={(preset) => {
                    setAdvancedFilters(preset.filters);
                    setFilterLogic(preset.logic || 'AND');
                  }}
                  onDeletePreset={(presetId) => {
                    setSavedFilterPresets(savedFilterPresets.filter(p => p.id !== presetId));
                  }}
                />
                <div className="flex items-center gap-2">
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="px-3 py-2.5 sm:py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple min-h-[44px] sm:min-h-0"
                  >
                    <option value="">All Status</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                  <select
                    value={filters.priority}
                    onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                    className="px-3 py-2.5 sm:py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple min-h-[44px] sm:min-h-0"
                  >
                    <option value="">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('board')}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${viewMode === 'board' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Board View"
                  >
                    <Squares2X2Icon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${viewMode === 'table' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Table View"
                  >
                    <TableCellsIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('calendar')}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${viewMode === 'calendar' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Calendar View"
                  >
                    <CalendarIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('timeline')}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${viewMode === 'timeline' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Timeline View"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${viewMode === 'dashboard' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Dashboard View"
                  >
                    <ChartBarIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setIsGroupingModalOpen(true)}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${groupBy !== 'none' ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Grouping Options"
                  >
                    <Squares2X2Icon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setIsSortingModalOpen(true)}
                    className={`p-2.5 sm:p-2 rounded-lg min-h-[44px] sm:min-h-0 flex items-center justify-center ${sorts.length > 0 && sorts.some(s => s.field) ? 'bg-brand-purple text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                    title="Sorting Options"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            {loading ? (
              <div className="text-center py-12">
                <p className="text-neutral-500">Loading tasks...</p>
              </div>
            ) : !selectedBoard ? (
              <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                <p className="text-neutral-500 mb-4">No board selected. Create a new board to get started.</p>
                <button
                  onClick={() => setIsCreateBoardModalOpen(true)}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy transition-colors"
                >
                  Create Board
                </button>
              </div>
            ) : viewMode === 'board' ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={groupedTasks.map(g => `group-${g.id}`)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {groupedTasks.map((group) => (
                      <GroupColumn
                        key={group.id}
                        group={group}
                        tasks={group.items}
                        onUpdate={handleUpdateTask}
                        onViewDetails={(task) => {
                          setSelectedTask(task);
                          setIsTaskModalOpen(true);
                        }}
                        onCreateTask={(groupId) => {
                          setNewTask({ ...newTask, group_id: groupId });
                          setIsCreateTaskModalOpen(true);
                        }}
                        selectedTaskIds={selectedTaskIds}
                        onTaskSelect={handleTaskSelect}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {draggedTask ? (
                    <div className="bg-white rounded-lg border-2 border-brand-purple p-4 shadow-xl opacity-90 w-80">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-sm font-semibold text-neutral-900 flex-1 leading-tight">{draggedTask.name}</h4>
                      </div>
                      {draggedTask.description && (
                        <p className="text-xs text-neutral-600 mb-3 line-clamp-2 leading-relaxed">{draggedTask.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                          draggedTask.priority === 'urgent' ? 'bg-red-100 text-red-700 border-red-300' :
                          draggedTask.priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                          draggedTask.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                          'bg-neutral-100 text-neutral-700 border-neutral-300'
                        }`}>
                          {draggedTask.priority}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          draggedTask.status === 'done' ? 'bg-green-100 text-green-700' :
                          draggedTask.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          draggedTask.status === 'blocked' ? 'bg-red-100 text-red-700' :
                          'bg-neutral-100 text-neutral-700'
                        }`}>
                          {draggedTask.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : viewMode === 'calendar' ? (
              <TasksCalendarView
                tasks={filteredTasks}
                onTaskClick={(task) => {
                  setSelectedTask(task);
                  setIsTaskModalOpen(true);
                }}
              />
            ) : viewMode === 'timeline' ? (
              <TasksTimelineView
                tasks={filteredTasks.filter(t => t.start_date || t.due_date)}
                onTaskClick={(task) => {
                  setSelectedTask(task);
                  setIsTaskModalOpen(true);
                }}
                dependencies={taskDependencies}
              />
            ) : viewMode === 'dashboard' ? (
              <TasksDashboard
                tasks={filteredTasks}
                board={selectedBoard}
                customFields={customFields}
              />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-neutral-50 border-b border-neutral-200">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
                          onChange={handleSelectAll}
                          className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Task</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Assignee</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Due Date</th>
                      {customFields.map((field) => (
                        <th key={field.id} className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">
                          {field.name}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-700 uppercase">Group</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {filteredTasks.map((task) => (
                      <tr
                        key={task.id}
                        className={`hover:bg-neutral-50 transition-colors ${
                          selectedTaskIds.has(task.id) ? 'bg-brand-purple/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(task.id)}
                            onChange={(e) => handleTaskSelect(task.id, e.target.checked)}
                            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                          />
                        </td>
                        <td 
                          className="px-4 py-3 cursor-pointer"
                          onClick={() => {
                            setSelectedTask(task);
                            setIsTaskModalOpen(true);
                          }}
                        >
                          <div className="font-medium text-sm text-neutral-900">{task.name}</div>
                          {task.description && (
                            <div className="text-xs text-neutral-500 mt-1 line-clamp-1">{task.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            task.status === 'done' ? 'bg-green-100 text-green-700' :
                            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            task.status === 'blocked' ? 'bg-red-100 text-red-700' :
                            'bg-neutral-100 text-neutral-700'
                          }`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                            task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-neutral-100 text-neutral-700'
                          }`}>
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">
                          {task.assignee_email ? (task.assignee_first_name || task.assignee_email) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">
                          {task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}
                        </td>
                        {customFields.map((field) => {
                          const fieldValue = task.custom_field_values?.find(fv => fv.field_id === field.id);
                          return (
                            <td key={field.id} className="px-4 py-3">
                              <CustomFieldRenderer field={field} value={fieldValue} />
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-sm text-neutral-700">{task.group_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredTasks.length === 0 && (
                  <div className="text-center py-12 text-neutral-500">
                    No tasks found
                  </div>
                )}
              </div>
            )}

            {/* Create Board Modal */}
            {isCreateBoardModalOpen && (
              <Dialog open={isCreateBoardModalOpen} onClose={() => setIsCreateBoardModalOpen(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                  <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">Create New Board</DialogTitle>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Board Name</label>
                        <input
                          type="text"
                          value={newBoardName}
                          onChange={(e) => setNewBoardName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleCreateBoard()}
                          placeholder="Enter board name..."
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                          autoFocus
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setIsCreateBoardModalOpen(false)}
                          className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateBoard}
                          disabled={!newBoardName.trim()}
                          className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  </DialogPanel>
                </div>
              </Dialog>
            )}

            {/* Create Task Modal */}
            {isCreateTaskModalOpen && selectedBoard && (
              <Dialog open={isCreateTaskModalOpen} onClose={() => setIsCreateTaskModalOpen(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                  <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
                    <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">Create New Task</DialogTitle>
                    {(!selectedBoard.groups || selectedBoard.groups.length === 0) ? (
                      <div className="space-y-4">
                        <p className="text-sm text-neutral-600">
                          This board doesn't have any groups yet. Please refresh the page or create a group first.
                        </p>
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setIsCreateTaskModalOpen(false);
                              fetchBoardData(selectedBoard.id);
                            }}
                            className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy"
                          >
                            Refresh
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">Task Name</label>
                          <input
                            type="text"
                            value={newTask.name}
                            onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                            placeholder="Enter task name..."
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                            autoFocus
                            onKeyPress={(e) => e.key === 'Enter' && newTask.name.trim() && newTask.group_id && handleCreateTask()}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                          <textarea
                            value={newTask.description}
                            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                            placeholder="Enter task description..."
                            rows={3}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Group</label>
                            <select
                              value={newTask.group_id}
                              onChange={(e) => setNewTask({ ...newTask, group_id: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                            >
                              <option value="">Select group...</option>
                              {selectedBoard.groups?.map(group => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">Priority</label>
                            <select
                              value={newTask.priority}
                              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setIsCreateTaskModalOpen(false);
                              setNewTask({ name: '', description: '', group_id: '', status: 'todo', priority: 'medium' });
                            }}
                            className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleCreateTask}
                            disabled={!newTask.name.trim() || !newTask.group_id}
                            className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Create
                          </button>
                        </div>
                      </div>
                    )}
                  </DialogPanel>
                </div>
              </Dialog>
            )}

            {/* Task Detail Modal */}
            {selectedTask && (
              <TaskDetailModal
                task={selectedTask}
                isOpen={isTaskModalOpen}
                onClose={() => {
                  setIsTaskModalOpen(false);
                  setSelectedTask(null);
                }}
                onUpdate={handleUpdateTask}
                onAddComment={() => fetchBoardData(selectedBoard.id)}
                customFields={customFields}
              />
            )}

            {/* Workflow Templates Gallery */}
            <TaskWorkflowTemplatesGallery
              isOpen={isWorkflowGalleryOpen}
              onClose={() => setIsWorkflowGalleryOpen(false)}
              currentBoardId={selectedBoard?.id}
            />

            {/* Automation Manager */}
            <TaskAutomationManager
              isOpen={isAutomationManagerOpen}
              onClose={() => setIsAutomationManagerOpen(false)}
              currentBoardId={selectedBoard?.id}
            />

            {/* Bulk Actions */}
            {selectedTaskIds.size > 0 && (
              <BulkActions
                selectedTasks={filteredTasks.filter(t => selectedTaskIds.has(t.id))}
                onDeselectAll={() => setSelectedTaskIds(new Set())}
                onBulkUpdate={handleBulkUpdate}
                availableGroups={selectedBoard?.groups || []}
              />
            )}

            {/* Grouping Modal */}
            {isGroupingModalOpen && (
              <Dialog open={isGroupingModalOpen} onClose={() => setIsGroupingModalOpen(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                  <DialogPanel className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6">
                    <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">Grouping Options</DialogTitle>
                    <GroupingOptions
                      groupBy={groupBy}
                      onGroupByChange={setGroupBy}
                      customFields={customFields}
                      aggregations={aggregations}
                      onAggregationChange={(field, aggType) => {
                        setAggregations({ ...aggregations, [field]: aggType });
                      }}
                    />
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                      <button
                        onClick={() => setIsGroupingModalOpen(false)}
                        className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
                      >
                        Close
                      </button>
                    </div>
                  </DialogPanel>
                </div>
              </Dialog>
            )}

            {/* Sorting Modal */}
            {isSortingModalOpen && (
              <Dialog open={isSortingModalOpen} onClose={() => setIsSortingModalOpen(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                  <DialogPanel className="w-full max-w-2xl bg-white rounded-xl shadow-xl p-6">
                    <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">Sorting Options</DialogTitle>
                    <SortingOptions
                      sorts={sorts}
                      onSortsChange={setSorts}
                      customFields={customFields}
                    />
                    <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                      <button
                        onClick={() => setIsSortingModalOpen(false)}
                        className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
                      >
                        Close
                      </button>
                    </div>
                  </DialogPanel>
                </div>
              </Dialog>
            )}

            {/* Custom Fields Manager Modal */}
            {isCustomFieldsModalOpen && selectedBoard && (
              <Dialog open={isCustomFieldsModalOpen} onClose={() => {
                setIsCustomFieldsModalOpen(false);
                setEditingField(null);
              }} className="relative z-50">
                <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                  <DialogPanel className="w-full max-w-4xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
                      <DialogTitle className="text-lg font-semibold text-neutral-900">
                        Custom Fields - {selectedBoard.name}
                      </DialogTitle>
                      <div className="flex items-center gap-2">
                        {!editingField && (
                          <button
                            onClick={() => setEditingField({})}
                            className="px-3 py-1.5 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy"
                          >
                            <PlusIcon className="h-4 w-4 inline mr-1" />
                            New Field
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setIsCustomFieldsModalOpen(false);
                            setEditingField(null);
                          }}
                          className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      {editingField ? (
                    <CustomFieldEditor
                      field={editingField}
                      boardId={selectedBoard.id}
                      onSave={handleSaveCustomField}
                      onCancel={() => setEditingField(null)}
                      onDelete={editingField.id ? () => handleDeleteCustomField(editingField.id) : null}
                      availableFields={customFields}
                    />
                      ) : (
                        <div className="space-y-4">
                          {customFields.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500">
                              <p className="mb-4">No custom fields yet.</p>
                              <button
                                onClick={() => setEditingField({})}
                                className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy"
                              >
                                Create First Field
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {customFields.map((field) => (
                                <div
                                  key={field.id}
                                  className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium text-neutral-900">{field.name}</span>
                                      <span className="px-2 py-0.5 bg-neutral-200 text-neutral-700 text-xs rounded">
                                        {field.field_type}
                                        {field.field_subtype && ` (${field.field_subtype})`}
                                      </span>
                                      {field.is_required && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                          Required
                                        </span>
                                      )}
                                    </div>
                                    {field.field_config && Object.keys(field.field_config).length > 0 && (
                                      <p className="text-xs text-neutral-500">
                                        Config: {JSON.stringify(field.field_config).substring(0, 100)}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setEditingField(field)}
                                    className="px-3 py-1.5 text-sm text-brand-purple hover:bg-brand-purple/10 rounded-lg"
                                  >
                                    Edit
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </DialogPanel>
                </div>
              </Dialog>
            )}
          </div>

        <ConfirmationModal
          isOpen={confirmState.isOpen}
          onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
          onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
          title={confirmState.title}
          message={confirmState.message}
        />
      </BranchProvider>
    </RoleProvider>
  );
}

