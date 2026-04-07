import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import NotFound from './NotFound';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';
import { Button, Card, Badge } from './ui';
import {
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  UserIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  XCircleIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CurrencyDollarIcon,
  BoltIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  LinkIcon,
  UsersIcon,
  QuestionMarkCircleIcon,
  DocumentArrowUpIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid,
  XCircleIcon as XCircleIconSolid
} from '@heroicons/react/24/solid';

export default function LessonDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });
  const [activeTab, setActiveTab] = useState('general');
  const [actionLoading, setActionLoading] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showAddTutorModal, setShowAddTutorModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCancelDropdown, setShowCancelDropdown] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [availableTutors, setAvailableTutors] = useState([]);
  const [newNote, setNewNote] = useState('');
  
  // Student search modal state
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(-1);
  const [selectedStudentForAdd, setSelectedStudentForAdd] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentCustomRateEnabled, setStudentCustomRateEnabled] = useState(false);
  const [studentChargeRate, setStudentChargeRate] = useState('');
  const [studentMoreSettingsOpen, setStudentMoreSettingsOpen] = useState(false);
  
  // Tutor search modal state
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [filteredTutors, setFilteredTutors] = useState([]);
  const [selectedTutorIndex, setSelectedTutorIndex] = useState(-1);
  const [selectedTutorForAdd, setSelectedTutorForAdd] = useState(null);
  const [loadingTutors, setLoadingTutors] = useState(false);
  const [addingTutor, setAddingTutor] = useState(false);
  const [tutorCustomRateEnabled, setTutorCustomRateEnabled] = useState(false);
  const [tutorPayRate, setTutorPayRate] = useState('');
  const [tutorMoreSettingsOpen, setTutorMoreSettingsOpen] = useState(false);
  
  // Rate editing state for existing students/tutors
  const [editingStudentRate, setEditingStudentRate] = useState(null);
  const [studentRateEditValue, setStudentRateEditValue] = useState('');
  const [updatingStudentRate, setUpdatingStudentRate] = useState(false);
  const [editingTutorRate, setEditingTutorRate] = useState(null);
  const [tutorRateEditValue, setTutorRateEditValue] = useState('');
  const [updatingTutorRate, setUpdatingTutorRate] = useState(false);

  useEffect(() => {
    fetchLessonData();
  }, [id]);

  // Filter students based on search query
  useEffect(() => {
    if (studentSearchQuery.trim() === '') {
      setFilteredStudents(availableStudents);
      setSelectedStudentIndex(-1);
    } else {
      const query = studentSearchQuery.toLowerCase();
      const filtered = availableStudents.filter(student => {
        const studentName = (student.recipient_name || '').toLowerCase();
        const clientName = (student.paying_client_name || '').toLowerCase();
        return studentName.includes(query) || clientName.includes(query);
      });
      setFilteredStudents(filtered);
      setSelectedStudentIndex(-1);
    }
  }, [studentSearchQuery, availableStudents]);

  // Scroll to selected student
  useEffect(() => {
    if (selectedStudentIndex >= 0 && filteredStudents.length > 0) {
      const element = document.getElementById(`lesson-student-${selectedStudentIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedStudentIndex, filteredStudents]);

  // Filter tutors based on search query
  useEffect(() => {
    if (tutorSearchQuery.trim() === '') {
      const tutorsWithNames = availableTutors.filter(tutor => {
        const firstName = (tutor.first_name || '').trim();
        const lastName = (tutor.last_name || '').trim();
        return firstName || lastName;
      });
      setFilteredTutors(tutorsWithNames);
      setSelectedTutorIndex(-1);
    } else {
      const query = tutorSearchQuery.toLowerCase().trim();
      const filtered = availableTutors.filter(tutor => {
        const firstName = (tutor.first_name || '').toLowerCase().trim();
        const lastName = (tutor.last_name || '').toLowerCase().trim();
        if (!firstName && !lastName) {
          return false;
        }
        const fullName = `${firstName} ${lastName}`.trim();
        return firstName.includes(query) || lastName.includes(query) || fullName.includes(query);
      });
      setFilteredTutors(filtered);
      setSelectedTutorIndex(-1);
    }
  }, [tutorSearchQuery, availableTutors]);

  // Scroll to selected tutor
  useEffect(() => {
    if (selectedTutorIndex >= 0 && filteredTutors.length > 0) {
      const element = document.getElementById(`lesson-tutor-${selectedTutorIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedTutorIndex, filteredTutors]);

  // Fetch available students when modal opens
  useEffect(() => {
    if (showAddStudentModal) {
      fetchAvailableStudents();
      setStudentSearchQuery('');
      setSelectedStudentForAdd(null);
      setStudentCustomRateEnabled(false);
      setStudentChargeRate('');
      setStudentMoreSettingsOpen(false);
    }
  }, [showAddStudentModal]);

  // Fetch available tutors when modal opens
  useEffect(() => {
    if (showAddTutorModal) {
      fetchAvailableTutors();
      setTutorSearchQuery('');
      setSelectedTutorForAdd(null);
      setTutorCustomRateEnabled(false);
      setTutorPayRate('');
      setTutorMoreSettingsOpen(false);
    }
  }, [showAddTutorModal]);

  const fetchLessonData = async () => {
    try {
      const res = await fetch(`/api/entity-details/lessons/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('not-found');
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch lesson details');
      }
      const lessonData = await res.json();
      setData(lessonData);
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleTagCancellation = async (cancelledBy, reason, note) => {
    try {
      const res = await fetch(`/api/lessons-dashboard/${id}/cancel-reason`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cancelledBy, reason, note })
      });
      if (!res.ok) throw new Error('Failed to tag cancellation');
      await fetchLessonData();
      toast.success('Cancellation tagged successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to tag cancellation');
    }
  };

  const handleStatusChange = async (newStatus) => {
    setConfirmState({
      isOpen: true,
      title: 'Change Lesson Status',
      message: `Are you sure you want to mark this lesson as ${newStatus}?`,
      isDestructive: false,
      action: async () => {
        setActionLoading(true);
        try {
          const res = await fetch(`/api/lessons/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus })
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to update lesson status');
          }

          await fetchLessonData();
        } catch (err) {
          console.error('Error updating status:', err);
          toast.error(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const fetchAvailableStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/lessons/${id}/available-students`);
      if (res.ok) {
        const data = await res.json();
        setAvailableStudents(data || []);
        setFilteredStudents(data || []);
      }
    } catch (err) {
      console.error('Error fetching available students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchAvailableTutors = async () => {
    setLoadingTutors(true);
    try {
      const res = await fetch(`/api/lessons/${id}/available-tutors`);
      if (res.ok) {
        const data = await res.json();
        const tutorsWithNames = (data || []).filter(tutor => {
          const firstName = (tutor.first_name || '').trim();
          const lastName = (tutor.last_name || '').trim();
          return firstName || lastName;
        });
        setAvailableTutors(tutorsWithNames);
        setFilteredTutors(tutorsWithNames);
      }
    } catch (err) {
      console.error('Error fetching available tutors:', err);
    } finally {
      setLoadingTutors(false);
    }
  };

  const handleStudentKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedStudentIndex(prev =>
        prev < filteredStudents.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedStudentIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedStudentIndex >= 0) {
      e.preventDefault();
      handleSelectStudent(filteredStudents[selectedStudentIndex]);
    } else if (e.key === 'Escape') {
      setShowAddStudentModal(false);
    }
  };

  const handleTutorKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedTutorIndex(prev =>
        prev < filteredTutors.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedTutorIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedTutorIndex >= 0) {
      e.preventDefault();
      handleSelectTutor(filteredTutors[selectedTutorIndex]);
    } else if (e.key === 'Escape') {
      setShowAddTutorModal(false);
    }
  };

  const handleSelectStudent = (student) => {
    setSelectedStudentForAdd(student);
    setStudentSearchQuery(student.recipient_name || '');
    if (student.charge_rate) {
      setStudentChargeRate(parseFloat(student.charge_rate).toFixed(2));
    }
  };

  const handleSelectTutor = (tutor) => {
    setSelectedTutorForAdd(tutor);
    const tutorName = `${tutor.first_name || ''} ${tutor.last_name || ''}`.trim();
    setTutorSearchQuery(tutorName);
    if (tutor.default_rate) {
      setTutorPayRate(parseFloat(tutor.default_rate).toFixed(2));
    }
  };

  const handleAddStudent = async () => {
    if (!selectedStudentForAdd) return;
    
    setAddingStudent(true);
    try {
      const chargeRate = studentCustomRateEnabled && studentChargeRate 
        ? parseFloat(studentChargeRate) 
        : null;

      const res = await fetch(`/api/lessons/${id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          recipient: selectedStudentForAdd.recipient_id, 
          charge_rate: chargeRate 
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add student');
      }

      await fetchLessonData();
      setShowAddStudentModal(false);
      setSelectedStudentForAdd(null);
      setStudentSearchQuery('');
      setStudentChargeRate('');
      setStudentCustomRateEnabled(false);
      setStudentMoreSettingsOpen(false);
    } catch (err) {
      console.error('Error adding student:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Student',
      message: 'Are you sure you want to remove this student from the lesson?',
      isDestructive: false,
      action: async () => {
        setActionLoading(true);
        try {
          const res = await fetch(`/api/lessons/${id}/students/${studentId}`, {
            method: 'DELETE',
            credentials: 'include'
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to remove student');
          }

          await fetchLessonData();
        } catch (err) {
          console.error('Error removing student:', err);
          toast.error(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleAddTutor = async () => {
    if (!selectedTutorForAdd) return;
    
    setAddingTutor(true);
    try {
      const payRate = tutorCustomRateEnabled && tutorPayRate 
        ? parseFloat(tutorPayRate) 
        : null;

      const res = await fetch(`/api/lessons/${id}/tutors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          contractor: selectedTutorForAdd.contractor_id, 
          pay_rate: payRate 
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add tutor');
      }

      await fetchLessonData();
      setShowAddTutorModal(false);
      setSelectedTutorForAdd(null);
      setTutorSearchQuery('');
      setTutorPayRate('');
      setTutorCustomRateEnabled(false);
      setTutorMoreSettingsOpen(false);
    } catch (err) {
      console.error('Error adding tutor:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setAddingTutor(false);
    }
  };

  const handleRemoveTutor = async (tutorId) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Tutor',
      message: 'Are you sure you want to remove this tutor from the lesson?',
      isDestructive: false,
      action: async () => {
        setActionLoading(true);
        try {
          const res = await fetch(`/api/lessons/${id}/tutors/${tutorId}`, {
            method: 'DELETE',
            credentials: 'include'
          });

          if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to remove tutor');
          }

          await fetchLessonData();
        } catch (err) {
          console.error('Error removing tutor:', err);
          toast.error(`Error: ${err.message}`);
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleUpdateStudentRate = async (studentId, newRate) => {
    setUpdatingStudentRate(true);
    try {
      // Update the student's charge rate via PATCH endpoint
      const res = await fetch(`/api/lessons/${id}/students/${studentId}/rate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ charge_rate: newRate ? parseFloat(newRate) : null })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update student rate');
      }

      await fetchLessonData();
      setEditingStudentRate(null);
      setStudentRateEditValue('');
    } catch (err) {
      console.error('Error updating student rate:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setUpdatingStudentRate(false);
    }
  };

  const handleUpdateTutorRate = async (tutorId, newRate) => {
    setUpdatingTutorRate(true);
    try {
      // Update the tutor's pay rate via PATCH endpoint
      const res = await fetch(`/api/lessons/${id}/tutors/${tutorId}/rate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pay_rate: newRate ? parseFloat(newRate) : null })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update tutor rate');
      }

      await fetchLessonData();
      setEditingTutorRate(null);
      setTutorRateEditValue('');
    } catch (err) {
      console.error('Error updating tutor rate:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setUpdatingTutorRate(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('Please enter a note');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/lessons/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ note: newNote })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add note');
      }

      await fetchLessonData();
      setNewNote('');
      setShowNoteModal(false);
    } catch (err) {
      console.error('Error adding note:', err);
      toast.error(`Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <div className="max-w-7xl mx-auto w-full flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
            <p className="mt-4 text-neutral-600">Loading lesson details...</p>
          </div>
        </div>
      </>
    );
  }

  if (error === 'not-found') {
    return (
      <>
        <div className="max-w-7xl mx-auto w-full">
          <NotFound entityType="Lesson" entityId={id} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="max-w-7xl mx-auto w-full flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-[#DA2E72]">Error: {error}</p>
          </div>
        </div>
      </>
    );
  }

  const { appointment, relatedTutors, relatedStudents, tutorCruncherUrl, activity, communications, accounting, notes, reports } = data || {};

  if (!appointment) {
    return (
      <>
        <div className="max-w-7xl mx-auto w-full">
          <NotFound entityType="Lesson" entityId={id} />
        </div>
      </>
    );
  }

  const getStatusColorClass = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'complete' || statusLower === 'completed') {
      return 'bg-[#E8F8ED] text-[#2A9147]';
    } else if (statusLower === 'planned' || statusLower === 'awaiting confirmation' || statusLower.includes('planned')) {
      return 'bg-[#FEF4E8] text-[#C77A26]';
    } else if (statusLower === 'cancelled' || statusLower === 'cancelled-chargeable' || statusLower.includes('cancelled')) {
      return 'bg-[#FCE8F0] text-[#AE255B]';
    }
    return 'bg-neutral-100 text-neutral-800';
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'complete':
        return 'green';
      case 'planned':
      case 'awaiting confirmation':
        return 'yellow';
      case 'cancelled':
      case 'cancelled-chargeable':
        return 'red';
      default:
        return 'gray';
    }
  };

  const startDate = new Date(appointment.start);
  const endDate = new Date(appointment.finish);
  const duration = (endDate - startDate) / (1000 * 60); // minutes

  let locationInfo = null;
  let locationDisplay = null;
  if (appointment.location) {
    try {
      locationInfo = typeof appointment.location === 'string' 
        ? JSON.parse(appointment.location)
        : appointment.location;
      
      // Format location for display (matching TutorCruncher format)
      if (locationInfo.address) {
        locationDisplay = locationInfo.address;
      } else if (locationInfo.street) {
        const parts = [
          locationInfo.street,
          locationInfo.town,
          locationInfo.postcode,
          locationInfo.country
        ].filter(Boolean);
        locationDisplay = parts.join(', ');
      } else if (locationInfo.name) {
        locationDisplay = locationInfo.name;
      } else {
        locationDisplay = JSON.stringify(locationInfo);
      }
    } catch (e) {
      locationInfo = { name: appointment.location };
      locationDisplay = appointment.location;
    }
  }

  const statusLower = appointment.status?.toLowerCase() || '';
  const isPlanned = statusLower === 'planned' || statusLower === 'awaiting confirmation' || statusLower.includes('planned');
  const isComplete = statusLower === 'complete' || statusLower === 'completed' || statusLower.includes('complete');
  const isCancelled = statusLower === 'cancelled' || statusLower === 'canceled' || statusLower.includes('cancel');
  const canEdit = isPlanned;

  const tabs = [
    { id: 'general', name: 'General', icon: UserIcon },
    { id: 'activity', name: 'Activity', icon: BoltIcon },
    { id: 'communications', name: 'Communications', icon: ChatBubbleLeftRightIcon },
    { id: 'accounting', name: 'Accounting', icon: CurrencyDollarIcon }
  ];

  const lessonTitle = appointment.topic || `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()}`;

  return (
    <>
      <div className="w-full">
        {/* Breadcrumb + Title + Actions */}
        <div className="bg-white border-b border-neutral-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm mb-2 flex-wrap">
              <Link to="/scheduling/jobs" className="text-neutral-400 hover:text-[#6A469D] transition-colors">Jobs</Link>
              <span className="text-neutral-300">/</span>
              <Link to={`/jobs/${appointment.service_id}`} className="text-[#6A469D] hover:text-[#2D2F8E] font-medium transition-colors truncate max-w-[300px]">
                {appointment.service_name || `Job ${appointment.service_id}`}
              </Link>
              <span className="text-neutral-300">/</span>
              <span className="text-neutral-600 font-medium">Lesson</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">
                  {lessonTitle}
                </h1>
                {isComplete && (
                  <Badge className="bg-[#34B256]/10 text-[#34B256] border-[#34B256]/20 px-2.5 py-0.5 text-xs font-semibold">
                    Complete
                  </Badge>
                )}
                {isCancelled && (
                  <Badge className="bg-[#DA2E72]/10 text-[#DA2E72] border-[#DA2E72]/20 px-2.5 py-0.5 text-xs font-semibold">
                    Cancelled
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {tutorCruncherUrl && (
                  <a
                    href={tutorCruncherUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm font-medium"
                  >
                    <span className="whitespace-nowrap">View in TC</span>
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>

            {/* Job Context Strip */}
            {appointment.service_id && (
              <Link
                to={`/jobs/${appointment.service_id}`}
                className="mt-3 flex items-center gap-3 px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-[#6A469D]/20 hover:bg-[#6A469D]/5 transition-all group"
              >
                <div className="p-1.5 rounded bg-[#6A469D]/10">
                  <BriefcaseIcon className="h-4 w-4 text-[#6A469D]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate group-hover:text-[#6A469D]">
                    {appointment.service_name || `Job ${appointment.service_id}`}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {appointment.service_status && <span className="capitalize">{appointment.service_status}</span>}
                    {appointment.charge_type && <span> · {appointment.charge_type}</span>}
                  </p>
                </div>
                <ArrowRightIcon className="h-4 w-4 text-neutral-300 group-hover:text-[#6A469D] transition-colors" />
              </Link>
            )}
          </div>
        </div>

        {/* Tabs - Mobile Responsive */}
        {tabs.length > 0 && (
          <div className="bg-white border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0" aria-label="Tabs">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                          py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                          flex items-center gap-2 min-h-[44px] sm:min-h-0
                          ${isActive
                            ? 'border-brand-purple text-brand-purple'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                          }
                        `}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {Icon && <Icon className="h-5 w-5 flex-shrink-0" />}
                        <span>{tab.name}</span>
                      </button>
                    );
                  })}
                </nav>
                {/* Actions Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium min-h-[44px] sm:min-h-0 self-start sm:self-center"
                  >
                    <Cog6ToothIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Actions</span>
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showActionsDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowActionsDropdown(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg border border-neutral-200 py-1 z-20">
                        <Link
                          to={`/lessons/${id}/edit`}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                          onClick={() => setShowActionsDropdown(false)}
                        >
                          <PlusIcon className="h-4 w-4" />
                          Add New Lesson
                        </Link>
                        <Link
                          to={`/lessons/${id}/edit`}
                          className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                          onClick={() => setShowActionsDropdown(false)}
                        >
                          Edit
                        </Link>
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
                          disabled
                        >
                          Repeat: Weekly
                        </button>
                        <button
                          className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-[#DA2E72] hover:bg-[#FCE8F0]"
                          onClick={() => {
                            setShowActionsDropdown(false);
                            setConfirmState({
                              isOpen: true,
                              title: 'Delete Lesson',
                              message: 'Are you sure you want to delete this lesson? This action cannot be undone.',
                              isDestructive: true,
                              action: async () => {
                                setActionLoading(true);
                                try {
                                  const res = await fetch(`/api/lessons/${id}`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include'
                                  });

                                  if (!res.ok) {
                                    const error = await res.json();
                                    throw new Error(error.error || 'Failed to delete lesson');
                                  }

                                  // Navigate back to the job page
                                  window.location.href = `/jobs/${appointment.service_id}`;
                                } catch (err) {
                                  console.error('Error deleting lesson:', err);
                                  toast.error(`Error: ${err.message}`);
                                } finally {
                                  setActionLoading(false);
                                }
                              }
                            });
                          }}
                          disabled={actionLoading}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                          Delete
                        </button>
                        <button
                          className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                          onClick={() => {
                            setShowActionsDropdown(false);
                            // TODO: Implement safeguarding concern reporting
                          }}
                        >
                          Report a Safeguarding/Wellbeing Concern
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content - Matching Jobs Page Padding */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
          {/* Tab Content */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Cancelled Status Card - Centered at Top */}
              {isCancelled && (
                <div className="flex justify-center">
                  <div className="w-full max-w-2xl">
                    <Card className="bg-gradient-to-br from-[#FCE8F0] to-white border-[#DA2E72]/30">
                      <div className="text-center mb-4">
                        <div className="flex justify-center mb-3">
                          <div className="h-16 w-16 rounded-full bg-[#FCE8F0] flex items-center justify-center">
                            <XCircleIconSolid className="h-10 w-10 text-[#DA2E72]" />
                          </div>
                        </div>
                        <h3 className="text-3xl font-bold text-[#AE255B] mb-2">Cancelled</h3>
                        <p className="text-base text-neutral-700 mb-4 font-medium">
                          This lesson has been cancelled and is not billable.
                        </p>
                        <div className="text-lg font-semibold text-neutral-900 mb-1">
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-neutral-600 mb-6">
                          {startDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>

                        {/* Cancellation Attribution */}
                        {appointment.cancelled_by ? (
                          <div className="mb-4 p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-left">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-600">Cancelled By:</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  appointment.cancelled_by === 'client' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                                  appointment.cancelled_by === 'tutor' ? 'bg-[#FEF4E8] text-[#C77A26]' :
                                  'bg-neutral-100 text-neutral-600'
                                }`}>
                                  {appointment.cancelled_by.charAt(0).toUpperCase() + appointment.cancelled_by.slice(1)}
                                </span>
                              </div>
                              <button
                                onClick={() => setShowTagModal(true)}
                                className="text-xs font-medium text-[#6A469D] hover:text-[#5B3C87] transition-colors"
                              >
                                Re-tag
                              </button>
                            </div>
                            {appointment.cancellation_reason && (
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-neutral-600">Reason:</span>
                                <span className="text-sm text-neutral-900">
                                  {{ rescheduled: 'Rescheduled', no_show: 'No Show', sick: 'Sick', schedule_conflict: 'Schedule Conflict', weather: 'Weather', other: 'Other' }[appointment.cancellation_reason] || appointment.cancellation_reason}
                                </span>
                              </div>
                            )}
                            {appointment.cancellation_note && (
                              <p className="text-sm text-neutral-600 mt-2 italic">{appointment.cancellation_note}</p>
                            )}
                          </div>
                        ) : (
                          <div className="mb-4">
                            <button
                              onClick={() => setShowTagModal(true)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#6A469D] text-white rounded-lg hover:bg-[#5B3C87] transition-colors font-medium text-sm shadow-sm"
                            >
                              <ExclamationTriangleIcon className="h-4 w-4" />
                              Tag This Cancellation
                            </button>
                            <p className="text-xs text-neutral-500 mt-2">Who cancelled and why?</p>
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => {
                              setConfirmState({
                                isOpen: true,
                                title: 'Complete Lesson',
                                message: 'Are you sure you want to mark this lesson as complete?',
                                isDestructive: false,
                                action: async () => {
                                  setActionLoading(true);
                                  try {
                                    const response = await fetch(`/api/lessons/${id}/status`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify({ status: 'complete' })
                                    });
                                    if (response.ok) {
                                      await fetchLessonData();
                                    }
                                  } catch (error) {
                                    console.error('Error updating lesson status:', error);
                                  } finally {
                                    setActionLoading(false);
                                  }
                                }
                              });
                            }}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#34B256] text-white rounded-md hover:bg-[#2A9147] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircleIconSolid className="h-4 w-4" />
                            Complete
                          </button>
                          <button
                            onClick={() => setShowMoreDetails(!showMoreDetails)}
                            className="text-sm text-brand-purple hover:text-brand-navy transition-colors mt-2"
                          >
                            {showMoreDetails ? 'Hide details' : 'More details'}
                          </button>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
              {/* Complete Status Card - Centered at Top */}
              {isComplete && (
                <div className="flex justify-center">
                  <div className="w-full max-w-2xl">
                    <Card className="bg-gradient-to-br from-green-50 to-white border-[#34B256]/20">
                      <div className="text-center mb-4">
                        <div className="flex justify-center mb-3">
                          <div className="h-16 w-16 rounded-full bg-[#E8F8ED] flex items-center justify-center">
                            <CheckCircleIconSolid className="h-10 w-10 text-[#34B256]" />
                          </div>
                        </div>
                        <h3 className="text-3xl font-bold text-[#2A9147] mb-2">Complete</h3>
                        <p className="text-base text-neutral-700 mb-4 font-medium">
                          This lesson is complete and is ready for billing.
                        </p>
                        <div className="text-lg font-semibold text-neutral-900 mb-1">
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-neutral-600 mb-6">
                          {startDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            disabled
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#34B256] text-white rounded-md opacity-75 cursor-not-allowed"
                          >
                            <CheckCircleIconSolid className="h-4 w-4" />
                            Complete
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setShowCancelDropdown(!showCancelDropdown)}
                              disabled={actionLoading}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <XCircleIconSolid className="h-4 w-4" />
                              Cancel
                              <svg className={`h-4 w-4 transition-transform ${showCancelDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {showCancelDropdown && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setShowCancelDropdown(false)}
                                />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border border-neutral-200 py-1 z-20">
                                  <button
                                    onClick={() => {
                                      setShowCancelDropdown(false);
                                      handleStatusChange('cancelled');
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 flex items-center gap-2"
                                  >
                                    <XCircleIconSolid className="h-4 w-4" />
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowCancelDropdown(false);
                                      handleStatusChange('cancelled-chargeable');
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 flex items-center gap-2"
                                  >
                                    <XCircleIconSolid className="h-4 w-4" />
                                    Cancel but still charge
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <button 
                            onClick={() => setShowMoreDetails(!showMoreDetails)}
                            className="text-sm text-[#2A9147] hover:text-[#2A9147] text-center mt-2 underline font-medium"
                          >
                            More details
                            <svg className={`h-4 w-4 inline ml-1 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {showMoreDetails && (
                            <div className="mt-4 pt-4 border-t border-[#34B256]/20 space-y-3 text-left">
                              {(appointment.repeat_pattern || appointment.repeat || appointment.source_apt) && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Repeats:</span>{' '}
                                  <span className="text-sm text-neutral-900">
                                    {appointment.repeat_pattern || appointment.repeat || 'Weekly'}
                                    {appointment.stops_after && ` - Stops after ${appointment.stops_after} lessons`}
                                    {appointment.stops_on && ` - Stops on ${new Date(appointment.stops_on).toLocaleDateString()}`}
                                  </span>
                                  {(appointment.source_apt || appointment.original_appointment_id) && (
                                    <Link
                                      to={`/lessons/${appointment.source_apt || appointment.original_appointment_id}`}
                                      className="text-sm text-[#2A9147] hover:text-[#2A9147] underline ml-2"
                                    >
                                      View Original Lesson
                                    </Link>
                                  )}
                                </div>
                              )}
                              {locationInfo && locationDisplay && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Location:</span>{' '}
                                  <a
                                    href={`https://maps.google.com/?q=${encodeURIComponent(locationDisplay)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-[#2A9147] hover:text-[#2A9147] underline"
                                  >
                                    {locationDisplay}
                                  </a>
                                </div>
                              )}
                              {appointment.topic && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Topic:</span>{' '}
                                  <span className="text-sm text-neutral-900">{appointment.topic}</span>
                                </div>
                              )}
                              {duration && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Duration:</span>{' '}
                                  <span className="text-sm text-neutral-900">
                                    {Math.floor(duration / 60)}h {duration % 60}m
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}
              {/* Planned Status Card - Centered at Top */}
              {isPlanned && (
                <div className="flex justify-center">
                  <div className="w-full max-w-2xl">
                    <Card>
                      <div className="text-center mb-4">
                        <div className="flex justify-center mb-3">
                          <div className="h-16 w-16 rounded-full bg-brand-purple/10 flex items-center justify-center">
                            <CalendarIcon className="h-8 w-8 text-brand-purple" />
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold text-neutral-900 mb-2">Planned</h3>
                        <p className="text-sm text-neutral-600 mb-4">This lesson is scheduled to happen.</p>
                        <div className="text-lg font-semibold text-neutral-900 mb-1">
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-neutral-600 mb-6">
                          {startDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleStatusChange('complete')}
                            disabled={actionLoading}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#34B256] text-white rounded-md hover:bg-[#2A9147] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CheckCircleIconSolid className="h-4 w-4" />
                            Complete
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setShowCancelDropdown(!showCancelDropdown)}
                              disabled={actionLoading}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <XCircleIconSolid className="h-4 w-4" />
                              Cancel
                              <svg className={`h-4 w-4 transition-transform ${showCancelDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {showCancelDropdown && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={() => setShowCancelDropdown(false)}
                                />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-md shadow-lg border border-neutral-200 py-1 z-20">
                                  <button
                                    onClick={() => {
                                      setShowCancelDropdown(false);
                                      handleStatusChange('cancelled');
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 flex items-center gap-2"
                                  >
                                    <XCircleIconSolid className="h-4 w-4" />
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      setShowCancelDropdown(false);
                                      handleStatusChange('cancelled-chargeable');
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 flex items-center gap-2"
                                  >
                                    <XCircleIconSolid className="h-4 w-4" />
                                    Cancel but still charge
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                          <button 
                            onClick={() => setShowMoreDetails(!showMoreDetails)}
                            className="text-sm text-brand-purple hover:text-brand-navy text-center mt-2 underline"
                          >
                            More details
                            <svg className={`h-4 w-4 inline ml-1 transition-transform ${showMoreDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {showMoreDetails && (
                            <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 text-left">
                              {(appointment.repeat_pattern || appointment.repeat || appointment.source_apt) && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Repeats:</span>{' '}
                                  <span className="text-sm text-neutral-900">
                                    {appointment.repeat_pattern || appointment.repeat || 'Weekly'}
                                    {appointment.stops_after && ` - Stops after ${appointment.stops_after} lessons`}
                                    {appointment.stops_on && ` - Stops on ${new Date(appointment.stops_on).toLocaleDateString()}`}
                                  </span>
                                  {(appointment.source_apt || appointment.original_appointment_id) && (
                                    <Link
                                      to={`/lessons/${appointment.source_apt || appointment.original_appointment_id}`}
                                      className="text-sm text-brand-purple hover:text-brand-navy underline ml-2"
                                    >
                                      View Original Lesson
                                    </Link>
                                  )}
                                </div>
                              )}
                              {locationInfo && locationDisplay && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Location:</span>{' '}
                                  <a
                                    href={`https://maps.google.com/?q=${encodeURIComponent(locationDisplay)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-brand-purple hover:text-brand-navy underline"
                                  >
                                    {locationDisplay}
                                  </a>
                                </div>
                              )}
                              {appointment.topic && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Topic:</span>{' '}
                                  <span className="text-sm text-neutral-900">{appointment.topic}</span>
                                </div>
                              )}
                              {appointment.charge_type && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Charge Type:</span>{' '}
                                  <span className="text-sm text-neutral-900">{appointment.charge_type}</span>
                                </div>
                              )}
                              {duration && (
                                <div>
                                  <span className="text-sm font-medium text-neutral-700">Duration:</span>{' '}
                                  <span className="text-sm text-neutral-900">
                                    {duration} minutes ({appointment.units ? `${parseFloat(appointment.units).toFixed(2)} hours` : 'N/A'})
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              )}

              {/* Row 2: Students (left) and Tutors (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Students Section with Add/Remove */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AcademicCapIcon className="h-5 w-5 text-brand-purple" />
                      <h3 className="text-lg font-semibold text-neutral-900">Students</h3>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => setShowAddStudentModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {relatedStudents && relatedStudents.length > 0 ? (
                    <div className="space-y-3">
                      {relatedStudents.map((student, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/students/${student.recipient_id}`}
                                className="font-medium text-brand-purple hover:text-brand-navy"
                              >
                                {student.recipient_name || 'Unknown Student'}
                              </Link>
                              {editingStudentRate === student.recipient_id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={studentRateEditValue}
                                    onChange={(e) => setStudentRateEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleUpdateStudentRate(student.recipient_id, studentRateEditValue);
                                      } else if (e.key === 'Escape') {
                                        setEditingStudentRate(null);
                                        setStudentRateEditValue('');
                                      }
                                    }}
                                    className="w-24 px-2 py-1 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleUpdateStudentRate(student.recipient_id, studentRateEditValue)}
                                    disabled={updatingStudentRate}
                                    className="text-[#34B256] hover:text-[#2A9147]"
                                  >
                                    <CheckCircleIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingStudentRate(null);
                                      setStudentRateEditValue('');
                                    }}
                                    className="text-[#DA2E72] hover:text-[#AE255B]"
                                  >
                                    <XCircleIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-neutral-600">
                                    {student.charge_rate ? `$${parseFloat(student.charge_rate).toFixed(2)}/hour` : 'No rate set'}
                                  </span>
                                  {canEdit && (
                                    <button
                                      onClick={() => {
                                        setEditingStudentRate(student.recipient_id);
                                        setStudentRateEditValue(student.charge_rate ? parseFloat(student.charge_rate).toFixed(2) : '');
                                      }}
                                      className="p-1 text-brand-purple hover:text-brand-navy hover:bg-[#6A469D]/5 rounded transition-colors"
                                    >
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-neutral-500 mt-1">
                              {student.attendance_status && `Status: ${student.attendance_status}`}
                              {student.attendance_status && student.paying_client_name && ' • '}
                              {student.paying_client_name && (
                                <>
                                  (Client: {' '}
                                  <Link
                                    to={`/clients/${student.paying_client_id}`}
                                    className="text-brand-purple hover:text-brand-navy"
                                  >
                                    {student.paying_client_name}
                                  </Link>
                                  {student.available_balance !== undefined ? ` • Available Balance: $${parseFloat(student.available_balance).toFixed(2)}` : ''})
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <>
                                <button
                                  className="p-1 text-[#34B256] hover:text-[#2A9147] hover:bg-[#E8F8ED] rounded transition-colors relative group"
                                >
                                  <CheckCircleIcon className="h-4 w-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-[#50C8DF] bg-white rounded shadow-lg border border-[#50C8DF]/20 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    Attended - chargeable
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white"></span>
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-blue-200"></span>
                                  </span>
                                </button>
                                <button
                                  onClick={() => handleRemoveStudent(student.recipient_id)}
                                  disabled={actionLoading}
                                  className="p-1 text-[#DA2E72] hover:text-[#AE255B] hover:bg-[#FCE8F0] rounded transition-colors disabled:opacity-50 relative group"
                                >
                                  <XCircleIcon className="h-4 w-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-[#50C8DF] bg-white rounded shadow-lg border border-[#50C8DF]/20 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    Remove from Lesson
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white"></span>
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-blue-200"></span>
                                  </span>
                                </button>
                                <button
                                  className="p-1 text-brand-purple hover:text-brand-navy hover:bg-[#6A469D]/5 rounded transition-colors relative group"
                                >
                                  <CurrencyDollarIcon className="h-4 w-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-[#50C8DF] bg-white rounded shadow-lg border border-[#50C8DF]/20 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    Did not attend - chargeable
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white"></span>
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-blue-200"></span>
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-500">No students enrolled</p>
                  )}
                </Card>

                {/* Tutors Section with Add/Remove */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-5 w-5 text-brand-purple" />
                      <h3 className="text-lg font-semibold text-neutral-900">Tutors</h3>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => setShowAddTutorModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add
                      </button>
                    )}
                  </div>
                  {relatedTutors && relatedTutors.length > 0 ? (
                    <div className="space-y-3">
                      {relatedTutors.map((tutor, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Link
                                to={`/tutors/${tutor.contractor_id}`}
                                className="font-medium text-brand-purple hover:text-brand-navy"
                              >
                                {tutor.first_name} {tutor.last_name}
                              </Link>
                              {editingTutorRate === tutor.contractor_id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={tutorRateEditValue}
                                    onChange={(e) => setTutorRateEditValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleUpdateTutorRate(tutor.contractor_id, tutorRateEditValue);
                                      } else if (e.key === 'Escape') {
                                        setEditingTutorRate(null);
                                        setTutorRateEditValue('');
                                      }
                                    }}
                                    className="w-24 px-2 py-1 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleUpdateTutorRate(tutor.contractor_id, tutorRateEditValue)}
                                    disabled={updatingTutorRate}
                                    className="text-[#34B256] hover:text-[#2A9147]"
                                  >
                                    <CheckCircleIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingTutorRate(null);
                                      setTutorRateEditValue('');
                                    }}
                                    className="text-[#DA2E72] hover:text-[#AE255B]"
                                  >
                                    <XCircleIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-neutral-600">
                                    {tutor.pay_rate ? `$${parseFloat(tutor.pay_rate).toFixed(2)}/hour` : 'No rate set'}
                                  </span>
                                  {canEdit && (
                                    <button
                                      onClick={() => {
                                        setEditingTutorRate(tutor.contractor_id);
                                        setTutorRateEditValue(tutor.pay_rate ? parseFloat(tutor.pay_rate).toFixed(2) : '');
                                      }}
                                      className="p-1 text-brand-purple hover:text-brand-navy hover:bg-[#6A469D]/5 rounded transition-colors"
                                    >
                                      <PencilIcon className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-neutral-500 mt-1">
                              {tutor.permissions && `(Permissions: ${tutor.permissions})`}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => handleRemoveTutor(tutor.contractor_id)}
                                  disabled={actionLoading}
                                  className="p-1 text-[#DA2E72] hover:text-[#AE255B] hover:bg-[#FCE8F0] rounded transition-colors disabled:opacity-50 relative group"
                                >
                                  <XCircleIcon className="h-4 w-4" />
                                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-[#50C8DF] bg-white rounded shadow-lg border border-[#50C8DF]/20 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    Remove from Lesson
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white"></span>
                                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-blue-200"></span>
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-500">No tutors assigned</p>
                  )}
                </Card>
              </div>

              {/* Row 3: Lesson Reports (left) and Notes (right) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Lesson Reports */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="h-5 w-5 text-brand-purple" />
                      <h3 className="text-lg font-semibold text-neutral-900">Lesson Reports</h3>
                    </div>
                    {canEdit && (
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors">
                        <PlusIcon className="h-4 w-4" />
                        Create
                      </button>
                    )}
                  </div>
                  {reports && reports.length > 0 ? (
                    <div className="space-y-3">
                      {reports.map((report, idx) => (
                        <div key={idx} className="p-3 border border-neutral-200 rounded-lg">
                          <div className="font-medium text-neutral-900">{report.student_name || 'Report'}</div>
                          <div className="text-sm text-neutral-500 mt-1">
                            Status: {report.status} • {report.date_sent ? `Sent: ${new Date(report.date_sent).toLocaleDateString()}` : 'Pending'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-neutral-600 mb-2">
                        Reports allow you, the tutors, and the clients, to keep track of the students' progress. When a lesson is marked as complete, the user will be prompted to fill in a lesson report. You can also customise your reports by creating extra fields using custom field definitions. Reports for this Lesson will be displayed here.
                      </p>
                    </div>
                  )}
                </Card>

                {/* Notes Section */}
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <InformationCircleIcon className="h-5 w-5 text-brand-purple" />
                      <h3 className="text-lg font-semibold text-neutral-900">Notes</h3>
                    </div>
                    <button
                      onClick={() => setShowNoteModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                  {notes && notes.length > 0 ? (
                    <div className="space-y-3">
                      {notes.map((note, idx) => (
                        <div key={idx} className="p-3 border border-neutral-200 rounded-lg">
                          <div className="text-sm text-neutral-900">{note.note || note.content}</div>
                          <div className="text-xs text-neutral-500 mt-1">
                            {note.created_at ? new Date(note.created_at).toLocaleString() : 'No date'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-neutral-600 mb-2">
                        Notes allow admins to leave comments on users, jobs and lessons. Notes are only viewable by yourself and other administrators with the correct permissions. They cannot be viewed by that user, client or tutor.
                      </p>
                    </div>
                  )}
                </Card>
              </div>

              {/* Row 4: Job (full width) */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <LinkIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Job</h3>
                  <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                </div>
                <Link
                  to={`/jobs/${appointment.service_id}`}
                  className="text-brand-purple hover:text-brand-navy font-medium"
                >
                  {appointment.service_name || `Job ${appointment.service_id}`}
                </Link>
                {appointment.service_status && (
                  <div className="mt-2 text-sm text-neutral-500">
                    Status: {appointment.service_status}
                  </div>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* Documents Section */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DocumentArrowUpIcon className="h-5 w-5 text-brand-purple" />
                    <h3 className="text-lg font-semibold text-neutral-900">Documents</h3>
                    <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                  </div>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors">
                    <DocumentArrowUpIcon className="h-4 w-4" />
                    Upload
                  </button>
                </div>
                <p className="text-sm text-neutral-500">No Documents</p>
              </Card>

              {/* Ad Hoc Charges Section */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CurrencyDollarIcon className="h-5 w-5 text-brand-purple" />
                    <h3 className="text-lg font-semibold text-neutral-900">Ad Hoc Charges</h3>
                    <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                  </div>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors">
                    <PlusIcon className="h-4 w-4" />
                    Add
                  </button>
                </div>
                <p className="text-sm text-neutral-600 mb-2">
                  Ad hoc charges are any charges that are not lesson-based. For example, these could be expenses, registration or consultation fees. Like lesson charges, these can be used to both charge the client and pay the tutor with some or all of the charge and it can also include a share of the commission being passed to an affiliate. It can also do either of these individually. Ad Hoc Charges related to this Lesson will be displayed here.
                </p>
              </Card>

              {/* Lesson Recordings Section */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <VideoCameraIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Lesson Recordings</h3>
                  <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                </div>
                <p className="text-sm text-neutral-600">
                  There are currently no recordings for this Lesson. Lesson Recordings are currently only available with the TC Video integration. Enabling lesson recordings on a job will automatically record all lessons on the job, these can then be accessed by anyone involved on the lesson or under Activity &gt; Lesson Recordings.
                </p>
              </Card>

              {/* Activity Feed Section */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BoltIcon className="h-5 w-5 text-brand-purple" />
                    <h3 className="text-lg font-semibold text-neutral-900">Activity Feed</h3>
                    <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                  </div>
                  <Link to="#" className="text-sm text-brand-purple hover:text-brand-navy">
                    more
                  </Link>
                </div>
                {activity && activity.length > 0 ? (
                  <div className="space-y-4">
                    {activity.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-3 pb-4 border-b border-neutral-200 last:border-0">
                        <div className="flex-shrink-0">
                          <div className="h-8 w-8 rounded-full bg-brand-purple/10 flex items-center justify-center">
                            <BoltIcon className="h-5 w-5 text-brand-purple" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-neutral-900">{item.description || item.action}</div>
                          <div className="text-xs text-neutral-500 mt-1">
                            {item.user_name || 'System'} • {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown time'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-500">No activity recorded</p>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'communications' && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ChatBubbleLeftRightIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Related Emails</h3>
                  <QuestionMarkCircleIcon className="h-4 w-4 text-accent-green" />
                </div>
              </div>
          {communications && communications.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">To</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Subject</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Send Time</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {communications.map((comm, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-brand-purple">
                        {comm.to || comm.client_email || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900">{comm.subject || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">{comm.status || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {comm.send_time || comm.date_sent ? new Date(comm.send_time || comm.date_sent).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
              <p className="text-neutral-500">No communications found</p>
            )}
            </Card>
          )}

          {activeTab === 'accounting' && (
            <div className="space-y-6">
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <CurrencyDollarIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Credit Requests</h3>
                </div>
            {accounting?.credit_requests && accounting.credit_requests.length > 0 ? (
              <div className="space-y-3">
                {accounting.credit_requests.map((cr, idx) => (
                  <div key={idx} className="p-3 border border-neutral-200 rounded-lg">
                    <div className="text-sm text-neutral-900">Credit Request #{cr.id}</div>
                    <div className="text-xs text-neutral-500 mt-1">Amount: ${cr.amount}</div>
                  </div>
                ))}
              </div>
            ) : (
                <p className="text-neutral-500">No Credit Requests</p>
              )}
              </Card>

              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <CurrencyDollarIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Invoices</h3>
                </div>
            {accounting?.invoices && accounting.invoices.length > 0 ? (
              <div className="space-y-3">
                {accounting.invoices.map((inv, idx) => (
                  <Link
                    key={idx}
                    to={`/accounting/invoices/${inv.id}`}
                    className="block p-3 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-[#6A469D]/5 transition-all cursor-pointer"
                  >
                    <div className="text-sm font-medium text-neutral-900">Invoice #{inv.invoice_number || inv.id}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Amount: ${parseFloat(inv.gross || 0).toFixed(2)}
                      {inv.client_first_name && inv.client_last_name && (
                        <span className="ml-2">• Client: {inv.client_first_name} {inv.client_last_name}</span>
                      )}
                    </div>
                    {inv.status && (
                      <div className="text-xs text-neutral-500 mt-1">Status: {inv.status}</div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
                <p className="text-neutral-500">No Invoices</p>
              )}
              </Card>

              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <CurrencyDollarIcon className="h-5 w-5 text-brand-purple" />
                  <h3 className="text-lg font-semibold text-neutral-900">Payment Orders</h3>
                </div>
            {accounting?.payment_orders && accounting.payment_orders.length > 0 ? (
              <div className="space-y-3">
                {accounting.payment_orders.map((po, idx) => (
                  <Link
                    key={idx}
                    to={`/accounting/payment-orders/${po.id}`}
                    className="block p-3 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-[#6A469D]/5 transition-all cursor-pointer"
                  >
                    <div className="text-sm font-medium text-neutral-900">Payment Order #{po.payment_order_number || po.id}</div>
                    <div className="text-xs text-neutral-500 mt-1">
                      Amount: ${parseFloat(po.total_to_pay_tutor || po.amount || 0).toFixed(2)}
                      {po.payee_first && po.payee_last && (
                        <span className="ml-2">• Tutor: {po.payee_first} {po.payee_last}</span>
                      )}
                    </div>
                    {po.status && (
                      <div className="text-xs text-neutral-500 mt-1">Status: {po.status}</div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
                <p className="text-neutral-500">No Payment Orders</p>
              )}
              </Card>
            </div>
          )}

      {/* Student Search Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75" onClick={() => setShowAddStudentModal(false)} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-neutral-900">Add Student</h3>
                  <button
                    onClick={() => setShowAddStudentModal(false)}
                    className="text-neutral-400 hover:text-neutral-500"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    onKeyDown={handleStudentKeyDown}
                    placeholder="Search by student name or client name..."
                    className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    autoFocus
                  />
                  {loadingStudents && (
                    <div className="absolute right-3 top-2.5 text-neutral-400">Loading...</div>
                  )}
                </div>
                <div className="mt-4 max-h-64 overflow-y-auto">
                  {filteredStudents.length > 0 ? (
                    <ul className="space-y-1">
                      {filteredStudents.map((student, idx) => (
                        <li
                          key={student.recipient_id}
                          id={`lesson-student-${idx}`}
                          onClick={() => handleSelectStudent(student)}
                          className={`px-4 py-2 cursor-pointer rounded-md ${
                            idx === selectedStudentIndex
                              ? 'bg-brand-purple text-white'
                              : 'hover:bg-neutral-100'
                          }`}
                        >
                          <div className="font-medium">{student.recipient_name || 'Unknown Student'}</div>
                          {student.paying_client_name && (
                            <div className={`text-sm ${idx === selectedStudentIndex ? 'text-white/90' : 'text-neutral-500'}`}>
                              Client: {student.paying_client_name}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-8 text-neutral-500">
                      {loadingStudents ? 'Loading students...' : 'No students found'}
                    </div>
                  )}
                </div>
                
                {/* Student Selection Form */}
                {selectedStudentForAdd && (
                  <div className="mt-6 pt-6 border-t border-neutral-200">
                    <div className="mb-4">
                      <div className="font-medium text-neutral-900 mb-1">
                        Selected Student: {selectedStudentForAdd.recipient_name || 'Unknown Student'}
                      </div>
                      {selectedStudentForAdd.charge_rate && (
                        <div className="text-sm text-neutral-500">
                          Default Charge Rate: ${parseFloat(selectedStudentForAdd.charge_rate).toFixed(2)}/hour
                        </div>
                      )}
                    </div>

                    {/* More settings */}
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => setStudentMoreSettingsOpen(!studentMoreSettingsOpen)}
                        className="flex items-center gap-2 text-sm text-[#50C8DF] hover:text-[#3BA8BD]"
                      >
                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${studentMoreSettingsOpen ? 'rotate-180' : ''}`} />
                        More settings
                      </button>

                      {studentMoreSettingsOpen && (
                        <div className="mt-3 pl-6 border-l-2 border-neutral-200">
                          <label className="flex items-start gap-3 cursor-pointer mb-3">
                            <input
                              type="checkbox"
                              checked={studentCustomRateEnabled}
                              onChange={(e) => setStudentCustomRateEnabled(e.target.checked)}
                              className="mt-1 h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                            />
                            <div>
                              <div className="text-sm font-medium text-neutral-900">
                                Charge custom rate
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">
                                You can choose to override the default charge rate for this particular Student.
                              </div>
                            </div>
                          </label>

                          {studentCustomRateEnabled && (
                            <div className="ml-7">
                              <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Custom Charge Rate ($/hour)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={studentChargeRate}
                                onChange={(e) => setStudentChargeRate(e.target.value)}
                                placeholder={selectedStudentForAdd.charge_rate ? parseFloat(selectedStudentForAdd.charge_rate).toFixed(2) : '0.00'}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddStudentModal(false);
                          setSelectedStudentForAdd(null);
                          setStudentChargeRate('');
                          setStudentCustomRateEnabled(false);
                          setStudentMoreSettingsOpen(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddStudent}
                        disabled={addingStudent}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingStudent ? 'Adding...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tutor Search Modal */}
      {showAddTutorModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75" onClick={() => setShowAddTutorModal(false)} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-neutral-900">Add Tutor</h3>
                  <button
                    onClick={() => setShowAddTutorModal(false)}
                    className="text-neutral-400 hover:text-neutral-500"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="relative" autoComplete="off">
                  <input
                    type="search"
                    value={tutorSearchQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.includes('@') && value.includes('.')) {
                        const namePart = value.split('@')[0];
                        setTutorSearchQuery(namePart || '');
                      } else {
                        setTutorSearchQuery(value);
                      }
                      setSelectedTutorIndex(-1);
                    }}
                    onKeyDown={handleTutorKeyDown}
                    placeholder="Type tutor first or last name to search..."
                    className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                  {loadingTutors && (
                    <div className="absolute right-3 top-2.5 text-neutral-400">Loading...</div>
                  )}
                </div>
                <div className="mt-4 max-h-64 overflow-y-auto">
                  {filteredTutors.length > 0 ? (
                    <ul className="space-y-1">
                      {filteredTutors.map((tutor, idx) => {
                        const firstName = (tutor.first_name || '').trim();
                        const lastName = (tutor.last_name || '').trim();
                        const tutorName = `${firstName} ${lastName}`.trim();
                        
                        if (!tutorName) {
                          return null;
                        }
                        
                        return (
                          <li
                            key={tutor.contractor_id}
                            id={`lesson-tutor-${idx}`}
                            onClick={() => handleSelectTutor(tutor)}
                            className={`px-4 py-2 cursor-pointer rounded-md ${
                              idx === selectedTutorIndex
                                ? 'bg-brand-purple text-white'
                                : 'hover:bg-neutral-100'
                            }`}
                          >
                            <div className="font-medium">
                              {tutorName}
                            </div>
                            {tutor.email && (
                              <div className={`text-sm ${idx === selectedTutorIndex ? 'text-white/90' : 'text-neutral-500'}`}>
                                {tutor.email}
                              </div>
                            )}
                          </li>
                        );
                      }).filter(Boolean)}
                    </ul>
                  ) : (
                    <div className="text-center py-8 text-neutral-500">
                      {loadingTutors ? 'Loading tutors...' : tutorSearchQuery.trim() ? 'No tutors found matching that name' : 'No tutors available'}
                    </div>
                  )}
                </div>
                
                {/* Tutor Selection Form */}
                {selectedTutorForAdd && (
                  <div className="mt-6 pt-6 border-t border-neutral-200">
                    <div className="mb-4">
                      <div className="font-medium text-neutral-900 mb-1">
                        Selected Tutor: {selectedTutorForAdd.first_name} {selectedTutorForAdd.last_name}
                      </div>
                      {selectedTutorForAdd.default_rate && (
                        <div className="text-sm text-neutral-500">
                          Default Rate: ${parseFloat(selectedTutorForAdd.default_rate).toFixed(2)}/hour
                        </div>
                      )}
                    </div>

                    {/* More settings */}
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => setTutorMoreSettingsOpen(!tutorMoreSettingsOpen)}
                        className="flex items-center gap-2 text-sm text-[#50C8DF] hover:text-[#3BA8BD]"
                      >
                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${tutorMoreSettingsOpen ? 'rotate-180' : ''}`} />
                        More settings
                      </button>

                      {tutorMoreSettingsOpen && (
                        <div className="mt-3 pl-6 border-l-2 border-neutral-200">
                          <label className="flex items-start gap-3 cursor-pointer mb-3">
                            <input
                              type="checkbox"
                              checked={tutorCustomRateEnabled}
                              onChange={(e) => setTutorCustomRateEnabled(e.target.checked)}
                              className="mt-1 h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                            />
                            <div>
                              <div className="text-sm font-medium text-neutral-900">
                                Pay custom rate
                              </div>
                              <div className="text-xs text-neutral-500 mt-1">
                                You can choose to override the default pay rate for this particular Tutor.
                              </div>
                            </div>
                          </label>

                          {tutorCustomRateEnabled && (
                            <div className="ml-7">
                              <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Custom Rate ($/hour)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={tutorPayRate}
                                onChange={(e) => setTutorPayRate(e.target.value)}
                                placeholder={selectedTutorForAdd.default_rate ? parseFloat(selectedTutorForAdd.default_rate).toFixed(2) : '0.00'}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTutorModal(false);
                          setSelectedTutorForAdd(null);
                          setTutorPayRate('');
                          setTutorCustomRateEnabled(false);
                          setTutorMoreSettingsOpen(false);
                        }}
                        className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddTutor}
                        disabled={addingTutor}
                        className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingTutor ? 'Adding...' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {showNoteModal && (
        <AddNoteModal
          note={newNote}
          onChange={setNewNote}
          onClose={() => {
            setShowNoteModal(false);
            setNewNote('');
          }}
          onSave={handleAddNote}
          loading={actionLoading}
        />
      )}

      {showTagModal && (
        <CancellationTagModal
          onClose={() => setShowTagModal(false)}
          onSave={handleTagCancellation}
          currentCancelledBy={appointment?.cancelled_by}
          currentReason={appointment?.cancellation_reason}
        />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          setConfirmState(prev => ({ ...prev, isOpen: false }));
          if (confirmState.action) await confirmState.action();
        }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive={confirmState.isDestructive}
      />
        </div>
      </div>
    </>
  );
}


function AddNoteModal({ note, onChange, onClose, onSave, loading }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Add Note</h3>
        <textarea
          value={note}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple mb-4"
          placeholder="Enter your note here..."
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-neutral-700 bg-neutral-100 rounded-md hover:bg-neutral-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading || !note.trim()}
            className="px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

const REASON_LABELS = {
  rescheduled: 'Rescheduled',
  no_show: 'No Show',
  sick: 'Sick',
  schedule_conflict: 'Schedule Conflict',
  weather: 'Weather',
  other: 'Other'
};

function CancellationTagModal({ onClose, onSave, currentCancelledBy, currentReason }) {
  const [step, setStep] = useState(1);
  const [cancelledBy, setCancelledBy] = useState(currentCancelledBy || '');
  const [reason, setReason] = useState(currentReason || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(cancelledBy, reason, note.trim() || null);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl border border-neutral-200 max-w-md w-full mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-neutral-900">
            {step === 1 ? 'Who cancelled?' : step === 2 ? 'Why was it cancelled?' : 'Add a note (optional)'}
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <XCircleIcon className="h-5 w-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'client', label: 'Client', colors: 'bg-[#FCE8F0] text-[#AE255B] border-[#DA2E72]/30' },
              { value: 'tutor', label: 'Tutor', colors: 'bg-[#FEF4E8] text-[#C77A26] border-[#C77A26]/30' },
              { value: 'admin', label: 'Admin', colors: 'bg-neutral-100 text-neutral-600 border-neutral-300' }
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => { setCancelledBy(opt.value); setStep(2); }}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all font-medium text-sm hover:shadow-md ${
                  cancelledBy === opt.value ? `border-[#6A469D] ${opt.colors}` : `border-neutral-200 hover:border-neutral-300 ${opt.colors}`
                }`}
              >
                <UserIcon className="h-6 w-6" />
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => { setReason(value); setStep(3); }}
                  className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all hover:shadow-md ${
                    reason === value
                      ? 'border-[#6A469D] bg-[#6A469D]/5 text-[#6A469D]'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStep(1)}
              className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors mt-2"
            >
              Back
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-neutral-600 bg-neutral-50 rounded-lg p-3">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                cancelledBy === 'client' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                cancelledBy === 'tutor' ? 'bg-[#FEF4E8] text-[#C77A26]' :
                'bg-neutral-100 text-neutral-600'
              }`}>
                {cancelledBy.charAt(0).toUpperCase() + cancelledBy.slice(1)}
              </span>
              <span className="text-neutral-400">/</span>
              <span className="font-medium text-neutral-900">{REASON_LABELS[reason]}</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
              placeholder="Optional note..."
            />
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-[#6A469D] text-white rounded-lg hover:bg-[#5B3C87] transition-colors text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
