import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  XMarkIcon,
  PlusIcon,
  BoltIcon,
  ClockIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';

export default function TaskAutomationManager({ isOpen, onClose, currentBoardId }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const toast = useToast(); // 'all', 'status_change', 'date_based', 'external_event'

  useEffect(() => {
    if (isOpen) {
      fetchRules();
    }
  }, [isOpen, activeTab]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') {
        params.append('trigger_type', activeTab);
      }
      if (currentBoardId) {
        params.append('board_id', currentBoardId);
      }

      const response = await fetch(`/api/tasks/automation/rules?${params}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error('Error fetching automation rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRule = async (ruleId, currentState) => {
    try {
      const response = await fetch(`/api/tasks/automation/rules/${ruleId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentState })
      });

      if (response.ok) {
        fetchRules();
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  const handleDeleteRule = (ruleId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Automation Rule',
      message: 'Are you sure you want to delete this automation rule?',
      action: async () => {
        try {
          const response = await fetch(`/api/tasks/automation/rules/${ruleId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (response.ok) {
            fetchRules();
          }
        } catch (error) {
          console.error('Error deleting rule:', error);
        }
      }
    });
  };

  const getTriggerIcon = (triggerType) => {
    switch (triggerType) {
      case 'status_change': return <CheckCircleIcon className="h-5 w-5" />;
      case 'date_based': return <ClockIcon className="h-5 w-5" />;
      case 'external_event': return <BoltIcon className="h-5 w-5" />;
      default: return <BoltIcon className="h-5 w-5" />;
    }
  };

  const getTriggerColor = (triggerType) => {
    switch (triggerType) {
      case 'status_change': return 'bg-green-100 text-green-700 border-green-300';
      case 'date_based': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'external_event': return 'bg-purple-100 text-purple-700 border-purple-300';
      default: return 'bg-neutral-100 text-neutral-700 border-neutral-300';
    }
  };

  const formatTriggerType = (type) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatTriggerDescription = (rule) => {
    const config = rule.trigger_config;
    
    switch (rule.trigger_type) {
      case 'status_change':
        return `When status changes ${config.from_status ? `from "${config.from_status}"` : ''} ${config.to_status ? `to "${config.to_status}"` : ''}`.trim();
      case 'date_based':
        return `${config.schedule || 'Daily'} ${config.relative_to ? `relative to ${config.relative_to}` : ''}`.trim();
      case 'external_event':
        return `On ${config.event_type || 'event'}`;
      default:
        return 'Custom trigger';
    }
  };

  const formatActions = (actions) => {
    if (!Array.isArray(actions)) return [];
    return actions.map(action => {
      switch (action.type) {
        case 'create_task':
          return `Create task: "${action.config?.name || 'New task'}"`;
        case 'update_field':
          return `Update field: ${Object.keys(action.config || {}).join(', ')}`;
        case 'send_notification':
          return `Send notification to ${action.config?.to || 'recipient'}`;
        case 'create_dependency':
          return 'Create task dependency';
        case 'execute_workflow':
          return 'Execute workflow template';
        default:
          return action.type;
      }
    });
  };

  const tabs = [
    { id: 'all', label: 'All Rules', icon: BoltIcon },
    { id: 'status_change', label: 'Status Change', icon: CheckCircleIcon },
    { id: 'date_based', label: 'Date Based', icon: ClockIcon },
    { id: 'external_event', label: 'External Event', icon: BoltIcon },
  ];

  return (
    <>
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-5xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between bg-gradient-to-r from-brand-purple/5 to-brand-navy/5">
            <div className="flex items-center gap-3">
              <BoltIcon className="h-6 w-6 text-brand-purple" />
              <DialogTitle className="text-lg font-semibold text-neutral-900">
                Automation Rules
              </DialogTitle>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-neutral-100 text-neutral-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-neutral-200 bg-neutral-50">
            <div className="flex items-center gap-2 px-6 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-brand-purple text-brand-purple'
                        : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
                <p className="mt-4 text-neutral-600">Loading automation rules...</p>
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12">
                <BoltIcon className="h-16 w-16 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-500 mb-2">No automation rules found</p>
                <p className="text-sm text-neutral-400">
                  {activeTab === 'all' 
                    ? 'Create automation rules to automate your task management'
                    : `No ${formatTriggerType(activeTab)} rules configured`}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`bg-white rounded-lg border p-4 transition-all duration-200 ${
                      rule.is_enabled 
                        ? 'border-neutral-200 hover:border-brand-purple/30 hover:shadow-md' 
                        : 'border-neutral-200 bg-neutral-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-sm font-semibold text-neutral-900">{rule.name}</h4>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getTriggerColor(rule.trigger_type)}`}>
                            {getTriggerIcon(rule.trigger_type)}
                            {formatTriggerType(rule.trigger_type)}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-xs text-neutral-600 mb-2">{rule.description}</p>
                        )}
                        <p className="text-xs text-neutral-500">{formatTriggerDescription(rule)}</p>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.is_enabled}
                            onChange={() => handleToggleRule(rule.id, rule.is_enabled)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-purple/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-purple"></div>
                        </label>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                          title="Delete rule"
                        >
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-3 pt-3 border-t border-neutral-200">
                      <p className="text-xs font-medium text-neutral-700 mb-2">Actions:</p>
                      <div className="flex flex-wrap gap-2">
                        {formatActions(rule.actions).map((actionDesc, index) => (
                          <span
                            key={index}
                            className="inline-block px-2 py-1 bg-neutral-100 text-neutral-700 rounded text-xs"
                          >
                            {actionDesc}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="mt-3 pt-3 border-t border-neutral-200 flex items-center gap-4 text-xs text-neutral-500">
                      <span>Executed: {rule.execution_count || 0} times</span>
                      {rule.last_executed_at && (
                        <span>Last run: {new Date(rule.last_executed_at).toLocaleDateString()}</span>
                      )}
                      {rule.max_executions && (
                        <span>Limit: {rule.max_executions} executions</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex justify-between items-center">
            <p className="text-sm text-neutral-600">
              {rules.length} {rules.length === 1 ? 'rule' : 'rules'} configured
            </p>
            <button
              onClick={() => toast.info('Automation rule builder coming soon!')}
              className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy transition-colors flex items-center gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Create Rule
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>

    <ConfirmationModal
      isOpen={confirmState.isOpen}
      onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
      onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
      title={confirmState.title}
      message={confirmState.message}
    />
    </>
  );
}

