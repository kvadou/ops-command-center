import React from 'react';
import { getLabelColor, getContrastColor } from '../../../utils/labelColors';
import AutomationInfoIndicator from '../AutomationInfoIndicator';
import { useResizableColumns, ResizeHandle } from '../useResizableColumns';

/**
 * WonLostView - Archive view for won and lost clients
 *
 * Displays won/lost clients with label-based filtering (home, online, school, club).
 */
export default function WonLostView({
  activeTab,
  archivedClients,
  archiveLabelFilter,
  setArchiveLabelFilter,
  hasSchoolLabel,
  hasClubLabel,
  handleReviveProspect,
  formatDate,
  getMarketLabel,
  getLeadTypeChipColors,
  getStatusBackgroundColor,
  getStatusTextColor,
  handleProspectStatusUpdate,
  setSelectedProspect,
  setShowProspectModal,
  // Tutor search props
  showTutorDropdown,
  setShowTutorDropdown,
  tutorSearchQuery,
  setTutorSearchQuery,
  tutorSearchResults,
  setTutorSearchResults,
  searchTutors,
  updateAssignedTutor,
  highlightedTutorIndex,
  setHighlightedTutorIndex,
  tutorSearchResultsRef,
  highlightedTutorIndexRef,
  previousTutorQueryRef,
}) {
  const { columnWidths, handleResizeStart } = useResizableColumns('columnWidths_cctWonLost_wonLostClients');

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

  // Filter archived clients by won/lost status
  // For Lost tab: include ONLY prospects with prospect_status = 'Lost' (exclude revived prospects)
  // For Won tab: include live clients OR prospects with prospect_status = 'Won'
  const filteredByStatus = archivedClients.filter(client => {
    if (activeTab === 'won') {
      return client.client_status === 'live' || client.prospect_status === 'Won';
    } else {
      // Only show clients with prospect_status = 'Lost'
      // Exclude clients that were revived (prospect_status changed from 'Lost' to something else)
      return client.prospect_status === 'Lost';
    }
  });

  // Filter by label type if selected
  const filteredClients = archiveLabelFilter 
    ? filteredByStatus.filter(client => {
        if (archiveLabelFilter === 'private') {
          return hasPrivateLabel(client);
        } else if (archiveLabelFilter === 'school') {
          return hasSchoolLabel(client);
        } else if (archiveLabelFilter === 'club') {
          return hasClubLabel(client);
        }
        return true;
      })
    : filteredByStatus;

  // Count clients by label type
  const privateCount = filteredByStatus.filter(hasPrivateLabel).length;
  const schoolCount = filteredByStatus.filter(hasSchoolLabel).length;
  const clubCount = filteredByStatus.filter(hasClubLabel).length;

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 pt-1 pb-3 sm:px-6 sm:pt-1 sm:pb-3">
              {/* Label Filter Tabs */}
              <div className="mb-2">
                <div className="border-b border-neutral-200">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setArchiveLabelFilter(null)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        archiveLabelFilter === null
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      All ({filteredByStatus.length})
                    </button>
                    <button
                      onClick={() => setArchiveLabelFilter('private')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        archiveLabelFilter === 'private'
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      Private ({privateCount})
                    </button>
                    <button
                      onClick={() => setArchiveLabelFilter('school')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        archiveLabelFilter === 'school'
                          ? 'border-primary-500 text-primary-500'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      School ({schoolCount})
                    </button>
                    <button
                      onClick={() => setArchiveLabelFilter('club')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        archiveLabelFilter === 'club'
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
              <table className="w-full divide-y divide-neutral-200 table-fixed">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.client || 160 }}>Client<ResizeHandle colKey="client" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.status || 70 }}>Status<ResizeHandle colKey="status" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.pipelineStage || 110 }}>Pipeline Stage<ResizeHandle colKey="pipelineStage" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.market || 80 }}>Market<ResizeHandle colKey="market" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.leadType || 100 }}>Lead Type<ResizeHandle colKey="leadType" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.tutorPaired || 140 }}>Tutor Paired<ResizeHandle colKey="tutorPaired" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.prospectStatus || 130 }}>Prospect Status<ResizeHandle colKey="prospectStatus" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.archivedDate || 110 }}>Archived Date<ResizeHandle colKey="archivedDate" onResizeStart={handleResizeStart} /></th>
                    <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.reason || 100 }}>Reason<ResizeHandle colKey="reason" onResizeStart={handleResizeStart} /></th>
                    {activeTab === 'lost' ? (
                      <>
                        <th className="relative px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.clientSpend || 120 }}>Client Spend<ResizeHandle colKey="clientSpend" onResizeStart={handleResizeStart} /></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.actions || 100 }}>Actions</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.clientSpend || 120 }}>Client Spend</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredClients.map((client) => (
                    <tr key={client.id || client.client_id}>
                      <td className="px-3 py-2 whitespace-nowrap">
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          client.client_status === 'live' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                          client.client_status === 'prospect' ? 'bg-[#E8FBFF] text-[#3BA8BD]' :
                          client.client_status === 'archived' ? 'bg-neutral-100 text-neutral-800' :
                          'bg-neutral-100 text-neutral-800'
                        }`}>
                          {client.client_status || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {client.pipeline_stage || 'N/A'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {getMarketLabel(client)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {client.lead_type ? (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getLeadTypeChipColors(client.lead_type)}`}>
                            {client.lead_type}
                          </span>
                        ) : 'N/A'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900 relative">
                        <div className="relative inline-block w-full" style={{ minWidth: '160px' }}>
                          <input
                            type="text"
                            autoComplete="off"
                            value={showTutorDropdown === client.id ? tutorSearchQuery : (client.assigned_tutor_name || '')}
                            placeholder="Search tutor..."
                            className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            onClick={() => {
                              if (showTutorDropdown !== client.id) {
                                setShowTutorDropdown(client.id);
                                setTutorSearchQuery('');
                                setTutorSearchResults([]);
                                setHighlightedTutorIndex(-1);
                                if (previousTutorQueryRef) previousTutorQueryRef.current = '';
                              }
                            }}
                            onChange={(e) => {
                              const query = e.target.value;
                              setTutorSearchQuery(query);
                              if (showTutorDropdown !== client.id) {
                                setShowTutorDropdown(client.id);
                              }
                              if (previousTutorQueryRef && query !== previousTutorQueryRef.current) {
                                setHighlightedTutorIndex(-1);
                                previousTutorQueryRef.current = query;
                              }
                              searchTutors(query);
                            }}
                            onFocus={() => {
                              if (showTutorDropdown !== client.id) {
                                setShowTutorDropdown(client.id);
                                setTutorSearchQuery('');
                                setTutorSearchResults([]);
                                setHighlightedTutorIndex(-1);
                                if (previousTutorQueryRef) previousTutorQueryRef.current = '';
                              }
                            }}
                            onKeyDown={(e) => {
                              const isOpen = showTutorDropdown === client.id;
                              if (!isOpen) setShowTutorDropdown(client.id);

                              const resultsFromRef = tutorSearchResultsRef?.current || [];
                              const resultsFromState = tutorSearchResults || [];
                              const currentResults = resultsFromRef.length > 0 ? resultsFromRef : resultsFromState;

                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                if (currentResults.length > 0) {
                                  setHighlightedTutorIndex(prev => prev < 0 ? 0 : Math.min(prev + 1, currentResults.length - 1));
                                }
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                if (currentResults.length > 0) {
                                  setHighlightedTutorIndex(prev => prev <= 0 ? -1 : prev - 1);
                                }
                              } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (currentResults.length > 0) {
                                  const currentHighlight = highlightedTutorIndexRef?.current ?? -1;
                                  const indexToSelect = (currentHighlight >= 0 && currentHighlight < currentResults.length) ? currentHighlight : 0;
                                  const selectedTutor = currentResults[indexToSelect];
                                  if (selectedTutor) {
                                    updateAssignedTutor(client.id, selectedTutor.id, selectedTutor.name);
                                  }
                                } else if (!tutorSearchQuery || tutorSearchQuery.trim().length === 0) {
                                  setShowTutorDropdown(null);
                                  setTutorSearchQuery('');
                                  setTutorSearchResults([]);
                                  setHighlightedTutorIndex(-1);
                                }
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setShowTutorDropdown(null);
                                setTutorSearchQuery('');
                                setTutorSearchResults([]);
                                setHighlightedTutorIndex(-1);
                              }
                            }}
                          />

                          {showTutorDropdown === client.id && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto left-0">
                              {tutorSearchResults.length > 0 ? (
                                tutorSearchResults.map((tutor, index) => (
                                  <div
                                    key={tutor.id}
                                    className={`px-3 py-2 text-sm cursor-pointer border-b border-neutral-100 last:border-b-0 ${
                                      index === highlightedTutorIndex ? 'bg-primary-50 border-primary-200' : 'hover:bg-neutral-100'
                                    }`}
                                    onClick={() => updateAssignedTutor(client.id, tutor.id, tutor.name)}
                                    onMouseEnter={() => setHighlightedTutorIndex(index)}
                                  >
                                    <div className="font-medium">{tutor.name}</div>
                                  </div>
                                ))
                              ) : tutorSearchQuery.length >= 2 ? (
                                <div className="px-3 py-2 text-sm text-neutral-500">No tutors found</div>
                              ) : (
                                <div className="px-3 py-2 text-sm text-neutral-500">Type to search tutors...</div>
                              )}
                              <div className="px-3 py-2 text-sm text-neutral-500 border-t border-neutral-200">
                                <button
                                  onClick={() => {
                                    setShowTutorDropdown(null);
                                    setTutorSearchQuery('');
                                    setTutorSearchResults([]);
                                    setHighlightedTutorIndex(-1);
                                  }}
                                  className="text-primary-500 hover:text-primary-700"
                                >
                                  Close
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {client.prospect_status ? (
                          <select
                            value={client.prospect_status}
                            onChange={(e) => handleProspectStatusUpdate(client.id, e.target.value)}
                            className={`text-sm border border-neutral-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${getStatusBackgroundColor(client.prospect_status)} ${getStatusTextColor(client.prospect_status)} font-medium`}
                          >
                            <option value="Waiting for Response">Waiting for Response</option>
                            <option value="Building">Building</option>
                            <option value="Waiting to Pair">Waiting to Pair</option>
                            <option value="Waiting for Trial">Waiting for Trial</option>
                            <option value="Trial Follow-Up">Trial Follow-Up</option>
                            <option value="Won">Won</option>
                            <option value="Lost">Lost</option>
                          </select>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {client.archived_at ? formatDate(client.archived_at) : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm">
                        <AutomationInfoIndicator
                          mode="detail"
                          automationTrigger={client.automation_trigger}
                          size="sm"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                        {client.client_spend !== undefined && client.client_spend !== null
                          ? `$${parseFloat(client.client_spend).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'
                        }
                      </td>
                      {activeTab === 'lost' && (
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-neutral-900">
                          {client.prospect_status === 'Lost' ? (
                            <button
                              onClick={() => handleReviveProspect(client.id)}
                              className="px-3 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors"
                              title="Revive this prospect back to pipeline"
                            >
                              Revive
                            </button>
                          ) : (
                            <span className="text-neutral-400 text-xs">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                    {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={activeTab === 'lost' ? 11 : 10} className="px-6 py-4 text-center text-sm text-neutral-500">
                          No {activeTab === 'won' ? 'won' : 'lost'} clients found{archiveLabelFilter ? ` with ${archiveLabelFilter} label` : ''}.
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
