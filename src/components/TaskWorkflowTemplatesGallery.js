import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  XMarkIcon,
  PlayIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  Bars3Icon
} from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

export default function TaskWorkflowTemplatesGallery({ isOpen, onClose, currentBoardId }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(null);
  const toast = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);
  const [executeConfig, setExecuteConfig] = useState({
    board_id: currentBoardId || '',
    default_assignee: '',
    context_data: {}
  });

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentBoardId) {
      setExecuteConfig(prev => ({ ...prev, board_id: currentBoardId }));
    }
  }, [currentBoardId]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/tasks/workflows/templates?is_active=true', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteClick = (template) => {
    setSelectedTemplate(template);
    setShowExecuteDialog(true);
  };

  const handleExecute = async () => {
    if (!selectedTemplate) return;

    setExecuting(selectedTemplate.id);
    try {
      const response = await fetch(`/api/tasks/workflows/${selectedTemplate.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(executeConfig)
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Workflow executed successfully! Created ${data.created_task_ids.length} tasks.`);
        setShowExecuteDialog(false);
        onClose();
        // Refresh the board
        window.location.reload();
      } else {
        const error = await response.json();
        toast.error(`Failed to execute workflow: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('Failed to execute workflow');
    } finally {
      setExecuting(null);
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'franchise_onboarding': return '🎯';
      case 'event_setup': return '🎪';
      case 'sales_funnel': return '💼';
      case 'marketing_campaign': return '📢';
      case 'tutor_onboarding': return '👨‍🏫';
      default: return '📋';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'franchise_onboarding': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'event_setup': return 'bg-pink-100 text-pink-700 border-pink-300';
      case 'sales_funnel': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'marketing_campaign': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'tutor_onboarding': return 'bg-green-100 text-green-700 border-green-300';
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-300';
    }
  };

  const formatCategoryName = (category) => {
    return category?.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Other';
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  return (
    <>
      <Dialog open={isOpen} onClose={onClose} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-6xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-gradient-to-r from-brand-purple/5 to-brand-navy/5">
              <div className="flex items-center gap-3">
                <SparklesIcon className="h-6 w-6 text-brand-purple" />
                <DialogTitle className="text-lg font-semibold text-neutral-900">
                  Workflow Templates Gallery
                </DialogTitle>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
                  <p className="mt-4 text-neutral-600">Loading templates...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardDocumentListIcon className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
                  <p className="text-neutral-500">No workflow templates available</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-2xl">{getCategoryIcon(category)}</span>
                        <h3 className="text-lg font-semibold text-neutral-900">{formatCategoryName(category)}</h3>
                        <span className="text-sm text-neutral-500">({categoryTemplates.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {categoryTemplates.map((template) => {
                          const taskCount = Array.isArray(template.template_data) ? template.template_data.length : 0;
                          const groups = template.default_groups || [];
                          
                          return (
                            <div
                              key={template.id}
                              className="bg-white rounded-lg border border-neutral-200 p-4 hover:shadow-md hover:border-brand-purple/30 transition-all duration-200"
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="text-sm font-semibold text-neutral-900 leading-tight mb-1">
                                    {template.name}
                                  </h4>
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${getCategoryColor(category)}`}>
                                    {formatCategoryName(category)}
                                  </span>
                                </div>
                              </div>

                              {template.description && (
                                <p className="text-xs text-neutral-600 mb-3 line-clamp-2 leading-relaxed">
                                  {template.description}
                                </p>
                              )}

                              <div className="space-y-2 mb-3">
                                <div className="flex items-center gap-2 text-xs text-neutral-600">
                                  <ClipboardDocumentListIcon className="h-4 w-4" />
                                  <span>{taskCount} tasks</span>
                                </div>
                                {groups.length > 0 && (
                                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                                    <Bars3Icon className="h-4 w-4" />
                                    <span>{groups.length} groups</span>
                                  </div>
                                )}
                                {template.execution_count > 0 && (
                                  <div className="flex items-center gap-2 text-xs text-neutral-600">
                                    <PlayIcon className="h-4 w-4" />
                                    <span>Used {template.execution_count} times</span>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handleExecuteClick(template)}
                                disabled={executing === template.id}
                                className="w-full px-3 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                              >
                                {executing === template.id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                    <span>Executing...</span>
                                  </>
                                ) : (
                                  <>
                                    <PlayIcon className="h-4 w-4" />
                                    <span>Execute Workflow</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Execute Workflow Dialog */}
      {showExecuteDialog && selectedTemplate && (
        <Dialog open={showExecuteDialog} onClose={() => setShowExecuteDialog(false)} className="relative z-popover">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <DialogPanel className="w-full max-w-md bg-white rounded-xl shadow-xl p-6">
              <DialogTitle className="text-lg font-semibold text-neutral-900 mb-4">
                Execute: {selectedTemplate.name}
              </DialogTitle>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Board {!currentBoardId && <span className="text-red-600">*</span>}
                  </label>
                  <p className="text-xs text-neutral-500 mb-2">
                    {currentBoardId 
                      ? 'Tasks will be created in the current board' 
                      : 'A new board will be created for this workflow'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Default Assignee (Optional)
                  </label>
                  <input
                    type="text"
                    value={executeConfig.default_assignee}
                    onChange={(e) => setExecuteConfig({ ...executeConfig, default_assignee: e.target.value })}
                    placeholder="Email or user ID"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Assign all tasks to this user by default
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    This will create {Array.isArray(selectedTemplate.template_data) ? selectedTemplate.template_data.length : 0} tasks 
                    {selectedTemplate.default_groups?.length > 0 && ` across ${selectedTemplate.default_groups.length} groups`}.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowExecuteDialog(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {executing ? 'Executing...' : 'Execute'}
                </button>
              </div>
            </DialogPanel>
          </div>
        </Dialog>
      )}
    </>
  );
}

