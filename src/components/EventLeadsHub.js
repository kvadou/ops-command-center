import { useEffect, useState } from "react";
import { DataGrid } from "@mui/x-data-grid";
import {
  PlusIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  TrashIcon,
  CalendarIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { DateTime } from "luxon";
import EventLeadFormBuilder from "./EventLeadFormBuilder";
import QRCodePopover from "./QRCodePopover";

export default function EventLeadsHub() {
  const [eventRows, setEventRows] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null); // For viewing leads
  const [eventLeads, setEventLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [deleteLeadConfirmOpen, setDeleteLeadConfirmOpen] = useState(false);

  // Fetch events summary on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/event-leads/events-summary');
      const data = await response.json();
      setEventRows(data || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      setEventRows([]);
    } finally {
      setLoading(false);
    }
  };

  const openEvent = async (event) => {
    setSelectedEvent(event);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (event.event_id) params.set('eventId', event.event_id);
      else if (event.event_name) params.set('eventName', event.event_name);

      const response = await fetch(`/api/event-leads/by-event?${params.toString()}`);
      const data = await response.json();
      setEventLeads(data || []);
    } catch (error) {
      console.error('Error fetching event leads:', error);
      setEventLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowupToggle = async (lead) => {
    const newValue = !(lead.followed_up === true || lead.followed_up === 'true');
    const leadId = lead.id || lead.client_id; // Prefer id, fall back to client_id for legacy
    try {
      const response = await fetch(`/api/event-leads/${leadId}/followup`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followed_up: newValue })
      });
      const updated = await response.json();
      setEventLeads(prev => prev.map(l =>
        (l.id || l.client_id) === (updated.id || updated.client_id) ? updated : l
      ));
    } catch (error) {
      console.error('Error updating follow-up status:', error);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const dt = DateTime.fromISO(dateStr);
    return dt.isValid ? dt.toFormat("MMM d, yyyy") : "—";
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const dt = DateTime.fromISO(dateStr);
    return dt.isValid ? dt.toFormat("MMM d, yyyy 'at' h:mm a") : "—";
  };

  const copyFormUrl = (eventId, eventName) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/booking-forms/event-lead?eventId=${encodeURIComponent(eventId)}&eventName=${encodeURIComponent(eventName)}`;
    navigator.clipboard.writeText(url);
  };

  const handleDeleteClick = (event) => {
    setEventToDelete(event);
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return;

    try {
      // Use different endpoint based on whether event has a form or not
      const isLegacyEvent = !eventToDelete.has_form;
      const url = isLegacyEvent
        ? '/api/event-leads/legacy'
        : `/api/event-leads/form/${eventToDelete.event_id}`;

      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        ...(isLegacyEvent ? { body: JSON.stringify({ event_name: eventToDelete.event_name }) } : {}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete event');
      }

      // Remove from local state - match by event_name for legacy, event_id for forms
      setEventRows(prev => prev.filter(e =>
        isLegacyEvent
          ? e.event_name !== eventToDelete.event_name
          : e.event_id !== eventToDelete.event_id
      ));
      setDeleteConfirmOpen(false);
      setEventToDelete(null);
    } catch (error) {
      console.error('Error deleting event:', error);
      setDeleteError(error.message);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
    setEventToDelete(null);
    setDeleteError(null);
  };

  const handleEditClick = (event) => {
    setEventToEdit(event);
    setEditFormOpen(true);
  };

  const handleViewLeads = (event) => {
    openEvent(event);
  };

  const handleDeleteLeadClick = (lead) => {
    setLeadToDelete(lead);
    setDeleteError(null);
    setDeleteLeadConfirmOpen(true);
  };

  const handleDeleteLeadConfirm = async () => {
    if (!leadToDelete) return;
    const leadId = leadToDelete.id || leadToDelete.client_id;
    try {
      const response = await fetch(`/api/event-leads/${leadId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete lead');
      }
      setEventLeads(prev => prev.filter(l => (l.id || l.client_id) !== leadId));
      setDeleteLeadConfirmOpen(false);
      setLeadToDelete(null);
    } catch (error) {
      console.error('Error deleting lead:', error);
      setDeleteError(error.message);
    }
  };

  // Calculate analytics
  const totalLeads = eventRows.reduce((sum, e) => sum + (parseInt(e.total) || 0), 0);
  const totalFollowedUp = eventRows.reduce((sum, e) => sum + (parseInt(e.followed_up_count) || 0), 0);
  const followUpRate = totalLeads > 0 ? Math.round((totalFollowedUp / totalLeads) * 100) : 0;

  // Filter events based on search
  const filteredEvents = eventRows.filter(event => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (event.event_name || '').toLowerCase().includes(query) ||
      (event.event_id || '').toLowerCase().includes(query)
    );
  });

  // Filter leads based on search
  const filteredLeads = eventLeads.filter(lead => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (lead.first_name || '').toLowerCase().includes(query) ||
      (lead.last_name || '').toLowerCase().includes(query) ||
      (lead.email || '').toLowerCase().includes(query) ||
      (lead.phone || '').toLowerCase().includes(query)
    );
  });

  // Events list columns
  const eventsColumns = [
    {
      field: 'qrCode',
      headerName: 'QR',
      width: 45,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        if (!row.event_id || !row.has_form) return null;
        return (
          <QRCodePopover
            bookingTypeId={row.event_id}
            serviceName={row.event_name}
            size="small"
            autoGenerate={false}
          />
        );
      },
    },
    {
      field: 'event_name',
      headerName: 'Event',
      flex: 1,
      minWidth: 200,
      renderCell: ({ row }) => (
        row.has_form ? (
          <button
            onClick={() => handleEditClick(row)}
            className="text-primary-500 hover:text-primary-700 font-medium transition-colors text-sm"
          >
            {row.event_name || '(Unnamed Event)'}
          </button>
        ) : (
          <span className="font-medium text-neutral-500 text-sm">
            {row.event_name || '(Unnamed Event)'}
          </span>
        )
      )
    },
    { field: 'event_id', headerName: 'Event ID', width: 100 },
    {
      field: 'total',
      headerName: 'Leads',
      width: 100,
      renderCell: ({ row, value }) => (
        <span
          className={`px-2.5 py-0.5 text-xs font-medium rounded-full tabular-nums ${
            value > 0
              ? 'bg-[#E8FBFF] text-[#3BA8BD] cursor-pointer hover:bg-[#d0f4fc]'
              : 'bg-neutral-100 text-neutral-600'
          }`}
          onClick={value > 0 ? () => handleViewLeads(row) : undefined}
          title={value > 0 ? "Click to view leads" : "No leads yet"}
        >
          {value || 0}
        </span>
      )
    },
    {
      field: 'followed_up_count',
      headerName: 'Followed Up',
      width: 130,
      renderCell: ({ row }) => {
        const total = parseInt(row.total) || 0;
        const followedUp = parseInt(row.followed_up_count) || 0;
        const percent = total > 0 ? Math.round((followedUp / total) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums">{followedUp}/{total}</span>
            <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full tabular-nums ${
              percent >= 80 ? 'bg-[#E8F8ED] text-[#2A9147]' : percent >= 50 ? 'bg-[#FEF4E8] text-[#C77A26]' : 'bg-neutral-100 text-neutral-600'
            }`}>{percent}%</span>
          </div>
        );
      }
    },
    {
      field: 'first_submission',
      headerName: 'Created',
      width: 150,
      renderCell: ({ value }) => formatDate(value)
    },
    {
      field: 'last_submission',
      headerName: 'Last Lead',
      width: 150,
      renderCell: ({ value }) => formatDate(value)
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      renderCell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.has_form ? (
            <>
              <button title="Copy form URL" onClick={(e) => { e.stopPropagation(); copyFormUrl(row.event_id, row.event_name); }} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors rounded hover:bg-neutral-100">
                <ClipboardDocumentIcon className="h-4 w-4" />
              </button>
              <a title="Open form" href={`/booking-forms/event-lead?eventId=${encodeURIComponent(row.event_id)}&eventName=${encodeURIComponent(row.event_name)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1 text-neutral-400 hover:text-neutral-700 transition-colors rounded hover:bg-neutral-100">
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
              <button title="Delete form" onClick={(e) => { e.stopPropagation(); handleDeleteClick(row); }} className="p-1 text-neutral-400 hover:text-[#AE255B] transition-colors rounded hover:bg-neutral-100">
                <TrashIcon className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button title="Delete legacy event leads" onClick={(e) => { e.stopPropagation(); handleDeleteClick(row); }} className="p-1 text-neutral-400 hover:text-[#AE255B] transition-colors rounded hover:bg-neutral-100">
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )
    },
  ];

  // Leads columns for detail view
  const leadsColumns = [
    { field: 'first_name', headerName: 'First Name', width: 120 },
    { field: 'last_name', headerName: 'Last Name', width: 120 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'phone', headerName: 'Phone', width: 140 },
    {
      field: 'student_names',
      headerName: 'Students',
      width: 180,
      renderCell: ({ value }) => (
        <span className="text-sm truncate" title={value || ''}>{value || '—'}</span>
      )
    },
    {
      field: 'created_at',
      headerName: 'Submitted',
      width: 160,
      renderCell: ({ value }) => <span className="text-sm">{formatDateTime(value)}</span>
    },
    {
      field: 'notes',
      headerName: 'Notes',
      flex: 1,
      minWidth: 150,
      renderCell: ({ value }) => (
        <span className="text-sm truncate" title={value || ''}>{value || '—'}</span>
      )
    },
    {
      field: 'followed_up',
      headerName: 'Followed Up',
      width: 120,
      renderCell: ({ row }) => {
        const isFollowed = row.followed_up === true || row.followed_up === 'true';
        return (
          <span
            className={`px-2.5 py-0.5 text-xs font-medium rounded-full cursor-pointer ${
              isFollowed ? 'bg-[#E8F8ED] text-[#2A9147]' : 'bg-neutral-100 text-neutral-600'
            }`}
            onClick={() => handleFollowupToggle(row)}
          >
            {isFollowed ? 'Yes' : 'No'}
          </span>
        );
      }
    },
    {
      field: 'actions',
      headerName: '',
      width: 50,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <button title="Delete lead" onClick={() => handleDeleteLeadClick(row)} className="p-1 text-neutral-400 hover:text-[#AE255B] transition-colors rounded hover:bg-neutral-100">
          <TrashIcon className="h-4 w-4" />
        </button>
      )
    },
  ];

  const dataGridSx = {
    border: 'none',
    '& .MuiDataGrid-cell': { borderColor: '#f0f0f0', fontSize: '13px' },
    '& .MuiDataGrid-columnHeaders': { bgcolor: 'rgba(250,250,250,0.5)', borderTop: '1px solid #e5e5e5', borderBottom: '1px solid #e5e5e5' },
    '& .MuiDataGrid-columnHeaderTitle': { fontSize: '11px', fontWeight: 500, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em' },
    '& .MuiDataGrid-row:hover': { bgcolor: '#fafafa' },
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarIcon className="h-5 w-5 text-neutral-400" />
            <span className="text-xs text-neutral-500">Events</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">{eventRows.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <UserGroupIcon className="h-5 w-5 text-neutral-400" />
            <span className="text-xs text-neutral-500">Total Leads</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">{totalLeads}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircleIcon className="h-5 w-5 text-neutral-400" />
            <span className="text-xs text-neutral-500">Followed Up</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">{totalFollowedUp}</div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowTrendingUpIcon className={`h-5 w-5 ${followUpRate >= 80 ? 'text-[#34B256]' : 'text-[#F79A30]'}`} />
            <span className="text-xs text-neutral-500">Follow-up Rate</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900 tabular-nums">{followUpRate}%</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {selectedEvent ? (
            <button
              onClick={() => { setSelectedEvent(null); setEventLeads([]); setSearchQuery(''); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all duration-200"
            >
              <ArrowLeftIcon className="h-4 w-4" /> All Events
            </button>
          ) : (
            <button
              onClick={() => setCreateFormOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200"
            >
              <PlusIcon className="h-4 w-4" /> Create Event Form
            </button>
          )}

          <div className="relative flex-shrink-0" style={{ width: '280px' }}>
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder={selectedEvent ? "Search leads..." : "Search events..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div className="flex-1" />

          <button
            onClick={() => selectedEvent ? openEvent(selectedEvent) : fetchEvents()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all duration-200"
          >
            <ArrowPathIcon className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* Data Grid */}
        <div className="border-t border-neutral-200">
          {selectedEvent ? (
            <>
              <div className="px-4 py-3 border-b border-neutral-200">
                <h3 className="text-base font-semibold text-neutral-900">
                  {selectedEvent.event_name} — Leads ({filteredLeads.length})
                </h3>
              </div>
              <DataGrid
                rows={filteredLeads.map(r => ({ id: r.client_id || r.id, ...r }))}
                columns={leadsColumns}
                loading={loading}
                autoHeight
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25, page: 0 } },
                  sorting: { sortModel: [{ field: 'created_at', sort: 'desc' }] }
                }}
                disableRowSelectionOnClick
                sx={dataGridSx}
              />
            </>
          ) : (
            <DataGrid
              rows={(filteredEvents || []).map((r, i) => ({ id: i + 1, ...r }))}
              columns={eventsColumns}
              loading={loading}
              autoHeight
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25, page: 0 } },
                sorting: { sortModel: [{ field: 'first_submission', sort: 'desc' }] }
              }}
              disableRowSelectionOnClick
              sx={dataGridSx}
            />
          )}
        </div>
      </div>

      {/* Create/Edit Event Form Dialogs */}
      <EventLeadFormBuilder open={createFormOpen} onClose={() => setCreateFormOpen(false)} onSuccess={() => { setCreateFormOpen(false); fetchEvents(); }} />
      <EventLeadFormBuilder open={editFormOpen} onClose={() => { setEditFormOpen(false); setEventToEdit(null); }} onSuccess={() => { setEditFormOpen(false); setEventToEdit(null); fetchEvents(); }} eventToEdit={eventToEdit} />

      {/* Delete Lead Modal */}
      {deleteLeadConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900">Delete Lead?</h2>
              <button onClick={() => { setDeleteLeadConfirmOpen(false); setLeadToDelete(null); setDeleteError(null); }} className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-neutral-900 mb-1">Delete lead "{leadToDelete?.first_name} {leadToDelete?.last_name}"?</p>
              <p className="text-sm text-neutral-500">This will permanently remove this lead record.</p>
              {deleteError && <div className="mt-3 bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-lg p-3 text-sm text-[#AE255B]">{deleteError}</div>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              <button onClick={() => { setDeleteLeadConfirmOpen(false); setLeadToDelete(null); }} className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all duration-200">Cancel</button>
              <button onClick={handleDeleteLeadConfirm} className="px-4 py-2 text-sm font-medium text-white bg-[#DA2E72] rounded-md hover:bg-[#AE255B] transition-all duration-200">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Event Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h2 className="text-lg font-semibold text-neutral-900">{eventToDelete?.has_form ? 'Delete Event Form?' : 'Delete Event Leads?'}</h2>
              <button onClick={handleDeleteCancel} className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-neutral-900 mb-1">Are you sure you want to delete "{eventToDelete?.event_name}"?</p>
              <p className="text-sm text-neutral-500">
                {eventToDelete?.has_form
                  ? 'This will remove the form configuration. Any leads already collected will remain in the system.'
                  : `This will permanently delete all ${eventToDelete?.total || 0} lead(s) for this event.`}
              </p>
              {deleteError && <div className="mt-3 bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-lg p-3 text-sm text-[#AE255B]">{deleteError}</div>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
              <button onClick={handleDeleteCancel} className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all duration-200">Cancel</button>
              <button onClick={handleDeleteConfirm} className="px-4 py-2 text-sm font-medium text-white bg-[#DA2E72] rounded-md hover:bg-[#AE255B] transition-all duration-200">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
