import React from 'react';
import { getLabelColor, getContrastColor } from '../../../utils/labelColors';
import { useResizableColumns, ResizeHandle } from '../useResizableColumns';

/**
 * TakeoverView - View for takeover clients
 *
 * Displays clients with "Takeover" label, with label-based filtering (home, online, school, club).
 */
export default function TakeoverView({
  clients,
  takeoverLabelFilter,
  setTakeoverLabelFilter,
  hasSchoolLabel,
  hasClubLabel,
  formatDate,
  setSelectedProspect,
  setShowProspectModal,
  getMarketLabel,
  getLeadTypeChipColors,
}) {
  const { columnWidths, handleResizeStart } = useResizableColumns('columnWidths_cctTakeover_main');

  // Helper function to check for Home label
  const hasHomeLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName && labelName.startsWith('Home -');
    });
  };

  // Helper function to check for Online label
  const hasOnlineLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName === 'Online';
    });
  };

  // Pipeline stage determines tab when a client has multiple label types
  const getClientPipelineStage = (client) => {
    return (client.pipeline_stage || client.pipeline_name || '').toLowerCase();
  };

  // Private = Home + Online combined, but NOT if pipeline stage puts them in Club
  const hasPrivateLabel = (client) => {
    const stage = getClientPipelineStage(client);
    if (stage === 'clubs') return false;
    return hasHomeLabel(client) || hasOnlineLabel(client);
  };

  // Helper function to check for Takeover label
  const hasTakeoverLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName === 'Takeover';
    });
  };

  // Filter to only show clients with "Takeover" label
  const allTakeoverClients = Array.isArray(clients)
    ? clients.filter(client => hasTakeoverLabel(client))
    : [];

  // Filter by label type if selected
  const filteredClients = takeoverLabelFilter 
    ? allTakeoverClients.filter(client => {
        if (takeoverLabelFilter === 'private') {
          return hasPrivateLabel(client);
        } else if (takeoverLabelFilter === 'school') {
          return hasSchoolLabel(client);
        } else if (takeoverLabelFilter === 'club') {
          return hasClubLabel(client);
        }
        return true;
      })
    : allTakeoverClients;

  // Count clients by label type
  const privateCount = allTakeoverClients.filter(hasPrivateLabel).length;
  const schoolCount = allTakeoverClients.filter(hasSchoolLabel).length;
  const clubCount = allTakeoverClients.filter(hasClubLabel).length;

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-neutral-900 mb-4">
                Takeover Clients ({filteredClients.length} clients)
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                Clients who were taken over from another provider or service.
              </p>

              {/* Label Filter Tabs */}
              <div className="mb-6">
                <div className="border-b border-neutral-200">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setTakeoverLabelFilter(null)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        takeoverLabelFilter === null
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      All ({allTakeoverClients.length})
                    </button>
                    <button
                      onClick={() => setTakeoverLabelFilter('private')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        takeoverLabelFilter === 'private'
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      Private ({privateCount})
                    </button>
                    <button
                      onClick={() => setTakeoverLabelFilter('school')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        takeoverLabelFilter === 'school'
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      School ({schoolCount})
                    </button>
                    <button
                      onClick={() => setTakeoverLabelFilter('club')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        takeoverLabelFilter === 'club'
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      Club ({clubCount})
                    </button>
                  </nav>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.client || 180 }}>Client<ResizeHandle colKey="client" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.status || 100 }}>Status<ResizeHandle colKey="status" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.pipelineStage || 140 }}>Pipeline Stage<ResizeHandle colKey="pipelineStage" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.market || 100 }}>Market<ResizeHandle colKey="market" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.leadType || 120 }}>Lead Type<ResizeHandle colKey="leadType" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.tutorPaired || 160 }}>Tutor Paired<ResizeHandle colKey="tutorPaired" onResizeStart={handleResizeStart} /></th>
                      <th className="relative px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.archivedDate || 130 }}>Archived Date<ResizeHandle colKey="archivedDate" onResizeStart={handleResizeStart} /></th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.clientSpend || 120 }}>Client Spend</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredClients.map((client) => (
                      <tr key={client.id || client.client_id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedProspect(client);
                              setShowProspectModal(true);
                            }}
                            className="text-left text-sm font-medium text-primary-500 hover:text-primary-700 hover:underline cursor-pointer"
                          >
                            {client.first_name || ''} {client.last_name || ''}
                          </button>
                          <div className="text-xs text-neutral-500">{client.email || ''}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            client.client_status === 'live' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                            client.client_status === 'prospect' ? 'bg-[#E8FBFF] text-[#3BA8BD]' :
                            client.client_status === 'archived' ? 'bg-neutral-100 text-neutral-800' :
                            client.client_status === 'dormant' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                            'bg-neutral-100 text-neutral-800'
                          }`}>
                            {client.client_status || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {client.pipeline_stage || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {getMarketLabel(client)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {client.lead_type ? (
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getLeadTypeChipColors(client.lead_type)}`}>
                              {client.lead_type}
                            </span>
                          ) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {client.assigned_tutor_name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {client.archived_at ? formatDate(client.archived_at) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {client.client_spend !== undefined && client.client_spend !== null
                            ? `$${parseFloat(client.client_spend).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                    {filteredClients.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-4 text-center text-sm text-neutral-500">
                          No takeover clients found{takeoverLabelFilter ? ` with ${takeoverLabelFilter} label` : ''}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
  );
}
