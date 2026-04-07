import React, { useRef, useState, useEffect } from 'react';
import { PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

/**
 * InlineNoteCell - Editable note cell that saves on blur
 */
function InlineNoteCell({ prospectId, initialValue, onSave }) {
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const savedValueRef = useRef(initialValue);

  // Sync if parent data changes (e.g. after a full refresh)
  useEffect(() => {
    setValue(initialValue);
    savedValueRef.current = initialValue;
  }, [initialValue]);

  const handleBlur = async () => {
    const trimmed = value.trim();
    if (trimmed === savedValueRef.current) return; // No change
    if (!trimmed) return; // Don't save empty
    setIsSaving(true);
    await onSave(prospectId, trimmed);
    savedValueRef.current = trimmed;
    setIsSaving(false);
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="Add note..."
      className={`w-full text-xs bg-transparent border-0 border-b border-transparent hover:border-neutral-300 focus:border-primary-400 focus:ring-0 px-1 py-0.5 text-neutral-700 placeholder-neutral-400 transition-colors ${isSaving ? 'opacity-50' : ''}`}
      disabled={isSaving}
    />
  );
}

/**
 * ClubClassInput - Displays class name as read-only text, or editable input if empty
 */
function ClubClassInput({ prospectId, initialValue, onSave }) {
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const savedValueRef = useRef(initialValue);

  useEffect(() => {
    setValue(initialValue);
    savedValueRef.current = initialValue;
  }, [initialValue]);

  const handleBlur = async () => {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed === savedValueRef.current) return;
    await onSave(prospectId, trimmed);
    savedValueRef.current = trimmed;
  };

  // If there's a value and not editing, show read-only text
  if (value && !editing) {
    return (
      <span
        className="text-[11px] text-neutral-700 cursor-pointer hover:text-primary-500 px-1 py-0.5 truncate block"
        style={{ minWidth: '120px' }}
        title={value}
        onClick={() => setEditing(true)}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onFocus={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      placeholder="Enter class..."
      autoFocus={editing}
      className="w-full text-[11px] bg-transparent border-0 border-b border-transparent hover:border-neutral-300 focus:border-primary-400 focus:ring-0 px-1 py-0.5 text-neutral-700 placeholder-neutral-400 transition-colors"
      style={{ minWidth: '120px' }}
    />
  );
}

/**
 * ProspectsView - Table view for managing prospects
 *
 * Displays a comprehensive table of all prospects with sorting, filtering, and search capabilities.
 */
export default function ProspectsView({
  // Data
  clients,
  pipelineStages,
  filteredPipelineStages,
  filteredClients,
  uniqueClientsCount,
  
  // State
  prospectStageFilter,
  setProspectStageFilter,
  sortConfig,
  setSortConfig,
  columnWidths,
  resetColumnWidths,
  showDateOfferedFilter,
  setShowDateOfferedFilter,
  showDatePairedFilter,
  setShowDatePairedFilter,
  showDateTrialFilter,
  setShowDateTrialFilter,
  dateFilters,
  setDateFilters,
  tempDateFilters,
  setTempDateFilters,
  showTutorFilterDropdown,
  setShowTutorFilterDropdown,
  tutorFilterSearchQuery,
  setTutorFilterSearchQuery,
  tutorFilterSearchResults,
  setTutorFilterSearchResults,
  isSearchingTutorFilter,
  selectedTutorFilter,
  highlightedTutorFilterIndex,
  setHighlightedTutorFilterIndex,
  highlightedTutorFilterIndexRef,
  tutorFilterSearchResultsRef,
  dateOfferedFilterRef,
  datePairedFilterRef,
  dateTrialFilterRef,
  tutorFilterDropdownRef,
  showLeadTypeDropdown,
  setShowLeadTypeDropdown,
  leadTypeDropdownRefs,
  showMarketDropdown,
  setShowMarketDropdown,
  marketDropdownRefs,
  highlightedTutorIndex,
  setHighlightedTutorIndex,
  showTutorDropdown,
  setShowTutorDropdown,
  tutorSearchQuery,
  setTutorSearchQuery,
  tutorSearchResults,
  setTutorSearchResults,
  previousTutorQueryRef,
  
  // Handlers
  resetManualIntakeForm,
  setShowManualIntakeModal,
  handleResizeStart,
  handlePipelineStageUpdate,
  handleProspectStatusUpdate,
  handleProspectClick,
  handleReviveProspect,
  updateDateOfferedToTutors,
  updateDateTutorClientPairedScheduled,
  updateDateTrialFirstLesson,
  toggleTrialFollowUp,
  toggleFirstPaidScheduled,
  toggleFirstPaidCompleted,
  toggleClassPack,
  updateClubClassName,
  searchTutorsForFilter,
  searchTutors,
  tutorSearchResultsRef,
  highlightedTutorIndexRef,
  updateAssignedTutor,
  handleTutorFilterSelect,
  clearTutorFilter,
  filters,
  setFilters,
  updateLeadType,
  updateMarket,

  // Inline note save
  saveInlineNote,

  // Helper functions
  hasPrivateLabel,
  isPending,
  hasHomeLabel,
  hasOnlineLabel,
  hasSchoolLabel,
  hasClubLabel,
  isClubCamp,
  hasNoLabel,
  getStageBorderColor,
  getStatusBackgroundColor,
  getStatusTextColor,
  getMarketLabel,
  getMarketLabelColorValue,
  getLeadTypeChipColors,
  parseLocalDate,
  UNIFIED_DATE_INPUT_BASE,
  UNIFIED_SELECT_BASE,
  MARKET_OPTIONS,
  LEAD_TYPE_OPTIONS,
}) {
  const isClubTab = prospectStageFilter === 'club' || prospectStageFilter === 'club-camp';

  // Missing refs and state that were referenced but not defined
  const pipelineStageFilterRef = useRef(null);
  const marketFilterRef = useRef(null);
  const leadTypeFilterRef = useRef(null);
  const registrationDateFilterRef = useRef(null);
  const statusDropdownRefs = useRef({});
  const [showPipelineStageFilter, setShowPipelineStageFilter] = useState(false);
  const [showMarketFilter, setShowMarketFilter] = useState(false);
  const [showLeadTypeFilter, setShowLeadTypeFilter] = useState(false);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);

  // Click-outside handler to close status dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside the status dropdown
      if (showStatusDropdown !== null) {
        const dropdownRef = statusDropdownRefs.current[showStatusDropdown];
        if (dropdownRef && !dropdownRef.contains(event.target)) {
          setShowStatusDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStatusDropdown]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200">
          <div className="px-4 pt-1 pb-4">
            {/* Stage Filter Tabs + Actions */}
            <div className="mb-2">
              <div className="border-b border-neutral-200">
                <div className="flex items-end justify-between">
                <nav className="-mb-px flex gap-6 overflow-x-auto">
                  {filteredPipelineStages.map((stage) => {
                    const stageClients = clients.filter(client => {
                      if (!client.pipeline_stage_id && client.pipeline_stage) {
                        const normalizedName = client.pipeline_stage.toLowerCase();
                        const matchedStage = pipelineStages.find(s => s.name.toLowerCase() === normalizedName);
                        if (matchedStage) {
                          client.pipeline_stage_id = matchedStage.id;
                          const clientStageId = matchedStage.id;
                          const stageId = stage.id;
                          return clientStageId != null && stageId != null && 
                                 (clientStageId === stageId || 
                                  String(clientStageId) === String(stageId) || 
                                  Number(clientStageId) === Number(stageId));
                        }
                      }
                      const clientStageId = client.pipeline_stage_id;
                      const stageId = stage.id;
                      return clientStageId != null && stageId != null && 
                             (clientStageId === stageId || 
                              String(clientStageId) === String(stageId) || 
                              Number(clientStageId) === Number(stageId));
                    });
                    return (
                      <button
                        key={stage.id}
                        onClick={() => setProspectStageFilter(stage.id.toString())}
                        className={`inline-flex items-center gap-2 px-1 py-2.5 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          prospectStageFilter === stage.id.toString()
                            ? 'border-[#6A469D] text-[#6A469D]'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        {stage.name}
                        <span className={`text-xs tabular-nums ${prospectStageFilter === stage.id.toString() ? 'text-[#6A469D]' : 'text-neutral-400'}`}>
                          {stageClients.length}
                        </span>
                      </button>
                    );
                  })}
                  
                  {/* Label-based filter tabs: Private, Pending, School, Club Trial, Club Camp, Club, No Label */}
                  {(() => {
                    const privateClients = clients.filter(client => hasPrivateLabel(client));
                    const pendingClients = clients.filter(client => isPending(client) && (hasHomeLabel(client) || hasOnlineLabel(client)) && !hasClubLabel(client));
                    const schoolClients = clients.filter(client => hasSchoolLabel(client));
                    const clubCampClients = clients.filter(client => isClubCamp(client));
                    const clubClients = clients.filter(client => hasClubLabel(client) && !isClubCamp(client));
                    const noLabelClients = clients.filter(client => hasNoLabel(client));

                    const labelTabs = [
                      { id: 'private', name: 'Private', count: privateClients.length },
                      { id: 'pending', name: 'Pending', count: pendingClients.length },
                      { id: 'school', name: 'School', count: schoolClients.length },
                      { id: 'club', name: 'Club', count: clubClients.length },
                      { id: 'club-camp', name: 'Club Camp', count: clubCampClients.length },
                      { id: 'no-label', name: 'No Label', count: noLabelClients.length },
                    ];

                    return labelTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setProspectStageFilter(tab.id)}
                        className={`inline-flex items-center gap-2 px-1 py-2.5 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                          prospectStageFilter === tab.id
                            ? 'border-[#6A469D] text-[#6A469D]'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        {tab.name}
                        <span className={`text-xs tabular-nums ${prospectStageFilter === tab.id ? 'text-[#6A469D]' : 'text-neutral-400'}`}>
                          {tab.count}
                        </span>
                      </button>
                    ));
                  })()}
                </nav>
                <div className="flex items-center gap-2 ml-4 pb-2 flex-shrink-0">
                  {resetColumnWidths && (
                    <button
                      type="button"
                      onClick={resetColumnWidths}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors whitespace-nowrap"
                      title="Reset column widths to defaults"
                    >
                      Reset Columns
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      resetManualIntakeForm();
                      setShowManualIntakeModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors whitespace-nowrap"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add Prospect
                  </button>
                </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full divide-y divide-neutral-200" style={{ overflow: 'visible', tableLayout: 'fixed' }}>
                <thead className="bg-neutral-50" style={{ overflow: 'visible' }}>
                  <tr>
                    <th className="px-1.5 py-2 text-left text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.prospect, minWidth: columnWidths.prospect }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'prospect';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'prospect', direction: nextDirection };
                          })
                        }
                        className="flex items-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700"
                      >
                        Prospect
                        {sortConfig.field === 'prospect' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('prospect', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative hidden" style={{ width: columnWidths.pipelineStage, minWidth: columnWidths.pipelineStage }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'pipeline_stage';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'pipeline_stage', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                      >
                        Pipeline Stage
                        {sortConfig.field === 'pipeline_stage' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('pipelineStage', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.market, minWidth: columnWidths.market }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'market';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'market', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                      >
                        Mkt
                        {sortConfig.field === 'market' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('market', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.leadType, minWidth: columnWidths.leadType }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'lead_type';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'lead_type', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                      >
                        Lead
                        {sortConfig.field === 'lead_type' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('leadType', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.registrationComplete, minWidth: columnWidths.registrationComplete }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'prospect_status';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'prospect_status', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                      >
                        Status
                        {sortConfig.field === 'prospect_status' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('registrationComplete', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    {!isClubTab && (
                    <th className="px-1 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.dateOfferedToTutors, minWidth: columnWidths.dateOfferedToTutors }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'date_offered';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'date_offered', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0.5 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto group relative leading-tight"
                        title="Date Offered to Tutors (Pending Schedule)"
                      >
                        <span>Offered</span>
                        {sortConfig.field === 'date_offered' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('dateOfferedToTutors', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    )}
                    <th className="px-1 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.dateTutorClientPaired, minWidth: columnWidths.dateTutorClientPaired }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'date_scheduled';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'date_scheduled', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0.5 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto group relative leading-tight"
                        title="Date Tutor and Client Paired (Scheduled)"
                      >
                        <span>Paired</span>
                        {sortConfig.field === 'date_scheduled' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('dateTutorClientPaired', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.dateTrialFirstLesson, minWidth: columnWidths.dateTrialFirstLesson }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'date_trial';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'date_trial', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0.5 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto leading-tight"
                        title="Date of Trial / First Lesson"
                      >
                        <span>Trial</span>
                        {sortConfig.field === 'date_trial' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('dateTrialFirstLesson', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    <th className="px-1.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.tutor, minWidth: columnWidths.tutor }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === isClubTab ? 'club_class' : 'tutor';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: isClubTab ? 'club_class' : 'tutor', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                      >
                        {isClubTab ? 'Class' : 'Tutor'}
                        {sortConfig.field === (isClubTab ? 'club_class' : 'tutor') && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('tutor', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                    <th className="px-0.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.trialFollowUp, minWidth: columnWidths.trialFollowUp }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'trial_follow_up';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'trial_follow_up', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0 uppercase text-[10px] text-neutral-500 hover:text-neutral-700 mx-auto leading-tight"
                        title="Trial Follow-Up?"
                      >
                        <span>F/U?</span>
                        {sortConfig.field === 'trial_follow_up' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('trialFollowUp', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                    {isClubTab ? (
                    <th className="px-0.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.firstPaidLessonScheduled, minWidth: columnWidths.firstPaidLessonScheduled }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'class_pack';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'class_pack', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0 uppercase text-[10px] text-neutral-500 hover:text-neutral-700 mx-auto leading-tight"
                        title="Has Class Pack"
                      >
                        <span>Class</span>
                        <span>Pack</span>
                        {sortConfig.field === 'class_pack' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('firstPaidLessonScheduled', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                    ) : (
                    <>
                    <th className="px-0.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.firstPaidLessonScheduled, minWidth: columnWidths.firstPaidLessonScheduled }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'paid_scheduled';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'paid_scheduled', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0 uppercase text-[10px] text-neutral-500 hover:text-neutral-700 mx-auto leading-tight"
                        title="1st Paid Lesson Scheduled"
                      >
                        <span>Paid</span>
                        <span>Sched</span>
                        {sortConfig.field === 'paid_scheduled' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('firstPaidLessonScheduled', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                    <th className="px-0.5 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.firstPaidLessonComplete, minWidth: columnWidths.firstPaidLessonComplete }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'paid_complete';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'paid_complete', direction: nextDirection };
                          })
                        }
                        className="flex flex-col items-center justify-center gap-0 uppercase text-[10px] text-neutral-500 hover:text-neutral-700 mx-auto leading-tight"
                        title="1st Paid Lesson Complete"
                      >
                        <span>Paid</span>
                        <span>Done</span>
                        {sortConfig.field === 'paid_complete' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('firstPaidLessonComplete', e)}
                        style={{ userSelect: 'none', touchAction: 'none' }}
                        title="Drag to resize column"
                      />
                    </th>
                    </>
                    )}
                    <th className="px-1 py-2 text-center text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.clientSpend, minWidth: columnWidths.clientSpend }}>
                      <button
                        type="button"
                        onClick={() =>
                          setSortConfig((prev) => {
                            const isSame = prev.field === 'client_spend';
                            const nextDirection = isSame && prev.direction === 'asc' ? 'desc' : 'asc';
                            return { field: 'client_spend', direction: nextDirection };
                          })
                        }
                        className="flex items-center justify-center gap-1 uppercase text-xs text-neutral-500 hover:text-neutral-700 mx-auto"
                        title="Client Spend"
                      >
                        Spend
                        {sortConfig.field === 'client_spend' && (
                          <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('clientSpend', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                    <th className="px-1 py-2 text-left text-xs font-medium text-neutral-500 uppercase relative" style={{ width: columnWidths.notes, minWidth: columnWidths.notes }}>
                      <span className="uppercase text-xs text-neutral-500">Notes</span>
                      <div
                        className="absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-primary-500/20 bg-transparent z-10"
                        onMouseDown={(e) => handleResizeStart('notes', e)}
                        style={{ userSelect: 'none' }}
                      />
                    </th>
                  </tr>
                  {/* Filter sub-header row */}
                  <tr className="bg-neutral-100 border-t border-neutral-300">
                    {/* Prospect - no filter */}
                    <th className="px-1 py-1 overflow-visible"></th>
                    {/* Score - no filter */}
                    <th className="px-1 py-1 text-center"></th>

                    {/* Pipeline Stage Filter */}
                    <th className="px-1 py-1 text-center overflow-visible hidden">
                      <div className="relative inline-flex items-center gap-1" ref={pipelineStageFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPipelineStageFilter(!showPipelineStageFilter);
                          }}
                          className={`p-1 rounded transition-all ${filters.pipelineStage !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by pipeline stage"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {filters.pipelineStage !== 'all' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters(prev => ({ ...prev, pipelineStage: 'all' }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear pipeline stage filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showPipelineStageFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              top: 'calc(100% + 12px)', 
                              width: '192px',
                              minWidth: '192px',
                              maxWidth: '192px'
                            }}
                          >
                            <div className="p-2 max-h-64 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilters(prev => ({ ...prev, pipelineStage: 'all' }));
                                  setShowPipelineStageFilter(false);
                                }}
                                className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.pipelineStage === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                              >
                                All Stages
                              </button>
                              {pipelineStages.map((stage) => (
                                <button
                                  key={stage.id}
                                  type="button"
                                  onClick={() => {
                                    setFilters(prev => ({ ...prev, pipelineStage: stage.id.toString() }));
                                    setShowPipelineStageFilter(false);
                                  }}
                                  className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.pipelineStage === stage.id.toString() ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                >
                                  {stage.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Market Filter */}
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={marketFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowMarketFilter(!showMarketFilter);
                          }}
                          className={`p-1 rounded transition-all ${filters.market !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by market"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {filters.market !== 'all' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters(prev => ({ ...prev, market: 'all' }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear market filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showMarketFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              top: 'calc(100% + 12px)', 
                              width: '160px',
                              minWidth: '160px',
                              maxWidth: '160px'
                            }}
                          >
                            <div className="p-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilters(prev => ({ ...prev, market: 'all' }));
                                  setShowMarketFilter(false);
                                }}
                                className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.market === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                              >
                                All Markets
                              </button>
                              {MARKET_OPTIONS.map((market) => (
                                <button
                                  key={market}
                                  type="button"
                                  onClick={() => {
                                    setFilters(prev => ({ ...prev, market }));
                                    setShowMarketFilter(false);
                                  }}
                                  className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.market === market ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                >
                                  {market}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Lead Type Filter */}
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={leadTypeFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowLeadTypeFilter(!showLeadTypeFilter);
                          }}
                          className={`p-1 rounded transition-all ${filters.leadType !== 'all' ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by lead type"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {filters.leadType !== 'all' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters(prev => ({ ...prev, leadType: 'all' }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear lead type filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showLeadTypeFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              top: 'calc(100% + 12px)', 
                              width: '192px',
                              minWidth: '192px',
                              maxWidth: '192px'
                            }}
                          >
                            <div className="p-2 max-h-64 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setFilters(prev => ({ ...prev, leadType: 'all' }));
                                  setShowLeadTypeFilter(false);
                                }}
                                className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.leadType === 'all' ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                              >
                                All Lead Types
                              </button>
                              {LEAD_TYPE_OPTIONS.map((leadType) => (
                                <button
                                  key={leadType}
                                  type="button"
                                  onClick={() => {
                                    setFilters(prev => ({ ...prev, leadType }));
                                    setShowLeadTypeFilter(false);
                                  }}
                                  className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-neutral-100 ${filters.leadType === leadType ? 'bg-primary-50 text-primary-500 font-medium' : 'text-neutral-700'}`}
                                >
                                  {leadType}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Status Filter */}
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={registrationDateFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isOpening = !showStatusFilter;
                            if (isOpening) {
                              // Close all other header-level filters
                              setShowDateOfferedFilter(false);
                              setShowDatePairedFilter(false);
                              setShowDateTrialFilter(false);
                              setShowTutorFilterDropdown(false);
                              // Close all row-level dropdowns
                              setShowMarketDropdown(null);
                              setShowLeadTypeDropdown(null);
                              setShowStatusDropdown(null);
                              setShowTutorDropdown(null);
                            }
                            setShowStatusFilter(!showStatusFilter);
                          }}
                          className={`p-1 rounded transition-all ${filters.prospectStatus.length > 0 ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by status"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {filters.prospectStatus.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFilters(prev => ({ ...prev, prospectStatus: [] }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear status filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showStatusFilter && (
                          <div
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{
                              width: '220px',
                              minWidth: '220px',
                              maxWidth: '220px',
                              top: 'calc(100% + 8px)',
                              paddingTop: '8px',
                              paddingBottom: '8px',
                              paddingLeft: '4px',
                              paddingRight: '4px'
                            }}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between px-2 pb-1 border-b border-neutral-200">
                                <label className="block text-xs font-medium text-neutral-700">
                                  Status {filters.prospectStatus.length > 0 && `(${filters.prospectStatus.length})`}
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowStatusFilter(false)}
                                  className="text-xs text-neutral-600 hover:text-neutral-800"
                                >
                                  ✕
                                </button>
                              </div>
                              <div className="flex gap-1 px-2 py-1 border-b border-neutral-100">
                                <button
                                  type="button"
                                  onClick={() => setFilters(prev => ({ ...prev, prospectStatus: [] }))}
                                  className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                                >
                                  Clear
                                </button>
                                <span className="text-neutral-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setFilters(prev => ({ ...prev, prospectStatus: ['Need To Contact', 'Waiting for Response', 'Building', 'Waiting to Pair', 'Waiting for Trial', 'Trial Follow-Up'] }))}
                                  className="text-xs text-primary-500 hover:text-primary-700 font-medium"
                                >
                                  Select All
                                </button>
                              </div>
                              <div className="max-h-64 overflow-y-auto">
                                {['Need To Contact', 'Waiting for Response', 'Building', 'Waiting to Pair', 'Waiting for Trial', 'Trial Follow-Up'].map((status) => (
                                  <label
                                    key={status}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-neutral-100 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={filters.prospectStatus.includes(status)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setFilters(prev => ({ ...prev, prospectStatus: [...prev.prospectStatus, status] }));
                                        } else {
                                          setFilters(prev => ({ ...prev, prospectStatus: prev.prospectStatus.filter(s => s !== status) }));
                                        }
                                      }}
                                      className="h-3 w-3 text-primary-500 border-neutral-300 rounded focus:ring-primary-500"
                                    />
                                    <span className={filters.prospectStatus.includes(status) ? 'text-primary-500 font-medium' : 'text-neutral-700'}>
                                      {status}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Date Offered to Tutors Filter */}
                    {!isClubTab && (
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={dateOfferedFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isOpening = !showDateOfferedFilter;
                            if (isOpening) {
                              // Close all other filters
                              setShowDatePairedFilter(false);
                              setShowDateTrialFilter(false);
                              setShowTutorFilterDropdown(false);
                              // Initialize temp state with current filter values when opening
                              setTempDateFilters(prev => ({
                                ...prev,
                                dateOfferedToTutors: { 
                                  start: dateFilters.dateOfferedToTutors.start, 
                                  end: dateFilters.dateOfferedToTutors.end 
                                }
                              }));
                            }
                            setShowDateOfferedFilter(!showDateOfferedFilter);
                          }}
                          className={`p-1 rounded transition-all ${(dateFilters.dateOfferedToTutors.start || dateFilters.dateOfferedToTutors.end) ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by date offered to tutors"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {(dateFilters.dateOfferedToTutors.start || dateFilters.dateOfferedToTutors.end) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateFilters(prev => ({
                                ...prev,
                                dateOfferedToTutors: { start: null, end: null }
                              }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear date offered to tutors filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showDateOfferedFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              width: '320px', 
                              minWidth: '320px', 
                              maxWidth: '320px', 
                              top: 'calc(100% + 12px)', 
                              paddingTop: '12px',
                              paddingBottom: '12px',
                              paddingLeft: '12px',
                              paddingRight: '12px'
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between px-1">
                                <label className="block text-xs font-medium text-neutral-700">
                                  Date Offered to Tutors
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowDateOfferedFilter(false)}
                                  className="text-xs text-neutral-600 hover:text-neutral-800"
                                >
                                  ✕
                                </button>
                              </div>
                              <DatePicker
                                selected={tempDateFilters.dateOfferedToTutors.start}
                                onChange={(dates) => {
                                  if (Array.isArray(dates)) {
                                    const [start, end] = dates;
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateOfferedToTutors: { start: start || null, end: end || null }
                                    }));
                                  } else if (dates) {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateOfferedToTutors: { start: dates, end: null }
                                    }));
                                  } else {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateOfferedToTutors: { start: null, end: null }
                                    }));
                                  }
                                }}
                                selectsRange
                                startDate={tempDateFilters.dateOfferedToTutors.start}
                                endDate={tempDateFilters.dateOfferedToTutors.end}
                                inline
                                calendarClassName="!border-0 !shadow-none"
                              />
                              {(tempDateFilters.dateOfferedToTutors.start || tempDateFilters.dateOfferedToTutors.end) && (
                                <div className="text-xs text-neutral-600 px-1 pb-1">
                                  {tempDateFilters.dateOfferedToTutors.start && tempDateFilters.dateOfferedToTutors.end
                                    ? `${tempDateFilters.dateOfferedToTutors.start.toLocaleDateString()} - ${tempDateFilters.dateOfferedToTutors.end.toLocaleDateString()}`
                                    : tempDateFilters.dateOfferedToTutors.start
                                      ? `Start: ${tempDateFilters.dateOfferedToTutors.start.toLocaleDateString()}`
                                      : `End: ${tempDateFilters.dateOfferedToTutors.end.toLocaleDateString()}`
                                  }
                                </div>
                              )}
                              <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateOfferedToTutors: { start: null, end: null }
                                    }));
                                  }}
                                  className="text-xs text-neutral-600 hover:text-neutral-800 px-2 py-1"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDateFilters(prev => ({
                                      ...prev,
                                      dateOfferedToTutors: { 
                                        start: tempDateFilters.dateOfferedToTutors.start, 
                                        end: tempDateFilters.dateOfferedToTutors.end 
                                      }
                                    }));
                                    setShowDateOfferedFilter(false);
                                  }}
                                  className="text-xs text-white bg-primary-500 hover:bg-primary-600 px-3 py-1 rounded"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    )}

                    {/* Date Tutor and Client Paired Filter */}
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={datePairedFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isOpening = !showDatePairedFilter;
                            if (isOpening) {
                              // Close all other header-level filters
                              setShowDateOfferedFilter(false);
                              setShowDateTrialFilter(false);
                              setShowTutorFilterDropdown(false);
                              // Close all row-level dropdowns
                              setShowMarketDropdown(null);
                              setShowLeadTypeDropdown(null);
                              setShowStatusDropdown(null);
                              setShowTutorDropdown(null);
                              setTempDateFilters(prev => ({
                                ...prev,
                                dateTutorClientPaired: { 
                                  start: dateFilters.dateTutorClientPaired.start, 
                                  end: dateFilters.dateTutorClientPaired.end 
                                }
                              }));
                            }
                            setShowDatePairedFilter(!showDatePairedFilter);
                          }}
                          className={`p-1 rounded transition-all ${(dateFilters.dateTutorClientPaired.start || dateFilters.dateTutorClientPaired.end) ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by date paired"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {(dateFilters.dateTutorClientPaired.start || dateFilters.dateTutorClientPaired.end) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateFilters(prev => ({
                                ...prev,
                                dateTutorClientPaired: { start: null, end: null }
                              }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear date paired filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showDatePairedFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              width: '320px', 
                              minWidth: '320px', 
                              maxWidth: '320px', 
                              top: 'calc(100% + 12px)', 
                              paddingTop: '12px',
                              paddingBottom: '12px',
                              paddingLeft: '12px',
                              paddingRight: '12px'
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between px-1">
                                <label className="block text-xs font-medium text-neutral-700">
                                  Date Tutor and Client Paired
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowDatePairedFilter(false)}
                                  className="text-xs text-neutral-600 hover:text-neutral-800"
                                >
                                  ✕
                                </button>
                              </div>
                              <DatePicker
                                selected={tempDateFilters.dateTutorClientPaired.start}
                                onChange={(dates) => {
                                  if (Array.isArray(dates)) {
                                    const [start, end] = dates;
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTutorClientPaired: { start: start || null, end: end || null }
                                    }));
                                  } else if (dates) {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTutorClientPaired: { start: dates, end: null }
                                    }));
                                  } else {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTutorClientPaired: { start: null, end: null }
                                    }));
                                  }
                                }}
                                selectsRange
                                startDate={tempDateFilters.dateTutorClientPaired.start}
                                endDate={tempDateFilters.dateTutorClientPaired.end}
                                inline
                                calendarClassName="!border-0 !shadow-none"
                              />
                              {(tempDateFilters.dateTutorClientPaired.start || tempDateFilters.dateTutorClientPaired.end) && (
                                <div className="text-xs text-neutral-600 px-1 pb-1">
                                  {tempDateFilters.dateTutorClientPaired.start && tempDateFilters.dateTutorClientPaired.end
                                    ? `${tempDateFilters.dateTutorClientPaired.start.toLocaleDateString()} - ${tempDateFilters.dateTutorClientPaired.end.toLocaleDateString()}`
                                    : tempDateFilters.dateTutorClientPaired.start
                                      ? `Start: ${tempDateFilters.dateTutorClientPaired.start.toLocaleDateString()}`
                                      : `End: ${tempDateFilters.dateTutorClientPaired.end.toLocaleDateString()}`
                                  }
                                </div>
                              )}
                              <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTutorClientPaired: { start: null, end: null }
                                    }));
                                  }}
                                  className="text-xs text-neutral-600 hover:text-neutral-800 px-2 py-1"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDateFilters(prev => ({
                                      ...prev,
                                      dateTutorClientPaired: { 
                                        start: tempDateFilters.dateTutorClientPaired.start, 
                                        end: tempDateFilters.dateTutorClientPaired.end 
                                      }
                                    }));
                                    setShowDatePairedFilter(false);
                                  }}
                                  className="text-xs text-white bg-primary-500 hover:bg-primary-600 px-3 py-1 rounded"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Date of Trial / First Lesson Filter */}
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={dateTrialFilterRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!showDateTrialFilter) {
                              setTempDateFilters(prev => ({
                                ...prev,
                                dateTrialFirstLesson: { 
                                  start: dateFilters.dateTrialFirstLesson.start, 
                                  end: dateFilters.dateTrialFirstLesson.end 
                                }
                              }));
                            }
                            setShowDateTrialFilter(!showDateTrialFilter);
                          }}
                          className={`p-1 rounded transition-all ${(dateFilters.dateTrialFirstLesson.start || dateFilters.dateTrialFirstLesson.end) ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by trial date"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {(dateFilters.dateTrialFirstLesson.start || dateFilters.dateTrialFirstLesson.end) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDateFilters(prev => ({
                                ...prev,
                                dateTrialFirstLesson: { start: null, end: null }
                              }));
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear trial date filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showDateTrialFilter && (
                          <div 
                            className="absolute left-0 bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              width: '320px', 
                              minWidth: '320px', 
                              maxWidth: '320px', 
                              top: 'calc(100% + 12px)', 
                              paddingTop: '12px',
                              paddingBottom: '12px',
                              paddingLeft: '12px',
                              paddingRight: '12px'
                            }}
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between px-1">
                                <label className="block text-xs font-medium text-neutral-700">
                                  Date of Trial / First Lesson
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowDateTrialFilter(false)}
                                  className="text-xs text-neutral-600 hover:text-neutral-800"
                                >
                                  ✕
                                </button>
                              </div>
                              <DatePicker
                                selected={tempDateFilters.dateTrialFirstLesson.start}
                                onChange={(dates) => {
                                  if (Array.isArray(dates)) {
                                    const [start, end] = dates;
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTrialFirstLesson: { start: start || null, end: end || null }
                                    }));
                                  } else if (dates) {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTrialFirstLesson: { start: dates, end: null }
                                    }));
                                  } else {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTrialFirstLesson: { start: null, end: null }
                                    }));
                                  }
                                }}
                                selectsRange
                                startDate={tempDateFilters.dateTrialFirstLesson.start}
                                endDate={tempDateFilters.dateTrialFirstLesson.end}
                                inline
                                calendarClassName="!border-0 !shadow-none"
                              />
                              {(tempDateFilters.dateTrialFirstLesson.start || tempDateFilters.dateTrialFirstLesson.end) && (
                                <div className="text-xs text-neutral-600 px-1 pb-1">
                                  {tempDateFilters.dateTrialFirstLesson.start && tempDateFilters.dateTrialFirstLesson.end
                                    ? `${tempDateFilters.dateTrialFirstLesson.start.toLocaleDateString()} - ${tempDateFilters.dateTrialFirstLesson.end.toLocaleDateString()}`
                                    : tempDateFilters.dateTrialFirstLesson.start
                                      ? `Start: ${tempDateFilters.dateTrialFirstLesson.start.toLocaleDateString()}`
                                      : `End: ${tempDateFilters.dateTrialFirstLesson.end.toLocaleDateString()}`
                                  }
                                </div>
                              )}
                              <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempDateFilters(prev => ({
                                      ...prev,
                                      dateTrialFirstLesson: { start: null, end: null }
                                    }));
                                  }}
                                  className="text-xs text-neutral-600 hover:text-neutral-800 px-2 py-1"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDateFilters(prev => ({
                                      ...prev,
                                      dateTrialFirstLesson: { 
                                        start: tempDateFilters.dateTrialFirstLesson.start, 
                                        end: tempDateFilters.dateTrialFirstLesson.end 
                                      }
                                    }));
                                    setShowDateTrialFilter(false);
                                  }}
                                  className="text-xs text-white bg-primary-500 hover:bg-primary-600 px-3 py-1 rounded"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    
                    {/* Tutor / Class Filter */}
                    {isClubTab ? (
                    <th className="px-1 py-1.5 text-center"></th>
                    ) : (
                    <th className="px-1 py-1 text-center overflow-visible">
                      <div className="relative inline-flex items-center gap-1" ref={tutorFilterDropdownRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const isOpening = !showTutorFilterDropdown;
                            if (isOpening) {
                              // Close all other header-level filters
                              setShowDateOfferedFilter(false);
                              setShowDatePairedFilter(false);
                              setShowDateTrialFilter(false);
                              // Close all row-level dropdowns
                              setShowMarketDropdown(null);
                              setShowLeadTypeDropdown(null);
                              setShowStatusDropdown(null);
                              setShowTutorDropdown(null);
                              setTutorFilterSearchQuery('');
                              setTutorFilterSearchResults([]);
                            }
                            setShowTutorFilterDropdown(!showTutorFilterDropdown);
                          }}
                          className={`p-1 rounded transition-all ${selectedTutorFilter ? 'text-white bg-primary-500 border-2 border-primary-500 shadow-sm' : 'text-neutral-400 hover:bg-neutral-200 border-2 border-transparent'}`}
                          title="Filter by tutor"
                        >
                          <FunnelIcon className="h-3.5 w-3.5" />
                        </button>
                        {selectedTutorFilter && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearTutorFilter();
                            }}
                            className="p-0.5 rounded hover:bg-[#FCE8F0] text-[#AE255B] hover:text-[#AE255B] transition-colors"
                            title="Clear tutor filter"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {showTutorFilterDropdown && (
                          <div 
                            className="absolute bg-white border border-neutral-300 rounded-md shadow-xl z-popover"
                            style={{ 
                              left: '50%',
                              transform: 'translateX(-50%)',
                              top: 'calc(100% + 12px)', 
                              width: '256px',
                              minWidth: '256px',
                              maxWidth: '256px'
                            }}
                          >
                            <div className="p-2">
                              {selectedTutorFilter ? (
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs text-neutral-700">Filtered by: {selectedTutorFilter.name}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearTutorFilter();
                                    }}
                                    className="text-[#AE255B] hover:text-[#AE255B] text-xs"
                                  >
                                    Clear
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    autoComplete="off"
                                    value={tutorFilterSearchQuery}
                                    onChange={(e) => {
                                      const query = e.target.value;
                                      setTutorFilterSearchQuery(query);
                                      searchTutorsForFilter(query);
                                      // Reset highlight when query changes
                                      setHighlightedTutorFilterIndex(-1);
                                    }}
                                    onKeyDown={(e) => {
                                      // Get current results from ref (always up-to-date)
                                      const resultsFromRef = tutorFilterSearchResultsRef.current || [];
                                      const resultsFromState = tutorFilterSearchResults || [];
                                      const currentResults = resultsFromRef.length > 0 ? resultsFromRef : resultsFromState;

                                      if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Only navigate if we have results
                                        if (currentResults.length > 0) {
                                          setHighlightedTutorFilterIndex(prevIndex => {
                                            const newIndex = prevIndex < 0 ? 0 : Math.min(prevIndex + 1, currentResults.length - 1);
                                            return newIndex;
                                          });
                                        }
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Only navigate if we have results
                                        if (currentResults.length > 0) {
                                          setHighlightedTutorFilterIndex(prevIndex => {
                                            const newIndex = prevIndex <= 0 ? -1 : prevIndex - 1;
                                            return newIndex;
                                          });
                                        }
                                      } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Select tutor if we have results
                                        if (currentResults.length > 0) {
                                          const currentHighlight = highlightedTutorFilterIndexRef.current;
                                          const indexToSelect = (currentHighlight >= 0 && currentHighlight < currentResults.length) 
                                            ? currentHighlight 
                                            : 0;
                                          const selectedTutor = currentResults[indexToSelect];
                                          if (selectedTutor) {
                                            handleTutorFilterSelect(selectedTutor);
                                          }
                                        }
                                      } else if (e.key === 'Escape' || e.key === 'Esc') {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // Close dropdown on Escape
                                        setShowTutorFilterDropdown(false);
                                        setTutorFilterSearchQuery('');
                                        setTutorFilterSearchResults([]);
                                        setHighlightedTutorFilterIndex(-1);
                                      }
                                    }}
                                    placeholder="Search tutor to filter..."
                                    className="w-full px-2 py-1 text-xs border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    autoFocus
                                  />
                                  {isSearchingTutorFilter && (
                                    <div className="mt-2 text-xs text-neutral-500 text-center">Searching...</div>
                                  )}
                                  {tutorFilterSearchResults.length > 0 && (
                                    <div className="mt-2 max-h-48 overflow-y-auto border border-neutral-200 rounded">
                                      {tutorFilterSearchResults.map((tutor, index) => (
                                        <div
                                          key={tutor.id}
                                          data-tutor-filter-index={index}
                                          onClick={() => handleTutorFilterSelect(tutor)}
                                          onMouseEnter={() => setHighlightedTutorFilterIndex(index)}
                                          className={`px-3 py-2 cursor-pointer border-b border-neutral-100 last:border-b-0 ${
                                            index === highlightedTutorFilterIndex 
                                              ? 'bg-primary-50 border-primary-200' 
                                              : 'hover:bg-primary-50'
                                          }`}
                                        >
                                          <div className="text-xs font-medium text-neutral-900">{tutor.name}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {tutorFilterSearchQuery.length >= 2 && tutorFilterSearchResults.length === 0 && !isSearchingTutorFilter && (
                                    <div className="mt-2 text-xs text-neutral-500 text-center">No tutors found</div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </th>
                    )}

                    {/* Trial Follow-Up - no filter */}
                    <th className="px-1 py-1.5 text-center"></th>
                    
                    {isClubTab ? (
                    <>
                    {/* Class Pack - no filter */}
                    <th className="px-1 py-1.5 text-center"></th>
                    </>
                    ) : (
                    <>
                    {/* 1st Paid Lesson Scheduled - no filter */}
                    <th className="px-1 py-1.5 text-center"></th>

                    {/* 1st Paid Lesson Complete - no filter */}
                    <th className="px-1 py-1.5 text-center"></th>
                    </>
                    )}
                    
                    {/* Client Spend - no filter */}
                    <th className="px-1 py-1 text-center"></th>

                    {/* Notes - no filter */}
                    <th className="px-1 py-1 text-center"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200 overflow-visible">
                  {filteredClients
                    .map((prospect, idx) => ({
                      ...prospect,
                      sort_key: `${prospect.id || ''}-${prospect.client_id || ''}`,
                      row_key: `${prospect.id || 'prospect'}-${prospect.client_id || 'client'}-${idx}`,
                    }))
                    .sort((a, b) => {
                      if (!sortConfig?.field) return 0;

                      const direction = sortConfig.direction === 'desc' ? -1 : 1;
                      const field = sortConfig.field;

                      const getValue = (prospect, field) => {
                        switch (field) {
                          case 'prospect':
                            return `${prospect.first_name || ''} ${prospect.last_name || ''}`.trim().toLowerCase();
                          case 'market':
                            return (getMarketLabel(prospect) || '').toLowerCase();
                          case 'lead_type':
                            return (prospect.lead_type || '').toLowerCase();
                          case 'prospect_status':
                            const status = prospect.prospect_status || 'Need To Contact';
                            // Sort by status order: Need To Contact, Waiting for Response, Building, Waiting to Pair, Waiting for Trial, Trial Follow-Up, Won, Lost
                            const statusOrder = {
                              'Need To Contact': 1,
                              'Waiting for Response': 2,
                              'Building': 3,
                              'Waiting to Pair': 4,
                              'Waiting for Trial': 5,
                              'Trial Follow-Up': 6,
                              'Won': 7,
                              'Lost': 8
                            };
                            return statusOrder[status] || 99; // Put unknown statuses at end
                          case 'date_offered':
                            return prospect.date_tutor_client_paired ? new Date(prospect.date_tutor_client_paired).getTime() : 0;
                          case 'date_scheduled':
                            return prospect.date_tutor_client_paired_scheduled ? new Date(prospect.date_tutor_client_paired_scheduled).getTime() : 0;
                          case 'date_trial':
                            return prospect.date_trial_first_lesson ? new Date(prospect.date_trial_first_lesson).getTime() : 0;
                          case 'tutor':
                            return (prospect.assigned_tutor_name || '').toLowerCase();
                          case 'trial_follow_up':
                            return prospect.trial_follow_up_completed ? 1 : 0;
                          case 'paid_scheduled':
                            return prospect.first_paid_lesson_scheduled ? 1 : 0;
                          case 'paid_complete':
                            return prospect.first_paid_lesson_completed ? 1 : 0;
                          case 'club_class':
                            return (prospect.club_class_name || '').toLowerCase();
                          case 'class_pack':
                            return prospect.has_class_pack ? 1 : 0;
                          case 'client_spend':
                            return prospect.client_spend ? parseFloat(prospect.client_spend) : 0;
                          case 'pipeline_stage': {
                            if (prospect.pipeline_stage_id) {
                              const stage = pipelineStages.find((s) => s.id === prospect.pipeline_stage_id);
                              return stage ? stage.order_index || stage.name : '';
                            }
                            if (prospect.pipeline_stage) {
                              return prospect.pipeline_stage.toLowerCase();
                            }
                            return '';
                          }
                          default:
                            return 0;
                        }
                      };

                      const aVal = getValue(a, sortConfig.field);
                      const bVal = getValue(b, sortConfig.field);

                      if (aVal < bVal) return -1 * direction;
                      if (aVal > bVal) return 1 * direction;
                      return 0;
                    })
                    .map((prospect, prospectIndex) => (
                    <tr
                      key={prospect.row_key || `${prospect.id || 'prospect'}-${prospect.client_id || 'client'}-${prospectIndex}`}
                      className="hover:bg-neutral-50"
                    >
                      <td className="px-1.5 py-2 whitespace-nowrap">
            <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (handleProspectClick) {
                              handleProspectClick(prospect);
                            } else {
                              console.error('handleProspectClick is not defined');
                            }
                          }}
                          className="text-left text-xs font-medium text-primary-500 hover:text-primary-700 hover:underline cursor-pointer bg-transparent border-none p-0 w-full block truncate"
            >
                          {typeof prospect.first_name === 'string' ? prospect.first_name : ''} {typeof prospect.last_name === 'string' ? prospect.last_name : ''}
            </button>
                      </td>
                      <td className="px-1.5 py-2 whitespace-nowrap text-sm text-neutral-900 text-center hidden">
                        <select
                          value={prospect.pipeline_stage_id || ''}
                          onChange={(e) => {
                            const selectedStageId = e.target.value;
                            if (selectedStageId) {
                              handlePipelineStageUpdate(prospect.id || prospect.client_id, Number(selectedStageId));
                            }
                          }}
                          className="text-sm border border-neutral-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white font-medium w-full"
                        >
                          <option value="">Select Stage</option>
                          {pipelineStages.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {stage.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-center" style={{ overflow: 'visible', position: 'relative' }}>
                        <div className="relative inline-block" ref={(el) => { if (el && marketDropdownRefs) marketDropdownRefs.current[prospect.id] = el; }}>
                          <button
                            type="button"
                            onClick={() => {
                              const isOpening = showMarketDropdown !== prospect.id;
                              setShowMarketDropdown(isOpening ? prospect.id : null);
                              // Close other dropdowns when opening this one
                              if (isOpening) {
                                setShowLeadTypeDropdown(null);
                                setShowStatusDropdown(null);
                              }
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 cursor-pointer"
                            style={(() => {
                              const selectedMarket = getMarketLabel(prospect) || prospect.market || '';
                              const bgColor = getMarketLabelColorValue(selectedMarket);
                              if (!bgColor) return { backgroundColor: '#f3f4f6', color: '#111827', borderColor: '#d1d5db' };
                              
                              // Determine text color based on background brightness
                              const hex = bgColor.replace('#', '');
                              const r = parseInt(hex.substr(0, 2), 16);
                              const g = parseInt(hex.substr(2, 2), 16);
                              const b = parseInt(hex.substr(4, 2), 16);
                              const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                              const textColor = brightness > 155 ? '#111827' : '#ffffff';
                              
                              return { backgroundColor: bgColor, color: textColor, borderColor: bgColor };
                            })()}
                          >
                            <span>{getMarketLabel(prospect) || prospect.market || 'Select Market'}</span>
                            <svg className="ml-1.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {showMarketDropdown === prospect.id && (
                            <div className="absolute z-popover mt-1 w-48 bg-white border border-neutral-300 rounded-md shadow-lg overflow-x-hidden" style={{ left: 0, top: '100%' }}>
                              {MARKET_OPTIONS.map((market) => (
                                <button
                                  key={market}
                                  type="button"
                                  onClick={() => {
                                    updateMarket(prospect.id || prospect.client_id, market);
                                    setShowMarketDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer whitespace-nowrap block"
                                >
                                  {market}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-center" style={{ overflow: 'visible', position: 'relative' }}>
                        <div className="relative inline-block" ref={(el) => { if (el && leadTypeDropdownRefs) leadTypeDropdownRefs.current[prospect.id] = el; }}>
                          <button
                            type="button"
                            onClick={() => {
                              const isOpening = showLeadTypeDropdown !== prospect.id;
                              setShowLeadTypeDropdown(isOpening ? prospect.id : null);
                              // Close other dropdowns and filters when opening this one
                              if (isOpening) {
                                setShowMarketDropdown(null);
                                setShowStatusDropdown(null);
                                setShowTutorDropdown(null);
                                // Close header-level filters
                                setShowDateOfferedFilter(false);
                                setShowDatePairedFilter(false);
                                setShowDateTrialFilter(false);
                                setShowTutorFilterDropdown(false);
                              }
                            }}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 cursor-pointer ${getLeadTypeChipColors(prospect.lead_type || '').split(' ')[0]} ${getLeadTypeChipColors(prospect.lead_type || '').split(' ')[1] || 'text-neutral-900'}`}
                            style={{ borderColor: 'currentColor' }}
                          >
                            <span>{prospect.lead_type || 'Select Lead Type'}</span>
                            <svg className="ml-1.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {showLeadTypeDropdown === prospect.id && (
                            <div className="absolute z-popover mt-1 w-48 bg-white border border-neutral-300 rounded-md shadow-lg overflow-x-hidden" style={{ left: 0, top: '100%' }}>
                              {LEAD_TYPE_OPTIONS.map((leadType) => (
                                <button
                                  key={leadType}
                                  type="button"
                                  onClick={() => {
                                    updateLeadType(prospect.id, leadType);
                                    setShowLeadTypeDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer whitespace-nowrap block"
                                >
                                  {leadType}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-center" style={{ overflow: 'visible', position: 'relative' }}>
                        <div className="relative inline-block" ref={(el) => { if (el) statusDropdownRefs.current[prospect.id] = el; }}>
                          <button
                            type="button"
                            onClick={() => {
                              const isOpening = showStatusDropdown !== prospect.id;
                              setShowStatusDropdown(isOpening ? prospect.id : null);
                              // Close other dropdowns and filters when opening this one
                              if (isOpening) {
                                setShowMarketDropdown(null);
                                setShowLeadTypeDropdown(null);
                                setShowTutorDropdown(null);
                                // Close header-level filters
                                setShowDateOfferedFilter(false);
                                setShowDatePairedFilter(false);
                                setShowDateTrialFilter(false);
                                setShowTutorFilterDropdown(false);
                              }
                            }}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 cursor-pointer ${getStatusBackgroundColor(prospect.prospect_status || 'Need To Contact')} ${getStatusTextColor(prospect.prospect_status || 'Need To Contact')}`}
                            style={{ borderColor: 'currentColor' }}
                          >
                            <span>{prospect.prospect_status || 'Need To Contact'}</span>
                            <svg className="ml-1.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {showStatusDropdown === prospect.id && (
                            <div className="absolute z-popover mt-1 w-56 bg-white border border-neutral-300 rounded-md shadow-lg overflow-x-hidden" style={{ left: 0, top: '100%' }}>
                              {['Need To Contact', 'Waiting for Response', 'Building', 'Waiting to Pair', 'Waiting for Trial', 'Trial Follow-Up'].map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => {
                                    handleProspectStatusUpdate(prospect.id, status);
                                    setShowStatusDropdown(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 cursor-pointer whitespace-nowrap block"
                                >
                                  {status}
                                </button>
                              ))}
                            </div>
                          )}
                          {prospect.prospect_status === 'Lost' && (
                            <button
                              onClick={() => handleReviveProspect(prospect.id)}
                              className="mt-1 block text-xs px-2 py-0.5 bg-primary-500 text-white rounded hover:bg-primary-600 transition-colors w-full"
                              title="Revive this prospect back to pipeline"
                            >
                              Revive
                            </button>
                          )}
                        </div>
                      </td>
                      {!isClubTab && (
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-neutral-900 text-center">
                          <DatePicker
                            key={`date-picker-${prospect.id}-${prospect.date_tutor_client_paired || 'empty'}`}
                            selected={parseLocalDate(prospect.date_tutor_client_paired)}
                            onChange={(date) => {
                              console.log('DatePicker onChange fired:', date);
                              updateDateOfferedToTutors(prospect.id, date);
                            }}
                            onSelect={(date) => {
                              console.log('DatePicker onSelect fired:', date);
                              updateDateOfferedToTutors(prospect.id, date);
                            }}
                            dateFormat="M/d/yy"
                            className={UNIFIED_DATE_INPUT_BASE}
                            calendarClassName="!shadow-lg !border-neutral-200 !rounded-lg !font-sans"
                            customInput={
                              <input
                                type="text"
                                readOnly
                                className={UNIFIED_DATE_INPUT_BASE}
                                placeholder="Select date"
                              />
                            }
                            dayClassName={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const dateToCheck = new Date(date);
                              dateToCheck.setHours(0, 0, 0, 0);
                              return dateToCheck.getTime() === today.getTime() ? '!bg-primary-100 !text-primary-700 !font-semibold' : '';
                            }}
                            popperClassName="!z-50"
                            popperPlacement="bottom-start"
                          />
                      </td>
                      )}
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-neutral-900 text-center">
                          <DatePicker
                            key={`date-picker-scheduled-${prospect.id}-${prospect.date_tutor_client_paired_scheduled || 'empty'}`}
                            selected={parseLocalDate(prospect.date_tutor_client_paired_scheduled)}
                            onChange={(date) => {
                              updateDateTutorClientPairedScheduled(prospect.id, date);
                            }}
                            onSelect={(date) => {
                              updateDateTutorClientPairedScheduled(prospect.id, date);
                            }}
                            dateFormat="M/d/yy"
                            className={UNIFIED_DATE_INPUT_BASE}
                            calendarClassName="!shadow-lg !border-neutral-200 !rounded-lg !font-sans"
                            customInput={
                              <input
                                type="text"
                                readOnly
                                className={UNIFIED_DATE_INPUT_BASE}
                                placeholder="Select date"
                              />
                            }
                            dayClassName={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const dateToCheck = new Date(date);
                              dateToCheck.setHours(0, 0, 0, 0);
                              return dateToCheck.getTime() === today.getTime() ? '!bg-primary-100 !text-primary-700 !font-semibold' : '';
                            }}
                            popperClassName="!z-50"
                            popperPlacement="bottom-start"
                          />
                      </td>
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-neutral-900 text-center">
                          <DatePicker
                            key={`date-picker-trial-${prospect.id}-${prospect.date_trial_first_lesson || 'empty'}`}
                            selected={parseLocalDate(prospect.date_trial_first_lesson)}
                            onChange={(date) => {
                              updateDateTrialFirstLesson(prospect.id, date);
                            }}
                            onSelect={(date) => {
                              updateDateTrialFirstLesson(prospect.id, date);
                            }}
                            dateFormat="M/d/yy"
                            className={UNIFIED_DATE_INPUT_BASE}
                            calendarClassName="!shadow-lg !border-neutral-200 !rounded-lg !font-sans"
                            customInput={
                              <input
                                type="text"
                                readOnly
                                className={UNIFIED_DATE_INPUT_BASE}
                                placeholder="Select date"
                              />
                            }
                            dayClassName={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const dateToCheck = new Date(date);
                              dateToCheck.setHours(0, 0, 0, 0);
                              return dateToCheck.getTime() === today.getTime() ? '!bg-primary-100 !text-primary-700 !font-semibold' : '';
                            }}
                            popperClassName="!z-50"
                            popperPlacement="bottom-start"
                          />
                      </td>
                      {isClubTab ? (
                      <td className="px-1 py-2 text-sm text-neutral-900 relative overflow-visible text-center">
                        <ClubClassInput
                          prospectId={prospect.id}
                          initialValue={prospect.club_class_name || ''}
                          onSave={updateClubClassName}
                        />
                      </td>
                      ) : (
                      <td className="px-1 py-2 text-sm text-neutral-900 relative overflow-visible text-center">
                        <div className="relative inline-block w-full">
                          <input
                            type="text"
                            autoComplete="off"
                            value={showTutorDropdown === prospect.id ? tutorSearchQuery : (prospect.assigned_tutor_name || '')}
                            placeholder="Search tutor..."
                            className={UNIFIED_SELECT_BASE}
                                onClick={() => {
                                  if (showTutorDropdown !== prospect.id) {
                                    // Close all other dropdowns and filters when opening this one
                                    setShowMarketDropdown(null);
                                    setShowLeadTypeDropdown(null);
                                    setShowStatusDropdown(null);
                                    // Close header-level filters
                                    setShowDateOfferedFilter(false);
                                    setShowDatePairedFilter(false);
                                    setShowDateTrialFilter(false);
                                    setShowTutorFilterDropdown(false);
                                    setShowTutorDropdown(prospect.id);
                                    setTutorSearchQuery('');
                                    setTutorSearchResults([]);
                                    setHighlightedTutorIndex(-1);
                                    previousTutorQueryRef.current = '';
                                  }
                                }}
                                onChange={(e) => {
                                  const query = e.target.value;
                                  setTutorSearchQuery(query);
                                  // Ensure dropdown is open when typing
                                  if (showTutorDropdown !== prospect.id) {
                                    setShowTutorDropdown(prospect.id);
                                  }
                                  // Only reset highlight if query actually changed (not just results updating)
                                  if (query !== previousTutorQueryRef.current) {
                                    setHighlightedTutorIndex(-1);
                                    previousTutorQueryRef.current = query;
                                  }
                                  searchTutors(query);
                                }}
                                onFocus={() => {
                                  if (showTutorDropdown !== prospect.id) {
                                    setShowTutorDropdown(prospect.id);
                                    setTutorSearchQuery('');
                                    setTutorSearchResults([]);
                                    setHighlightedTutorIndex(-1);
                                    previousTutorQueryRef.current = '';
                                  }
                                }}
                                onKeyDown={(e) => {
                                  // Always ensure dropdown is open for keyboard navigation
                                  const isOpen = showTutorDropdown === prospect.id;
                                  if (!isOpen) {
                                    setShowTutorDropdown(prospect.id);
                                  }

                                  // Get current results - try ref first, fallback to state
                                  const resultsFromRef = tutorSearchResultsRef.current || [];
                                  const resultsFromState = tutorSearchResults || [];
                                  const currentResults = resultsFromRef.length > 0 ? resultsFromRef : resultsFromState;

                                  console.log('Tutor search keydown:', e.key, {
                                    prospectId: prospect.id,
                                    isOpen,
                                    query: tutorSearchQuery,
                                    resultsFromRef: resultsFromRef.length,
                                    resultsFromState: resultsFromState.length,
                                    currentResults: currentResults.length,
                                    currentHighlight: highlightedTutorIndex
                                  });

                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // Ensure dropdown is open
                                    if (!isOpen) {
                                      setShowTutorDropdown(prospect.id);
                                    }
                                    // Only navigate if we have results
                                    if (currentResults.length > 0) {
                                      console.log('ArrowDown: Navigating with', currentResults.length, 'results');
                                      setHighlightedTutorIndex(prevIndex => {
                                        const newIndex = prevIndex < 0 ? 0 : Math.min(prevIndex + 1, currentResults.length - 1);
                                        console.log('ArrowDown: Setting highlight from', prevIndex, 'to', newIndex);
                                        return newIndex;
                                      });
                                    } else {
                                      console.log('ArrowDown: No results available');
                                    }
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // Ensure dropdown is open
                                    if (!isOpen) {
                                      setShowTutorDropdown(prospect.id);
                                    }
                                    // Only navigate if we have results
                                    if (currentResults.length > 0) {
                                      setHighlightedTutorIndex(prevIndex => {
                                        // Go to -1 if at top, otherwise move up
                                        const newIndex = prevIndex <= 0 ? -1 : prevIndex - 1;
                                        return newIndex;
                                      });
                                    }
                                  } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    // Select tutor if we have results
                                    if (currentResults.length > 0) {
                                      const currentHighlight = highlightedTutorIndexRef.current;
                                      const indexToSelect = (currentHighlight >= 0 && currentHighlight < currentResults.length) 
                                        ? currentHighlight 
                                        : 0;
                                      const selectedTutor = currentResults[indexToSelect];
                                      if (selectedTutor) {
                                      updateAssignedTutor(prospect.id, selectedTutor.id, selectedTutor.name);
                                      }
                                    } else if (!tutorSearchQuery || tutorSearchQuery.trim().length === 0) {
                                      // Close dropdown if Enter pressed with empty input
                                      setShowTutorDropdown(null);
                                      setTutorSearchQuery('');
                                      setTutorSearchResults([]);
                                      setHighlightedTutorIndex(-1);
                                      previousTutorQueryRef.current = '';
                                    }
                                  } else if (e.key === 'Escape' || e.key === 'Esc') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log('Escape: Closing dropdown');
                                    // Close dropdown on Escape
                                    setShowTutorDropdown(null);
                                    setTutorSearchQuery('');
                                    setTutorSearchResults([]);
                                    setHighlightedTutorIndex(-1);
                                    previousTutorQueryRef.current = '';
                                  }
                                }}
                              />
                              
                              {showTutorDropdown === prospect.id && (
                                <div 
                                  data-tutor-dropdown={prospect.id}
                                  className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto left-0"
                                >
                                  {tutorSearchResults.length > 0 ? (
                                    tutorSearchResults.map((tutor, index) => (
                                      <div
                                        key={tutor.id}
                                        data-tutor-index={index}
                                        className={`px-3 py-2 text-sm cursor-pointer border-b border-neutral-100 last:border-b-0 ${
                                          index === highlightedTutorIndex 
                                            ? 'bg-primary-50 border-primary-200' 
                                            : 'hover:bg-neutral-100'
                                        }`}
                                        onClick={() => updateAssignedTutor(prospect.id, tutor.id, tutor.name)}
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
                      )}
                      <td className="px-0.5 py-2 whitespace-nowrap text-sm text-center">
                        <button
                          type="button"
                          onClick={() => toggleTrialFollowUp(prospect.id, prospect.trial_follow_up_completed || false)}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors hover:opacity-80 cursor-pointer ${
                            prospect.trial_follow_up_completed ? 'bg-[#E8F8ED] text-[#2A9147] border-[#34B256]/30' : 'bg-[#FCE8F0] text-[#AE255B] border-[#AE255B]/30'
                          }`}
                        >
                          {prospect.trial_follow_up_completed ? 'Yes' : 'No'}
                        </button>
                      </td>
                      {isClubTab ? (
                      <td className="px-0.5 py-2 whitespace-nowrap text-sm text-center">
                        <button
                          type="button"
                          onClick={() => toggleClassPack(prospect.id, prospect.has_class_pack || false)}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors hover:opacity-80 cursor-pointer ${
                            prospect.has_class_pack ? 'bg-[#E8F8ED] text-[#2A9147] border-[#34B256]/30' : 'bg-[#FCE8F0] text-[#AE255B] border-[#AE255B]/30'
                          }`}
                        >
                          {prospect.has_class_pack ? 'Yes' : 'No'}
                        </button>
                      </td>
                      ) : (
                      <>
                      <td className="px-0.5 py-2 whitespace-nowrap text-sm text-center">
                        <button
                          type="button"
                          onClick={() => toggleFirstPaidScheduled(prospect.id, prospect.first_paid_lesson_scheduled || false)}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors hover:opacity-80 cursor-pointer ${
                            prospect.first_paid_lesson_scheduled ? 'bg-[#E8F8ED] text-[#2A9147] border-[#34B256]/30' : 'bg-[#FCE8F0] text-[#AE255B] border-[#AE255B]/30'
                          }`}
                        >
                          {prospect.first_paid_lesson_scheduled ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-0.5 py-2 whitespace-nowrap text-sm text-center">
                        <button
                          type="button"
                          onClick={() => toggleFirstPaidCompleted(prospect.id, prospect.first_paid_lesson_completed || false)}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors hover:opacity-80 cursor-pointer ${
                            prospect.first_paid_lesson_completed ? 'bg-[#E8F8ED] text-[#2A9147] border-[#34B256]/30' : 'bg-[#FCE8F0] text-[#AE255B] border-[#AE255B]/30'
                          }`}
                        >
                          {prospect.first_paid_lesson_completed ? 'Yes' : 'No'}
                        </button>
                      </td>
                      </>
                      )}
                      <td className="px-1 py-2 whitespace-nowrap text-sm text-neutral-900 text-center">
                        {prospect.client_spend !== undefined && prospect.client_spend !== null
                          ? `$${parseFloat(prospect.client_spend).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'
                        }
                      </td>
                      <td className="px-1 py-1 text-sm text-neutral-700" style={{ width: columnWidths.notes, minWidth: columnWidths.notes }}>
                        <InlineNoteCell
                          prospectId={prospect.id}
                          initialValue={prospect.latest_note || ''}
                          onSave={saveInlineNote}
                        />
                      </td>
                    </tr>
                  ))}
                  {/* Add empty rows to provide space for dropdown on last row */}
                  {Array.from({ length: 10 }).map((_, index) => (
                    <tr key={`empty-${index}`} className="hover:bg-transparent">
                      <td colSpan={15} className="px-6 py-8"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Add significant bottom padding to ensure dropdowns are visible on last row */}
            <div className="pb-[600px] min-h-[600px]"></div>
          </div>
        </div>
  );
}
