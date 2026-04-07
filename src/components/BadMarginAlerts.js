import React, { useState, useEffect } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useToast } from '../hooks/useToast';
import { formatCurrency } from '../utils/formatters';

const BadMarginAlerts = () => {
  const toast = useToast();
  const [config, setConfig] = useState({
    margin_threshold: 29.00,
    alert_emails: ['support@acmeops.com'],
    exception_service_ids: [],
    exception_labels: ['school', 'non', 'support'],
    enabled: true
  });
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [editingEmail, setEditingEmail] = useState('');
  const [editingServiceId, setEditingServiceId] = useState('');
  const [editingLabel, setEditingLabel] = useState('');
  const [migrationMessage, setMigrationMessage] = useState(null);

  useEffect(() => {
    fetchConfig();
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [filterStatus, page]);

  const fetchConfig = async () => {
    try {
      const response = await axios.get('/api/bad-margin-alerts/config');
      // Ensure all array fields are arrays, not null
      const data = response.data || {};
      setConfig({
        ...data,
        alert_emails: Array.isArray(data.alert_emails) ? data.alert_emails : (data.alert_emails ? [data.alert_emails] : ['support@acmeops.com']),
        exception_service_ids: Array.isArray(data.exception_service_ids) ? data.exception_service_ids : [],
        exception_labels: Array.isArray(data.exception_labels) ? data.exception_labels : []
      });
      setMigrationMessage(null);
    } catch (error) {
      console.error('Error fetching config:', error);
      if (error.response?.data?.message) {
        setMigrationMessage(error.response.data.message);
      }
    }
  };

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = {
        limit: 20,
        offset: page * 20
      };
      if (filterStatus !== 'all') {
        params.status = filterStatus;
      }
      const response = await axios.get('/api/bad-margin-alerts/alerts', { params });
      setAlerts(response.data.alerts || []);
      setTotalAlerts(response.data.total || 0);
      if (response.data.message) {
        setMigrationMessage(response.data.message);
      } else {
        setMigrationMessage(null);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
      if (error.response?.data?.message) {
        setMigrationMessage(error.response.data.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await axios.get('/api/bad-margin-alerts/alerts/summary');
      setSummary(response.data);
      if (response.data.message) {
        setMigrationMessage(response.data.message);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
      if (error.response?.data?.message) {
        setMigrationMessage(error.response.data.message);
      }
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await axios.put('/api/bad-margin-alerts/config', config);
      toast.success('Configuration saved successfully!');
      setMigrationMessage(null);
      fetchConfig();
    } catch (error) {
      console.error('Error saving config:', error);
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      toast.error('Error saving configuration: ' + errorMsg);
      if (error.response?.data?.message) {
        setMigrationMessage(error.response.data.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const updateAlertStatus = async (alertId, newStatus, notes = '') => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const resolvedBy = user.email || user.name || 'Unknown';
      await axios.put(`/api/bad-margin-alerts/alerts/${alertId}/status`, {
        status: newStatus,
        resolved_by: newStatus === 'resolved' ? resolvedBy : undefined,
        resolution_notes: notes || undefined
      });
      fetchAlerts();
      fetchSummary();
      toast.success('Alert status updated!');
    } catch (error) {
      console.error('Error updating alert status:', error);
      toast.error('Error updating alert status: ' + (error.response?.data?.error || error.message));
    }
  };

  const addEmail = () => {
    if (editingEmail && !config.alert_emails.includes(editingEmail)) {
      setConfig({
        ...config,
        alert_emails: [...config.alert_emails, editingEmail]
      });
      setEditingEmail('');
    }
  };

  const removeEmail = (email) => {
    setConfig({
      ...config,
      alert_emails: config.alert_emails.filter(e => e !== email)
    });
  };

  const addServiceException = () => {
    const serviceId = parseInt(editingServiceId);
    if (serviceId && !config.exception_service_ids.includes(serviceId)) {
      setConfig({
        ...config,
        exception_service_ids: [...config.exception_service_ids, serviceId]
      });
      setEditingServiceId('');
    }
  };

  const removeServiceException = (serviceId) => {
    setConfig({
      ...config,
      exception_service_ids: config.exception_service_ids.filter(id => id !== serviceId)
    });
  };

  const addLabelException = () => {
    if (editingLabel && !config.exception_labels.includes(editingLabel)) {
      setConfig({
        ...config,
        exception_labels: [...config.exception_labels, editingLabel]
      });
      setEditingLabel('');
    }
  };

  const removeLabelException = (label) => {
    setConfig({
      ...config,
      exception_labels: config.exception_labels.filter(l => l !== label)
    });
  };


  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      case 'ignored': return 'bg-neutral-100 text-neutral-800';
      default: return 'bg-neutral-100 text-neutral-800';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 mb-4">Bad Margin Alerts</h2>
        <p className="text-neutral-600 mb-6">
          Configure and monitor alerts for lessons with low profit margins. The system will automatically send email alerts when a lesson's margin falls below the configured threshold.
        </p>
        
        {migrationMessage && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Setup Required:</strong> {migrationMessage}
                  <br />
                  <code className="mt-2 block bg-yellow-100 px-2 py-1 rounded text-xs">
                    psql -d your_database &lt; migrations/add_bad_margin_alerts.sql
                  </code>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-neutral-600">Total Alerts</div>
            <div className="text-2xl font-bold text-neutral-900">{summary.total}</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg shadow">
            <div className="text-sm text-red-600">Open</div>
            <div className="text-2xl font-bold text-red-900">{summary.open}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg shadow">
            <div className="text-sm text-green-600">Resolved</div>
            <div className="text-2xl font-bold text-green-900">{summary.resolved}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-neutral-600">Open Losses</div>
            <div className="text-2xl font-bold text-red-900">
              {summary.by_status?.open?.loss_count || 0}
            </div>
          </div>
        </div>
      )}

      {/* Configuration Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Margin Threshold (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={config.margin_threshold}
              onChange={(e) => setConfig({ ...config, margin_threshold: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Alerts will be sent when lesson margin falls below this percentage (default: 29%)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Alert Emails
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                value={editingEmail}
                onChange={(e) => setEditingEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                placeholder="Enter email address"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addEmail}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.alert_emails.map((email, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-100 text-indigo-800"
                >
                  {email}
                  <button
                    onClick={() => removeEmail(email)}
                    className="ml-2 text-indigo-600 hover:text-indigo-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Exception Service IDs
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                value={editingServiceId}
                onChange={(e) => setEditingServiceId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addServiceException()}
                placeholder="Enter service ID"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addServiceException}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.exception_service_ids.map((id, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-neutral-100 text-neutral-800"
                >
                  {id}
                  <button
                    onClick={() => removeServiceException(id)}
                    className="ml-2 text-neutral-600 hover:text-neutral-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Exception Labels
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={editingLabel}
                onChange={(e) => setEditingLabel(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addLabelException()}
                placeholder="Enter label name or substring"
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addLabelException}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.exception_labels.map((label, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-neutral-100 text-neutral-800"
                >
                  {label}
                  <button
                    onClick={() => removeLabelException(label)}
                    className="ml-2 text-neutral-600 hover:text-neutral-800"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="enabled"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-neutral-300 rounded"
            />
            <label htmlFor="enabled" className="ml-2 block text-sm text-neutral-900">
              Enable Bad Margin Alerts
            </label>
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Alert History Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Alert History</h3>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(0);
            }}
            className="px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">No alerts found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Lesson ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Tutor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Revenue</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Cost</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Margin</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 text-sm text-neutral-900">
                        {dayjs(alert.alert_sent_at).format('MMM D, YYYY h:mm A')}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={alert.tutorcruncher_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          {alert.appointment_id}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-900">{alert.service_name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-900">{alert.tutor_name}</td>
                      <td className="px-4 py-3 text-sm text-neutral-900">{formatCurrency(alert.total_revenue)}</td>
                      <td className="px-4 py-3 text-sm text-neutral-900">
                        {formatCurrency(alert.total_tutor_cost)}
                        {alert.student_premium > 0 && (
                          <div className="text-xs text-neutral-500">
                            (Base: {formatCurrency(alert.base_tutor_cost)}, Premium: {formatCurrency(alert.student_premium)})
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold ${parseFloat(alert.margin_percentage) < 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {parseFloat(alert.margin_percentage).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(alert.status)}`}>
                          {alert.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <select
                          value={alert.status}
                          onChange={(e) => updateAlertStatus(alert.id, e.target.value)}
                          className="text-xs border border-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="ignored">Ignored</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-neutral-700">
                Showing {page * 20 + 1} to {Math.min((page + 1) * 20, totalAlerts)} of {totalAlerts} alerts
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * 20 >= totalAlerts}
                  className="px-3 py-1 border border-neutral-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BadMarginAlerts;
