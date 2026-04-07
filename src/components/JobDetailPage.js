import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import NotFound from './NotFound';
import { Button, Card, Badge, TabNav, ListItem, EmptyState, EmailPreviewModal } from './ui';
import { getLabelColor } from '../utils/labelColors';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../hooks/useToast';
import {
  ChartBarIcon,
  EnvelopeIcon,
  StarIcon,
  UsersIcon,
  UserIcon,
  BoltIcon,
  LinkIcon,
  PlusIcon,
  XCircleIcon,
  MapPinIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  DocumentArrowUpIcon,
  ClockIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  HomeIcon,
  AcademicCapIcon,
  ComputerDesktopIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';
import { CalendarIcon } from '@mui/x-date-pickers';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';

export default function JobDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const toast = useToast();
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });
  const [activeTab, setActiveTab] = useState('summary');
  const [lessonFilter, setLessonFilter] = useState(null); // 'completed', 'planned', 'awaiting_confirmation', 'cancelled', or null for all
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [labelsDropdownOpen, setLabelsDropdownOpen] = useState(false);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [updatingLabels, setUpdatingLabels] = useState(false);
  const [studentSearchOpen, setStudentSearchOpen] = useState(false);
  const [tutorSearchOpen, setTutorSearchOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [availableStudents, setAvailableStudents] = useState([]);
  const [availableTutors, setAvailableTutors] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [filteredTutors, setFilteredTutors] = useState([]);
  const [selectedStudentIndex, setSelectedStudentIndex] = useState(-1);
  const [selectedTutorIndex, setSelectedTutorIndex] = useState(-1);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingTutors, setLoadingTutors] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [addingTutor, setAddingTutor] = useState(false);
  const [selectedTutorForAdd, setSelectedTutorForAdd] = useState(null);
  const [tutorPayRate, setTutorPayRate] = useState('');
  const [tutorCustomRateEnabled, setTutorCustomRateEnabled] = useState(false);
  const [tutorAddToFutureLessons, setTutorAddToFutureLessons] = useState(true);
  const [tutorMoreSettingsOpen, setTutorMoreSettingsOpen] = useState(false);
  const [editingTutorRate, setEditingTutorRate] = useState(null);
  const [tutorRateEditValue, setTutorRateEditValue] = useState('');
  const [updatingTutorRate, setUpdatingTutorRate] = useState(false);
  const [editingStudentRate, setEditingStudentRate] = useState(null);
  const [studentRateEditValue, setStudentRateEditValue] = useState('');
  const [updatingStudentRate, setUpdatingStudentRate] = useState(false);
  const [createLessonModalOpen, setCreateLessonModalOpen] = useState(false);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [lessonCreatedSuccessfully, setLessonCreatedSuccessfully] = useState(false);
  const [lessonFormData, setLessonFormData] = useState({
    start: null, // Use dayjs object instead of string
    finish: null, // Use dayjs object instead of string
    topic: '',
    location: '',
    localOnly: false
  });
  const [selectedLessonStudents, setSelectedLessonStudents] = useState([]);
  const [selectedLessonTutors, setSelectedLessonTutors] = useState([]);
  const [jobStudents, setJobStudents] = useState([]);
  const [jobTutors, setJobTutors] = useState([]);

  useEffect(() => {
    fetchJobData();
    fetchAvailableLabels();
  }, [id]);

  useEffect(() => {
    if (studentSearchOpen) {
      fetchAvailableStudents();
    }
  }, [studentSearchOpen, id]);

  useEffect(() => {
    if (tutorSearchOpen) {
      // Clear search query when modal opens to prevent autofill
      setTutorSearchQuery('');
      setSelectedTutorForAdd(null);
      setTutorPayRate('');
      setTutorCustomRateEnabled(false);
      setTutorAddToFutureLessons(true);
      setTutorMoreSettingsOpen(false);
      fetchAvailableTutors();
    }
  }, [tutorSearchOpen, id]);

  // Pre-fill lesson form data when modal opens
  useEffect(() => {
    if (createLessonModalOpen && data && data.service) {
      const { service } = data;
      
      // Format location from service.location (could be object or string)
      let formattedLocation = '';
      if (service.location) {
        if (typeof service.location === 'string') {
          formattedLocation = service.location;
        } else if (typeof service.location === 'object') {
          // Format as "Location Name: Address, City, State ZIP, Country"
          const parts = [];
          if (service.location.name) parts.push(service.location.name);
          if (service.location.address_line1) {
            const addrParts = [service.location.address_line1];
            if (service.location.town) addrParts.push(service.location.town);
            if (service.location.state) addrParts.push(service.location.state);
            if (service.location.postcode) addrParts.push(service.location.postcode);
            if (service.location.country) addrParts.push(service.location.country);
            const address = addrParts.join(', ');
            if (parts.length > 0) {
              formattedLocation = `${parts[0]}: ${address}`;
            } else {
              formattedLocation = address;
            }
          } else if (service.location.address) {
            // Handle nested address object
            const addr = service.location.address;
            const addrParts = [];
            if (addr.address_line1) addrParts.push(addr.address_line1);
            if (addr.town) addrParts.push(addr.town);
            if (addr.state) addrParts.push(addr.state);
            if (addr.postcode) addrParts.push(addr.postcode);
            if (addr.country) addrParts.push(addr.country);
            formattedLocation = addrParts.join(', ');
          }
        }
      }
      
      // Pre-populate start time with current date/time, finish time 1 hour later
      const now = dayjs();
      const oneHourLater = now.add(1, 'hour');
      
      setLessonFormData({
        start: now,
        finish: oneHourLater,
        topic: service.name || '',
        location: formattedLocation,
        localOnly: false
      });

      // Fetch job-associated students and tutors
      fetchJobStudentsAndTutors();
    }
  }, [createLessonModalOpen, data]);

  const fetchJobStudentsAndTutors = async () => {
    if (!data) return;
    
    try {
      // Get students from job data - check both relatedStudents and students for compatibility
      const students = data.relatedStudents || data.students || [];
      setJobStudents(students);
      // Pre-select all students by default
      setSelectedLessonStudents(students.map(s => s.recipient_id || s.id));

      // Get tutors from job data - check both relatedTutors and tutors for compatibility
      const tutors = data.relatedTutors || data.tutors || [];
      setJobTutors(tutors);
      // Pre-select all tutors by default
      setSelectedLessonTutors(tutors.map(t => t.contractor_id || t.id));
    } catch (err) {
      console.error('Error fetching job students/tutors:', err);
    }
  };

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

  useEffect(() => {
    if (selectedStudentIndex >= 0 && filteredStudents.length > 0) {
      const element = document.getElementById(`student-${selectedStudentIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedStudentIndex, filteredStudents]);

  useEffect(() => {
    if (tutorSearchQuery.trim() === '') {
      // When empty, show all tutors that have at least a first or last name
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
        // ONLY search by name fields - explicitly exclude email
        const firstName = (tutor.first_name || '').toLowerCase().trim();
        const lastName = (tutor.last_name || '').toLowerCase().trim();
        
        // If tutor has no name at all, exclude from results
        if (!firstName && !lastName) {
          return false;
        }
        
        // Only match if query appears in first name, last name, or full name
        // Do NOT search email addresses - explicitly exclude email from search
        const fullName = `${firstName} ${lastName}`.trim();
        const matchesFirstName = firstName && firstName.includes(query);
        const matchesLastName = lastName && lastName.includes(query);
        const matchesFullName = fullName && fullName.includes(query);
        
        return matchesFirstName || matchesLastName || matchesFullName;
      });
      setFilteredTutors(filtered);
      setSelectedTutorIndex(-1);
    }
  }, [tutorSearchQuery, availableTutors]);

  useEffect(() => {
    if (selectedTutorIndex >= 0 && filteredTutors.length > 0) {
      const element = document.getElementById(`tutor-${selectedTutorIndex}`);
      if (element) {
        element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedTutorIndex, filteredTutors]);

  const fetchAvailableLabels = async () => {
    setLoadingLabels(true);
    try {
      const res = await fetch('/api/labels');
      if (res.ok) {
        const data = await res.json();
        setAvailableLabels(data.labels || []);
      }
    } catch (err) {
      console.error('Error fetching labels:', err);
    } finally {
      setLoadingLabels(false);
    }
  };

  const fetchAvailableStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/jobs/${id}/available-students`);
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
      const res = await fetch(`/api/jobs/${id}/available-tutors`);
      if (res.ok) {
        const data = await res.json();
        // Filter to only include tutors that have at least a first or last name
        // Also log for debugging to see what data we're getting
        const tutorsWithNames = (data || []).filter(tutor => {
          const firstName = (tutor.first_name || '').trim();
          const lastName = (tutor.last_name || '').trim();
          const hasName = firstName || lastName;
          if (!hasName) {
            console.log('Tutor without name excluded:', { 
              id: tutor.contractor_id, 
              email: tutor.email,
              first_name: tutor.first_name,
              last_name: tutor.last_name 
            });
          }
          return hasName;
        });
        console.log('Tutors with names:', tutorsWithNames.length, 'out of', (data || []).length);
        setAvailableTutors(tutorsWithNames);
        setFilteredTutors(tutorsWithNames);
      }
    } catch (err) {
      console.error('Error fetching available tutors:', err);
    } finally {
      setLoadingTutors(false);
    }
  };

  const handleAddStudent = async (student) => {
    setAddingStudent(true);
    try {
      const res = await fetch(`/api/jobs/${id}/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient: student.recipient_id }),
      });

      if (!res.ok) {
        throw new Error('Failed to add student');
      }

      await fetchJobData();
      setStudentSearchOpen(false);
      setStudentSearchQuery('');
    } catch (err) {
      console.error('Error adding student:', err);
      toast.error('Failed to add student. Please try again.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleSelectTutor = (tutor) => {
    setSelectedTutorForAdd(tutor);
    setTutorSearchQuery('');
    // Reset form state
    setTutorPayRate('');
    setTutorCustomRateEnabled(false);
    setTutorAddToFutureLessons(true);
    setTutorMoreSettingsOpen(false);
  };

  const handleAddTutor = async () => {
    if (!selectedTutorForAdd) {
      return;
    }

    setAddingTutor(true);
    try {
      const payload = {
        contractor: selectedTutorForAdd.contractor_id,
      };

      if (tutorCustomRateEnabled && tutorPayRate) {
        payload.pay_rate = parseFloat(tutorPayRate);
      }

      if (tutorAddToFutureLessons) {
        payload.add_to_future_lessons = true;
      }

      const res = await fetch(`/api/jobs/${id}/tutors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to add tutor' }));
        throw new Error(errorData.details || errorData.error || 'Failed to add tutor');
      }

      await fetchJobData();
      setTutorSearchOpen(false);
      setTutorSearchQuery('');
      setSelectedTutorForAdd(null);
      setTutorPayRate('');
      setTutorCustomRateEnabled(false);
      setTutorAddToFutureLessons(true);
      setTutorMoreSettingsOpen(false);
    } catch (err) {
      console.error('Error adding tutor:', err);
      toast.error(`Failed to add tutor: ${err.message || 'Please try again.'}`);
    } finally {
      setAddingTutor(false);
    }
  };

  const handleRemoveStudent = async (studentId, studentName) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Student',
      message: `Remove "${studentName || 'this student'}" from this job?`,
      isDestructive: false,
      action: async () => {
        try {
          const res = await fetch(`/api/jobs/${id}/students/${studentId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Failed to remove student' }));
            throw new Error(errorData.details || errorData.error || 'Failed to remove student');
          }

          await fetchJobData();
        } catch (err) {
          console.error('Error removing student:', err);
          toast.error(`Failed to remove student: ${err.message || 'Please try again.'}`);
        }
      }
    });
  };

  const handleRemoveTutor = async (tutorId, tutorName) => {
    setConfirmState({
      isOpen: true,
      title: 'Remove Tutor',
      message: `Remove "${tutorName || 'this tutor'}" from this job?`,
      isDestructive: false,
      action: async () => {
        try {
          const res = await fetch(`/api/jobs/${id}/tutors/${tutorId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Failed to remove tutor' }));
            throw new Error(errorData.details || errorData.error || 'Failed to remove tutor');
          }

          await fetchJobData();
        } catch (err) {
          console.error('Error removing tutor:', err);
          toast.error(`Failed to remove tutor: ${err.message || 'Please try again.'}`);
        }
      }
    });
  };

  const handleEditTutorRate = (tutor) => {
    setEditingTutorRate(tutor.contractor_id);
    setTutorRateEditValue(tutor.pay_rate ? parseFloat(tutor.pay_rate).toFixed(2) : '');
  };

  const handleSaveTutorRate = async (tutorId) => {
    const rateValue = parseFloat(tutorRateEditValue);
    if (isNaN(rateValue) || rateValue < 0) {
      toast.error('Please enter a valid pay rate');
      return;
    }

    setUpdatingTutorRate(true);
    try {
      const res = await fetch(`/api/jobs/${id}/tutors/${tutorId}/rate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pay_rate: rateValue }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to update tutor rate' }));
        throw new Error(errorData.details || errorData.error || 'Failed to update tutor rate');
      }

      setEditingTutorRate(null);
      setTutorRateEditValue('');
      await fetchJobData();
    } catch (err) {
      console.error('Error updating tutor rate:', err);
      toast.error(`Failed to update tutor rate: ${err.message || 'Please try again.'}`);
    } finally {
      setUpdatingTutorRate(false);
    }
  };

  const handleCancelEditTutorRate = () => {
    setEditingTutorRate(null);
    setTutorRateEditValue('');
  };

  const handleEditStudentRate = (student) => {
    setEditingStudentRate(student.recipient_id);
    setStudentRateEditValue(student.charge_rate ? parseFloat(student.charge_rate).toFixed(2) : '');
  };

  const handleSaveStudentRate = async (studentId) => {
    const rateValue = parseFloat(studentRateEditValue);
    if (isNaN(rateValue) || rateValue < 0) {
      toast.error('Please enter a valid charge rate');
      return;
    }

    setUpdatingStudentRate(true);
    try {
      const res = await fetch(`/api/jobs/${id}/students/${studentId}/rate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ charge_rate: rateValue }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Failed to update student rate' }));
        throw new Error(errorData.details || errorData.error || 'Failed to update student rate');
      }

      setEditingStudentRate(null);
      setStudentRateEditValue('');
      await fetchJobData();
    } catch (err) {
      console.error('Error updating student rate:', err);
      toast.error(`Failed to update student rate: ${err.message || 'Please try again.'}`);
    } finally {
      setUpdatingStudentRate(false);
    }
  };

  const handleCancelEditStudentRate = () => {
    setEditingStudentRate(null);
    setStudentRateEditValue('');
  };

  const handleCreateLesson = async (e) => {
    e.preventDefault();
    
    if (!lessonFormData.start || !lessonFormData.finish) {
      toast.error('Please select both start and end date/time');
      return;
    }
    
    setCreatingLesson(true);
    try {
      // Convert dayjs objects to ISO strings
      const startISO = lessonFormData.start.toISOString();
      const finishISO = lessonFormData.finish.toISOString();
      
      // Prepare students and tutors data
      const students = selectedLessonStudents.map(studentId => {
        const student = jobStudents.find(s => (s.recipient_id || s.id) === studentId);
        return {
          recipient_id: studentId,
          charge_rate: student?.charge_rate || null
        };
      });

      const tutors = selectedLessonTutors.map(tutorId => {
        const tutor = jobTutors.find(t => (t.contractor_id || t.id) === tutorId);
        return {
          contractor_id: tutorId,
          pay_rate: tutor?.pay_rate || null
        };
      });
      
      const response = await fetch(`/api/lessons/create`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service_id: id,
          start: startISO,
          finish: finishISO,
          topic: lessonFormData.topic || null,
          location: lessonFormData.location || null,
          localOnly: lessonFormData.localOnly,
          students: students,
          tutors: tutors
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create lesson');
      }

      const data = await response.json();
      
      // Show success state
      setCreatingLesson(false);
      setLessonCreatedSuccessfully(true);
      
      // Refresh job data to show new lesson
      await fetchJobData();
      
      // Wait a moment to show success message, then close modal
      setTimeout(() => {
        setCreateLessonModalOpen(false);
        setLessonCreatedSuccessfully(false);
        setLessonFormData({
          start: null,
          finish: null,
          topic: '',
          location: '',
          localOnly: false
        });
        setSelectedLessonStudents([]);
        setSelectedLessonTutors([]);
      }, 1500);
    } catch (error) {
      console.error('Error creating lesson:', error);
      setCreatingLesson(false);
      setLessonCreatedSuccessfully(false);
      toast.error(`Failed to create lesson: ${error.message}`);
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
      setSelectedStudentIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedStudentIndex >= 0) {
      e.preventDefault();
      handleAddStudent(filteredStudents[selectedStudentIndex]);
    } else if (e.key === 'Escape') {
      setStudentSearchOpen(false);
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
      setSelectedTutorIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedTutorIndex >= 0) {
      e.preventDefault();
      handleAddTutor(filteredTutors[selectedTutorIndex]);
    } else if (e.key === 'Escape') {
      setTutorSearchOpen(false);
    }
  };

  const fetchJobData = async () => {
    try {
      const res = await fetch(`/api/entity-details/jobs/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('not-found');
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch job details');
      }
      const jobData = await res.json();
      setData(jobData);
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error('Failed to update status');
      }

      // Update local state
      setData(prev => ({
        ...prev,
        service: {
          ...prev.service,
          status: newStatus,
        },
      }));
      setStatusDropdownOpen(false);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const addLabel = async (labelId) => {
    setUpdatingLabels(true);
    try {
      const res = await fetch(`/api/jobs/${id}/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labelId }),
      });

      if (!res.ok) {
        throw new Error('Failed to add label');
      }

      // Refresh job data to get updated labels
      await fetchJobData();
      setLabelsDropdownOpen(false);
    } catch (err) {
      console.error('Error adding label:', err);
      toast.error('Failed to add label. Please try again.');
    } finally {
      setUpdatingLabels(false);
    }
  };

  const removeLabel = async (labelId) => {
    setUpdatingLabels(true);
    try {
      const res = await fetch(`/api/jobs/${id}/labels/${labelId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to remove label');
      }

      // Refresh job data to get updated labels
      await fetchJobData();
    } catch (err) {
      console.error('Error removing label:', err);
      toast.error('Failed to remove label. Please try again.');
    } finally {
      setUpdatingLabels(false);
    }
  };

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'available', label: 'Available' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'finished', label: 'Finished' },
    { value: 'gone-cold', label: 'Gone Cold' },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <NotFound entityType="Job" entityId={id} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto w-full flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-[#AE255B]">Error: {error}</p>
        </div>
      </div>
    );
  }

  const { 
    service, 
    lessons, 
    relatedTutors, 
    relatedStudents, 
    tutorCruncherUrl,
    adhocCharges = [],
    tasks = [],
    activity = [],
    applications = [],
    skillSets = [],
    reviews = [],
    communications = [],
    lessonStats = {},
    totalValue = 0,
    totalInvoiced = 0
  } = data;

  // Get current label IDs for filtering available labels
  const getCurrentLabelIds = () => {
    if (!service?.labels || !Array.isArray(service.labels)) return [];
    return service.labels
      .map(label => {
        if (typeof label === 'object' && label.id) return label.id;
        if (typeof label === 'object' && label.label_id) return label.label_id;
        // If label is just a string, try to find matching label by name
        const labelName = typeof label === 'string' ? label : (label.name || '');
        const found = availableLabels.find(l => l.name === labelName);
        return found?.id;
      })
      .filter(Boolean);
  };

  const currentLabelIds = getCurrentLabelIds();
  const availableLabelsToAdd = availableLabels.filter(label => !currentLabelIds.includes(label.id));

  const getStatusBadgeVariant = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('active') || statusLower.includes('in-progress') || statusLower.includes('approved')) {
      return 'in-progress';
    } else if (statusLower.includes('planned') || statusLower.includes('pending')) {
      return 'planned';
    } else if (statusLower.includes('completed') || statusLower.includes('done') || statusLower === 'complete') {
      return 'complete';
    } else if (statusLower.includes('cancelled') || statusLower.includes('error') || statusLower.includes('rejected')) {
      return 'cancelled';
    }
    return 'editable';
  };

  const getStatusBadge = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('active') || statusLower.includes('in-progress')) {
      return <Badge variant="in-progress">{status}</Badge>;
    } else if (statusLower.includes('planned') || statusLower.includes('pending')) {
      return <Badge variant="planned">{status}</Badge>;
    } else if (statusLower.includes('completed') || statusLower.includes('done') || statusLower === 'complete') {
      return <Badge variant="complete">{status}</Badge>;
    } else if (statusLower.includes('cancelled') || statusLower.includes('error')) {
      return <Badge variant="cancelled">{status}</Badge>;
    }
    return <Badge variant="editable">{status || 'Unknown'}</Badge>;
  };

  const getLessonStatusBadge = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'complete' || statusLower === 'cancelled-chargeable' || statusLower === 'completed') {
      return <Badge variant="complete">Complete</Badge>;
    } else if (statusLower === 'planned') {
      return <Badge variant="planned">Planned</Badge>;
    } else if (statusLower === 'awaiting confirmation' || statusLower === 'awaiting-confirmation') {
      return <Badge variant="in-progress">Awaiting Confirmation</Badge>;
    } else if (statusLower === 'cancelled') {
      return <Badge variant="cancelled">Cancelled</Badge>;
    }
    return <Badge variant="editable">{status || 'Unknown'}</Badge>;
  };

  const getApplicationStatusBadge = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'accepted') {
      return <Badge variant="complete">Accepted</Badge>;
    } else if (statusLower === 'rejected') {
      return <Badge variant="cancelled">Rejected</Badge>;
    } else if (statusLower === 'withdrawn') {
      return <Badge variant="editable">Withdrawn</Badge>;
    }
    return <Badge variant="planned">Pending</Badge>;
  };

  const tabs = [
    { id: 'summary', name: 'Summary', icon: CalendarIcon },
    { id: 'activity', name: 'Activity', icon: BoltIcon },
    { id: 'matching', name: 'Matching', icon: LinkIcon },
    { id: 'reviews', name: 'Reviews', icon: StarIcon },
    { id: 'communications', name: 'Communications', icon: EnvelopeIcon }
  ];

  // Filter and group lessons by date and status
  const now = new Date();
  let allLessons = lessons || [];
  
  // Apply status filter if selected
  if (lessonFilter) {
    allLessons = allLessons.filter(lesson => {
      const status = (lesson.status || '').trim();
      const statusLower = status.toLowerCase();
      switch (lessonFilter) {
        case 'completed':
          return statusLower === 'complete' || statusLower === 'cancelled-chargeable' || statusLower === 'completed';
        case 'planned':
          return statusLower === 'planned';
        case 'awaiting_confirmation':
          return statusLower === 'awaiting confirmation' || statusLower === 'awaiting-confirmation';
        case 'cancelled':
          return statusLower === 'cancelled' && !status.toLowerCase().includes('chargeable');
        default:
          return true;
      }
    });
  }
  
  const upcomingLessons = allLessons.filter(l => new Date(l.start) >= now).sort((a, b) => new Date(a.start) - new Date(b.start));
  const pastLessons = allLessons.filter(l => new Date(l.start) < now).sort((a, b) => new Date(b.start) - new Date(a.start));

  return (
    <>
      <div className="w-full">
        {/* Breadcrumb + Title + Actions */}
        <div className="bg-white border-b border-neutral-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm mb-2">
              <Link to="/scheduling/jobs" className="text-neutral-400 hover:text-[#6A469D] transition-colors">Jobs</Link>
              <span className="text-neutral-300">/</span>
              <span className="text-neutral-600 font-medium truncate max-w-[400px]">{service.name || `Job ${service.service_id}`}</span>
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 truncate">
                  {service.name || `Job ${service.service_id}`}
                </h1>
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

            {/* Lesson Count Context Strip */}
            {allLessons.length > 0 && (
              <div className="mt-3 flex items-center gap-4 px-3 py-2 bg-neutral-50 rounded-lg border border-neutral-200 text-sm">
                <span className="text-neutral-500">
                  <span className="font-semibold text-neutral-800">{allLessons.length}</span> lessons
                </span>
                <span className="text-neutral-300">|</span>
                <span className="text-neutral-500">
                  <span className="font-semibold text-[#34B256]">{allLessons.filter(l => l.status === 'complete' || l.status === 'completed').length}</span> completed
                </span>
                <span className="text-neutral-300">|</span>
                <span className="text-neutral-500">
                  <span className="font-semibold text-[#6A469D]">{upcomingLessons.length}</span> upcoming
                </span>
                {allLessons.some(l => l.status === 'cancelled') && (
                  <>
                    <span className="text-neutral-300">|</span>
                    <span className="text-neutral-500">
                      <span className="font-semibold text-[#DA2E72]">{allLessons.filter(l => l.status === 'cancelled').length}</span> cancelled
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs - Mobile Responsive */}
        {tabs.length > 0 && (
          <div className="bg-white border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8">
              {/* Mobile: Stack tabs and edit button, Desktop: Horizontal */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
                <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0" aria-label="Tabs">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id);
                          setLessonFilter(null);
                        }}
                        className={`
                          py-3 sm:py-4 px-2 sm:px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                          flex items-center gap-2 min-h-[44px] sm:min-h-0
                          ${isActive
                            ? 'border-primary-500 text-primary-500'
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
                <Link
                  to={`/jobs/${id}/edit`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0 self-start sm:self-center"
                >
                  <PencilSquareIcon className="h-4 w-4 flex-shrink-0" />
                  <span>Edit</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Content - Matching People Pages Padding */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
          {activeTab === 'summary' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Row 1: Consolidated Job Details Card */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <CalendarIcon className="h-5 w-5 text-primary-500" />
                <h3 className="text-lg font-semibold text-neutral-900">Job Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Left Column: Rates & Hours */}
                <div className="space-y-4">
                  {service.dft_charge_rate && (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500 mb-1">Default Charge Rate</dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        ${parseFloat(service.dft_charge_rate).toFixed(2)} {service.dft_charge_type === 'hourly' ? 'per hour' : 'per lesson'}
                      </dd>
                    </div>
                  )}
                  {service.dft_contractor_rate && (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500 mb-1">Default Tutor Rate</dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        ${parseFloat(service.dft_contractor_rate).toFixed(2)} {service.dft_charge_type === 'hourly' ? 'per hour' : 'per lesson'}
                      </dd>
                    </div>
                  )}
                  {service.sr_premium && parseFloat(service.sr_premium) > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500 mb-1">Student Premium</dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        ${parseFloat(service.sr_premium).toFixed(2)}
                      </dd>
                    </div>
                  )}
                  {allLessons.length > 0 && (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500 mb-1">Total Hours</dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        {allLessons.reduce((sum, l) => sum + (parseFloat(l.units) || 0), 0).toFixed(1)}
                      </dd>
                    </div>
                  )}
                </div>

                {/* Middle Column: Profile Info */}
                <div className="space-y-4">
                  <div>
                    <dt className="text-sm font-medium text-neutral-500 mb-1">Job ID</dt>
                    <dd className="text-sm font-semibold text-neutral-900">{service.service_id}</dd>
                  </div>
                  {service.created_at && (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500 mb-1">Date Created</dt>
                      <dd className="text-sm font-semibold text-neutral-900">
                        {new Date(service.created_at).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                  <div className="relative">
                    <dt className="text-sm font-medium text-neutral-500 mb-1">Status</dt>
                    <dd className="mt-1">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                          disabled={updatingStatus}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 rounded-md border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
                        >
                          {getStatusBadge(service.status || 'Unknown')}
                          <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
                        </button>
                        {statusDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setStatusDropdownOpen(false)}
                            />
                            <div className="absolute left-0 mt-1 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                              <div className="py-1" role="menu">
                                {statusOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => updateStatus(option.value)}
                                    className={`block w-full text-left px-4 py-2 text-sm ${
                                      service.status === option.value
                                        ? 'bg-primary-500/10 text-primary-500 font-medium'
                                        : 'text-neutral-700 hover:bg-neutral-100'
                                    }`}
                                    role="menuitem"
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </dd>
                  </div>
                </div>

                {/* Right Column: Labels */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <dt className="text-sm font-medium text-neutral-500">Labels</dt>
                      <button
                        onClick={() => setLabelsDropdownOpen(!labelsDropdownOpen)}
                        disabled={updatingLabels || availableLabelsToAdd.length === 0}
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 sm:px-2 sm:py-1 text-xs sm:text-sm bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                    <dd className="flex flex-wrap gap-2 min-h-[2rem]">
                      {updatingLabels && (
                        <span className="text-xs text-neutral-500">Updating...</span>
                      )}
                      {service.labels && Array.isArray(service.labels) && service.labels.length > 0 ? (
                        service.labels.map((label, idx) => {
                          const labelName = typeof label === 'string' ? label : (label.name || label.machine_name || JSON.stringify(label));
                          const labelId = typeof label === 'object' && label.id ? label.id : 
                                         (typeof label === 'object' && label.label_id ? label.label_id :
                                         availableLabels.find(l => l.name === labelName)?.id);
                          
                          // Get color from availableLabels if found, otherwise use labelColors utility
                          const labelColor = availableLabels.find(l => l.name === labelName)?.color || 
                                           (typeof label === 'object' && label.color) ||
                                           getLabelColor(labelName);
                          
                          return (
                            <div key={idx} className="relative inline-flex items-center group">
                              <Badge variant="label" labelName={labelName} color={labelColor} className={labelId ? "pr-6" : ""}>
                                {labelName}
                              </Badge>
                              {labelId && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmState({
                                      isOpen: true,
                                      title: 'Remove Label',
                                      message: `Remove label "${labelName}"?`,
                                      isDestructive: false,
                                      action: () => removeLabel(labelId)
                                    });
                                  }}
                                  disabled={updatingLabels}
                                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#DA2E72] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#AE255B] disabled:opacity-50"
                                  title="Remove label"
                                >
                                  <XCircleIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-sm text-neutral-400">No labels</span>
                      )}
                    </dd>
                    {labelsDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setLabelsDropdownOpen(false)}
                        />
                        <div className="relative z-20">
                          <div className="absolute left-0 top-0 mt-1 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 max-h-60 overflow-y-auto">
                            <div className="py-1" role="menu">
                              {loadingLabels ? (
                                <div className="px-4 py-2 text-sm text-neutral-500">Loading labels...</div>
                              ) : availableLabelsToAdd.length > 0 ? (
                                availableLabelsToAdd.map((label) => (
                                  <button
                                    key={label.id}
                                    onClick={() => addLabel(label.id)}
                                    disabled={updatingLabels}
                                    className="block w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    role="menuitem"
                                  >
                                    {label.name}
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-2 text-sm text-neutral-500">All labels added</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* Row 2: Students and Tutors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Students */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AcademicCapIcon className="h-5 w-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-neutral-900">Students</h3>
                  </div>
                  <button 
                    onClick={() => setStudentSearchOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"
                  >
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
                {relatedStudents && relatedStudents.length > 0 ? (
                  <div className="space-y-3">
                    {relatedStudents.map((student, idx) => (
                      <div key={idx} className="p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link to={`/students/${student.recipient_id}`} className="block">
                              <div className="font-medium text-primary-500 hover:text-primary-700 transition-colors">
                                {student.recipient_name || 'Unknown Student'}
                              </div>
                            </Link>
                            {student.paying_client_id && (
                              <div className="text-sm text-neutral-500 mt-1">
                                Client: <Link to={`/clients/${student.paying_client_id}`} className="text-primary-500 hover:text-primary-700 transition-colors hover:underline">{student.paying_client_name || 'Unknown'}</Link>
                              </div>
                            )}
                            {!student.paying_client_id && (
                              <div className="text-sm text-neutral-500 mt-1">
                                Client: {student.paying_client_name || 'Unknown'}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Charge Rate Section - On the right side */}
                            {editingStudentRate === student.recipient_id ? (
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-neutral-700 flex-shrink-0">
                                  Rate ($/hour):
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={studentRateEditValue}
                                  onChange={(e) => setStudentRateEditValue(e.target.value)}
                                  className="w-24 px-2 py-1 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  disabled={updatingStudentRate}
                                />
                                <button
                                  onClick={() => handleSaveStudentRate(student.recipient_id)}
                                  disabled={updatingStudentRate}
                                  className="px-2 py-1 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50"
                                >
                                  {updatingStudentRate ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleCancelEditStudentRate}
                                  disabled={updatingStudentRate}
                                  className="px-2 py-1 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-neutral-600 whitespace-nowrap">
                                  {student.charge_rate 
                                    ? `Student's Default Rate: $${parseFloat(student.charge_rate).toFixed(2)}/hour`
                                    : `Job's Default Rate`
                                  }
                                </span>
                                <button
                                  onClick={() => handleEditStudentRate(student)}
                                  className="p-1 text-neutral-400 hover:text-primary-500 transition-colors"
                                  title="Edit rate"
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => handleRemoveStudent(student.recipient_id, student.recipient_name)}
                              className="flex-shrink-0 p-1.5 text-neutral-400 hover:text-[#AE255B] hover:bg-[#FCE8F0] rounded-md transition-colors"
                              title="Remove student"
                            >
                              <XCircleIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-500 text-sm">No students enrolled</p>
                )}
              </Card>

              {/* Tutors */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="h-5 w-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-neutral-900">Tutors</h3>
                  </div>
                  <button 
                    onClick={() => setTutorSearchOpen(true)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"
                  >
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
                {relatedTutors && relatedTutors.length > 0 ? (
                  <div className="space-y-3">
                    {relatedTutors.map((tutor, idx) => (
                      <div key={idx} className="p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <Link to={`/tutors/${tutor.contractor_id}`} className="block">
                              <div className="font-medium text-primary-500 hover:text-primary-700 transition-colors">
                                {tutor.first_name} {tutor.last_name}
                              </div>
                            </Link>
                            <div className="text-sm text-neutral-500 mt-1">
                              Status: {tutor.status || 'Unknown'}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Pay Rate Section - On the right side */}
                            {editingTutorRate === tutor.contractor_id ? (
                              <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-neutral-700 flex-shrink-0">
                                  Rate ($/hour):
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={tutorRateEditValue}
                                  onChange={(e) => setTutorRateEditValue(e.target.value)}
                                  className="w-24 px-2 py-1 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  disabled={updatingTutorRate}
                                />
                                <button
                                  onClick={() => handleSaveTutorRate(tutor.contractor_id)}
                                  disabled={updatingTutorRate}
                                  className="px-2 py-1 text-xs font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50"
                                >
                                  {updatingTutorRate ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleCancelEditTutorRate}
                                  disabled={updatingTutorRate}
                                  className="px-2 py-1 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-neutral-600 whitespace-nowrap">
                                  {tutor.pay_rate 
                                    ? `Tutor's Default Rate: $${parseFloat(tutor.pay_rate).toFixed(2)}/hour`
                                    : tutor.default_rate
                                      ? `Tutor's Default Rate: $${parseFloat(tutor.default_rate).toFixed(2)}/hour`
                                      : `Job's Default Rate`
                                  }
                                </span>
                                <button
                                  onClick={() => handleEditTutorRate(tutor)}
                                  className="p-1 text-neutral-400 hover:text-primary-500 transition-colors"
                                  title="Edit rate"
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => handleRemoveTutor(tutor.contractor_id, `${tutor.first_name} ${tutor.last_name}`)}
                              className="flex-shrink-0 p-1.5 text-neutral-400 hover:text-[#AE255B] hover:bg-[#FCE8F0] rounded-md transition-colors"
                              title="Remove tutor"
                            >
                              <XCircleIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-neutral-500 text-sm">No tutors assigned</p>
                )}
              </Card>
            </div>

            {/* Row 3: Job Description (left) and Upcoming Lessons (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Job Description */}
              {service.description && (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <DocumentTextIcon className="h-5 w-5 text-primary-500" />
                    <h3 className="text-lg font-semibold text-neutral-900">Job Description</h3>
                  </div>
                  <div className="text-sm leading-relaxed text-neutral-700 whitespace-pre-wrap">
                    {service.description}
                  </div>
                </Card>
              )}

              {/* Upcoming Lessons Preview */}
              {upcomingLessons.length > 0 ? (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary-500" />
                      <h3 className="text-lg font-semibold text-neutral-900">Upcoming Lessons</h3>
                    </div>
                    <button
                      onClick={() => setCreateLessonModalOpen(true)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Create Lesson
                    </button>
                  </div>
                  <div className="space-y-2">
                    {upcomingLessons.slice(0, 7).map((lesson, idx) => {
                      const lessonDate = new Date(lesson.start);
                      return (
                        <Link
                          key={idx}
                          to={`/lessons/${lesson.appointment_id}`}
                          className="block p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 hover:border-primary-500/20 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-neutral-900">
                                {lessonDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {lessonDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {lesson.topic && ` • ${lesson.topic}`}
                              </div>
                            </div>
                            <div className="ml-4">
                              {getLessonStatusBadge(lesson.status)}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  {upcomingLessons.length > 7 && (
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <Link
                        to="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab('activity');
                        }}
                        className="text-sm text-primary-500 hover:text-primary-700 transition-colors font-medium"
                      >
                        View all {upcomingLessons.length} upcoming lessons →
                      </Link>
                    </div>
                  )}
                </Card>
              ) : (
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5 text-primary-500" />
                      <h3 className="text-lg font-semibold text-neutral-900">Upcoming Lessons</h3>
                    </div>
                    <button
                      onClick={() => setCreateLessonModalOpen(true)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors flex items-center gap-2"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Create Lesson
                    </button>
                  </div>
                  <p className="text-neutral-500 text-sm">No upcoming lessons scheduled</p>
                </Card>
              )}
            </div>

            {/* Row 4: Documents and Notes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Documents */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <DocumentArrowUpIcon className="h-4 w-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-neutral-900">Documents</h3>
                  </div>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-xs">
                    <DocumentArrowUpIcon className="h-3.5 w-3.5" />
                    Upload
                  </button>
                </div>
                {service.documents && service.documents.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {service.documents.map((doc, idx) => (
                      <div key={idx} className="p-2 border border-neutral-200 rounded-lg text-xs">
                        <div className="font-medium text-neutral-900 truncate">{doc.name || doc.filename || 'Document'}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : 'No date'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-primary-500/10 flex items-center justify-center">
                      <DocumentArrowUpIcon className="h-6 w-6 text-primary-500" />
                    </div>
                    <p className="text-xs font-medium text-neutral-900 mb-1">No documents</p>
                    <p className="text-xs text-neutral-500 mb-3">Upload documents related to this job</p>
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-xs">
                      Upload Document
                    </button>
                  </div>
                )}
              </Card>

              {/* Notes */}
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <InformationCircleIcon className="h-4 w-4 text-primary-500" />
                    <h3 className="text-base font-semibold text-neutral-900">Notes</h3>
                  </div>
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors text-xs">
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>
                {service.notes && service.notes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {service.notes.map((note, idx) => (
                      <div key={idx} className="p-2 border border-neutral-200 rounded-lg text-xs">
                        <div className="text-neutral-900 line-clamp-2">{note.note || note.content || note.text}</div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {note.created_at ? new Date(note.created_at).toLocaleDateString() : 'No date'}
                          {note.created_by && ` • ${note.created_by}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-primary-500/10 flex items-center justify-center">
                      <InformationCircleIcon className="h-6 w-6 text-primary-500" />
                    </div>
                    <p className="text-xs font-medium text-neutral-900 mb-1">No notes</p>
                    <p className="text-xs text-neutral-500 mb-3">Add notes about this job</p>
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-xs">
                      Add Note
                    </button>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Dashboard Summary Grid */}
            <Card>
              <div className="flex items-center gap-2 mb-6">
                <BoltIcon className="h-5 w-5 text-primary-500" />
                <h3 className="text-lg font-semibold text-neutral-900">Activity Overview</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={() => setLessonFilter(lessonFilter === 'completed' ? null : 'completed')}
                  className={`text-left p-4 rounded-lg transition-all border-2 min-h-[80px] ${
                    lessonFilter === 'completed'
                      ? 'bg-accent-green/10 border-accent-green'
                      : 'bg-white border-neutral-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircleIcon className="h-5 w-5 text-accent-green" />
                    <div className="text-xs font-medium text-neutral-600">Completed</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">{lessonStats.completed || 0}</div>
                </button>
                <button
                  onClick={() => setLessonFilter(lessonFilter === 'planned' ? null : 'planned')}
                  className={`text-left p-4 rounded-lg transition-all border-2 min-h-[80px] ${
                    lessonFilter === 'planned'
                      ? 'bg-accent-yellow/10 border-accent-yellow'
                      : 'bg-white border-neutral-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="h-5 w-5 text-accent-yellow" />
                    <div className="text-xs font-medium text-neutral-600">Planned</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">{lessonStats.planned || 0}</div>
                </button>
                <div className="p-4 rounded-lg border-2 border-neutral-200 bg-white min-h-[80px]">
                  <div className="flex items-center gap-2 mb-2">
                    <CurrencyDollarIcon className="h-5 w-5 text-accent-navy" />
                    <div className="text-xs font-medium text-neutral-600">Total Value</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">${totalValue.toFixed(2)}</div>
                </div>
                <button
                  onClick={() => setLessonFilter(lessonFilter === 'awaiting_confirmation' ? null : 'awaiting_confirmation')}
                  className={`text-left p-4 rounded-lg transition-all border-2 min-h-[80px] ${
                    lessonFilter === 'awaiting_confirmation'
                      ? 'bg-primary-500/10 border-primary-500'
                      : 'bg-white border-neutral-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="h-5 w-5 text-primary-500" />
                    <div className="text-xs font-medium text-neutral-600">Awaiting Confirmation</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">{lessonStats.awaiting_confirmation || 0}</div>
                </button>
                <button
                  onClick={() => setLessonFilter(lessonFilter === 'cancelled' ? null : 'cancelled')}
                  className={`text-left p-4 rounded-lg transition-all border-2 min-h-[80px] ${
                    lessonFilter === 'cancelled'
                      ? 'bg-accent-pink/10 border-accent-pink'
                      : 'bg-white border-neutral-200 hover:border-primary-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <XCircleIcon className="h-5 w-5 text-accent-pink" />
                    <div className="text-xs font-medium text-neutral-600">Cancelled</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">{lessonStats.cancelled || 0}</div>
                </button>
                <div className="p-4 rounded-lg border-2 border-neutral-200 bg-white min-h-[80px]">
                  <div className="flex items-center gap-2 mb-2">
                    <CurrencyDollarIcon className="h-5 w-5 text-accent-navy" />
                    <div className="text-xs font-medium text-neutral-600">Total Invoiced</div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-800">${totalInvoiced.toFixed(2)}</div>
                </div>
              </div>
            </Card>

            {/* Lessons Section */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">
                    Lessons {lessonFilter ? `(${allLessons.length} filtered)` : `(${lessons?.length || 0})`}
                  </h3>
                </div>
                <button 
                  onClick={() => setCreateLessonModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"
                >
                  <PlusIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Create Lesson</span>
                </button>
              </div>

              {/* Filter indicator */}
              {lessonFilter && (
                <div className="mb-6 flex items-center justify-between p-3 bg-white border border-neutral-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-neutral-600">Filtered by:</span>
                    <Badge variant={
                      lessonFilter === 'completed' ? 'complete' :
                      lessonFilter === 'planned' ? 'planned' :
                      lessonFilter === 'awaiting_confirmation' ? 'in-progress' :
                      lessonFilter === 'cancelled' ? 'cancelled' : 'editable'
                    }>
                      {lessonFilter === 'completed' && 'Completed'}
                      {lessonFilter === 'planned' && 'Planned'}
                      {lessonFilter === 'awaiting_confirmation' && 'Awaiting Confirmation'}
                      {lessonFilter === 'cancelled' && 'Cancelled'}
                    </Badge>
                    <button
                      onClick={() => setLessonFilter(null)}
                      className="text-sm text-primary-500 underline hover:no-underline transition-all min-h-[44px] sm:min-h-0 px-2 py-1"
                    >
                      Clear filter
                    </button>
                  </div>
                </div>
              )}

              {/* Upcoming Lessons */}
              {upcomingLessons.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-primary-900 mb-3">Upcoming Lessons</h4>
                  <div className="space-y-2">
                    {upcomingLessons.map((lesson) => {
                      const date = new Date(lesson.start);
                      const endDate = new Date(lesson.finish);
                      return (
                        <Link
                          key={lesson.appointment_id}
                          to={`/lessons/${lesson.appointment_id}`}
                          className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-primary-700 hover:text-primary-600">
                              {service.name} {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-sm text-neutral-600 mt-1">
                              {lesson.units ? `${parseFloat(lesson.units).toFixed(2)} hours` : '1 hour'} • {getLessonStatusBadge(lesson.status)}
                            </div>
                          </div>
                          <div className="ml-4 flex items-center gap-2">
                            <span className="text-xs text-neutral-500">Editable</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Previous Lessons */}
              {pastLessons.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-primary-900 mb-3">Previous Lessons</h4>
                  <div className="space-y-2">
                    {pastLessons.slice(0, 20).map((lesson) => {
                      const date = new Date(lesson.start);
                      const endDate = new Date(lesson.finish);
                      return (
                        <Link
                          key={lesson.appointment_id}
                          to={`/lessons/${lesson.appointment_id}`}
                          className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-primary-700 hover:text-primary-600">
                              {service.name} {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="text-sm text-neutral-600 mt-1">
                              {lesson.units ? `${parseFloat(lesson.units).toFixed(2)} hours` : '1 hour'} • {getLessonStatusBadge(lesson.status)}
                            </div>
                          </div>
                          <div className="ml-4 flex items-center gap-2">
                            {getLessonStatusBadge(lesson.status)}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                  {pastLessons.length > 20 && (
                    <div className="mt-4 text-center">
                      <Link to="#" className="text-sm text-primary-600 hover:text-primary-700">
                        View more info
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {allLessons.length === 0 && (
                <p className="text-neutral-600">No lessons found</p>
              )}
            </Card>

            {/* Ad Hoc Charges */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CurrencyDollarIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Ad Hoc Charges</h3>
                </div>
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-accent-green" />
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Ad hoc charges are any charges that are not lesson-based. For example, these could be expenses, registration or consultation fees. Like lesson charges, these can be used to both charge the client and pay the tutor with some or all of the charge and it can also include a share of the commission being passed to an affiliate. It can also do either of these individually. Ad Hoc Charges related to this Job will be displayed here.
              </p>
              {adhocCharges.length > 0 ? (
                <div className="space-y-3">
                  {adhocCharges.map((charge) => (
                    <div key={charge.id} className="p-3 border border-neutral-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-primary-900">{charge.description || charge.category_name}</div>
                          <div className="text-sm text-neutral-600 mt-1">
                            {charge.date_occurred ? new Date(charge.date_occurred).toLocaleDateString() : 'No date'} • ${parseFloat(charge.client_cost || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No ad hoc charges</p>
              )}
            </Card>

            {/* Tasks */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ClipboardDocumentListIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Tasks</h3>
                </div>
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-accent-green" />
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Tasks can be assigned to users, jobs and lessons. These send an email notification to the admin assigned, to remind you to do something at a certain time. You can choose the type of task, as well as leave a description on the task itself. Tasks related to this Job will be displayed here.
              </p>
              {tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-3 border border-neutral-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-primary-900">{task.description}</div>
                          <div className="text-sm text-neutral-600 mt-1">
                            Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No due date'} • Status: {task.status || 'Pending'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No tasks</p>
              )}
            </Card>

            {/* Activity Feed */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BoltIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Activity Feed</h3>
                </div>
                <Link to="#" className="text-sm text-primary-600 hover:text-primary-700">
                  more
                </Link>
              </div>
              {activity.length > 0 ? (
                <div className="space-y-4">
                  {activity.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 pb-4 border-b border-neutral-200 last:border-0">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <BoltIcon className="h-5 w-5 text-primary-500" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-primary-900">{item.description || item.action}</div>
                        <div className="text-xs text-neutral-600 mt-1">
                          {item.user_name || 'System'} • {item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown time'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No activity recorded</p>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'matching' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Job Applications */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Job Applications</h3>
                </div>
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-accent-green" />
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <EnvelopeIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Send Notifications</span>
                  </button>
                </div>
              </div>
              
              {/* Application Statistics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <div className="text-sm text-neutral-600">Total Applications</div>
                  <div className="text-lg font-semibold text-primary-900">{applications.length}</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Accepted Applications</div>
                  <div className="text-lg font-semibold text-accent-blue">
                    {applications.filter(a => a.status?.toLowerCase() === 'accepted').length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Rejected Applications</div>
                  <div className="text-lg font-semibold text-primary-900">
                    {applications.filter(a => a.status?.toLowerCase() === 'rejected').length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Withdrawn Applications</div>
                  <div className="text-lg font-semibold text-primary-900">
                    {applications.filter(a => a.status?.toLowerCase() === 'withdrawn').length}
                  </div>
                </div>
              </div>

              {applications.length > 0 ? (
                <div className="space-y-4">
                  {applications.map((app, idx) => (
                    <div key={idx} className="p-4 border border-neutral-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Link
                              to={`/tutors/${app.contractor_id}`}
                              className="font-medium text-primary-700 hover:text-primary-600 transition-colors"
                            >
                              {app.contractor_name}
                            </Link>
                            {getApplicationStatusBadge(app.status)}
                          </div>
                          {app.application_text && (
                            <p className="text-sm text-neutral-700 mt-2 line-clamp-3">
                              {app.application_text}
                            </p>
                          )}
                          <div className="text-xs text-neutral-600 mt-2">
                            Date Applied: {app.date_applied ? new Date(app.date_applied).toLocaleDateString() : 'Unknown'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No applications</p>
              )}
            </Card>

            {/* Skill Set */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AcademicCapIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Skill Set</h3>
                </div>
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-accent-green" />
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-neutral-100 text-neutral-700 rounded-md hover:bg-neutral-200 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-sm text-neutral-600">Fully Qualified Tutors</div>
                  <div className="text-lg font-semibold text-primary-900">0</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Partially Qualified Tutors</div>
                  <div className="text-lg font-semibold text-primary-900">0</div>
                </div>
              </div>
              {skillSets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {skillSets.map((skill, idx) => (
                    <Badge key={idx} variant="accent-blue">{skill}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No Skill Set</p>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-4 sm:space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <StarIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Reviews</h3>
                </div>
                <div className="flex items-center gap-2">
                  <InformationCircleIcon className="h-5 w-5 text-accent-green" />
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <PlusIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Request Job Reviews</span>
                  </button>
                </div>
              </div>
              
              {/* Review Statistics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <div className="text-sm text-neutral-600">Number of Reviews</div>
                  <div className="text-lg font-semibold text-primary-900">{reviews.length}</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Average Rating</div>
                  <div className="text-lg font-semibold text-primary-900">
                    {reviews.length > 0 
                      ? (reviews.reduce((sum, r) => sum + (parseFloat(r.star_rating_value) || 0), 0) / reviews.length).toFixed(1)
                      : 'No reviews'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Reviewed hours</div>
                  <div className="text-lg font-semibold text-primary-900">0.0 hours</div>
                </div>
                <div>
                  <div className="text-sm text-neutral-600">Latest Review</div>
                  <div className="text-lg font-semibold text-primary-900">
                    {reviews.length > 0 
                      ? new Date(reviews[0].date_created).toLocaleDateString()
                      : 'No reviews'}
                  </div>
                </div>
              </div>

              <p className="text-sm text-neutral-600 mb-6">
                Reviews allow you to ask your client directly for feedback on the lessons they have had with one of your tutors. This feedback will be then stored in your database so that you can look over how well received the tutoring was with your clients themselves. By default, the client will be able to rate the tutor out of 5 stars and write a short summary of the tutor as well. All Reviews for this Job will be displayed here.
              </p>

              {reviews.length > 0 ? (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.review_id} className="p-4 border border-neutral-200 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="font-medium text-primary-900">
                            {review.client_name || 'Unknown Client'}
                          </div>
                          <div className="text-sm text-neutral-600">
                            {review.contractor_name && `Tutor: ${review.contractor_name}`}
                          </div>
                        </div>
                        {review.star_rating_value && (
                          <div className="flex items-center gap-1">
                            <StarIcon className="h-5 w-5 text-accent-yellow fill-accent-yellow" />
                            <span className="font-semibold">{review.star_rating_value}</span>
                          </div>
                        )}
                      </div>
                      {review.extra_attrs_value && (
                        <p className="text-sm text-neutral-700 mt-2">{review.extra_attrs_value}</p>
                      )}
                      <div className="text-xs text-neutral-600 mt-2">
                        {review.date_created ? new Date(review.date_created).toLocaleDateString() : 'Unknown date'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-600">No reviews</p>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'communications' && (
          <div className="space-y-4 sm:space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <EnvelopeIcon className="h-5 w-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-neutral-900">Related Emails</h3>
                </div>
                <div className="relative">
                  <button className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px] sm:min-h-0">
                    <EnvelopeIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Send Email</span>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              {communications.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">To</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Subject</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">Send Time</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {communications.map((comm, idx) => (
                        <tr 
                          key={idx} 
                          className="hover:bg-neutral-50 cursor-pointer transition-colors"
                          onClick={() => {
                            setSelectedEmail(comm);
                            setEmailPreviewOpen(true);
                          }}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-primary-600">
                            {comm.to || 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm text-primary-900">
                            {comm.subject || 'No subject'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {comm.status === 'opened' ? (
                              <Badge variant="success">Opened</Badge>
                            ) : (
                              <Badge variant="info">Sent</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                            {comm.send_time || comm.sent_at 
                              ? new Date(comm.send_time || comm.sent_at).toLocaleString()
                              : 'Unknown'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-neutral-600">No communications</p>
              )}
            </Card>
          </div>
        )}
        </div>

        {/* Email Preview Modal */}
        <EmailPreviewModal
          isOpen={emailPreviewOpen}
          onClose={() => {
            setEmailPreviewOpen(false);
            setSelectedEmail(null);
          }}
          email={selectedEmail}
        />

        {/* Student Search Modal */}
        {studentSearchOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75" onClick={() => setStudentSearchOpen(false)} />
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-neutral-900">Add Student</h3>
                    <button
                      onClick={() => setStudentSearchOpen(false)}
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
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                            id={`student-${idx}`}
                            onClick={() => handleAddStudent(student)}
                            className={`px-4 py-2 cursor-pointer rounded-md ${
                              idx === selectedStudentIndex
                                ? 'bg-primary-500 text-white'
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
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tutor Search Modal */}
        {tutorSearchOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75" onClick={() => setTutorSearchOpen(false)} />
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-neutral-900">Add Tutor</h3>
                    <button
                      onClick={() => setTutorSearchOpen(false)}
                      className="text-neutral-400 hover:text-neutral-500"
                    >
                      <XCircleIcon className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="relative" autoComplete="off">
                    <input
                      type="search"
                      name="tutor-name-search-field"
                      id="tutor-name-search-field-input"
                      value={tutorSearchQuery}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Prevent email addresses from being entered
                        // If user pastes or types something that looks like an email, clear it
                        if (value.includes('@') && value.includes('.')) {
                          // If it looks like an email, extract just the name part or clear it
                          const namePart = value.split('@')[0];
                          setTutorSearchQuery(namePart || '');
                        } else {
                          setTutorSearchQuery(value);
                        }
                        setSelectedTutorIndex(-1); // Reset selection when typing
                      }}
                      onKeyDown={handleTutorKeyDown}
                      onFocus={(e) => {
                        // Prevent browser autocomplete dropdown
                        e.target.setAttribute('autocomplete', 'off');
                        // Clear any autofilled email values
                        if (e.target.value && e.target.value.includes('@')) {
                          e.target.value = '';
                          setTutorSearchQuery('');
                        }
                      }}
                      onInput={(e) => {
                        // Additional check to prevent email autofill
                        const value = e.target.value;
                        if (value && value.includes('@') && value.includes('.')) {
                          // If browser autofilled an email, clear it
                          e.target.value = '';
                          setTutorSearchQuery('');
                        }
                      }}
                      placeholder="Type tutor first or last name to search..."
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      autoFocus
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-form-type="other"
                      data-1p-ignore="true"
                      data-autocomplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={filteredTutors.length > 0}
                      aria-label="Search tutors by name"
                    />
                    {loadingTutors && (
                      <div className="absolute right-3 top-2.5 text-neutral-400">Loading...</div>
                    )}
                  </div>
                  <div className="mt-4 max-h-64 overflow-y-auto">
                    {filteredTutors.length > 0 ? (
                      <ul className="space-y-1">
                        {filteredTutors.map((tutor, idx) => {
                          // Only show tutors that have at least a first or last name
                          const firstName = (tutor.first_name || '').trim();
                          const lastName = (tutor.last_name || '').trim();
                          const tutorName = `${firstName} ${lastName}`.trim();
                          
                          // Skip tutors without names
                          if (!tutorName) {
                            return null;
                          }
                          
                          return (
                            <li
                              key={tutor.contractor_id}
                              id={`tutor-${idx}`}
                              onClick={() => handleSelectTutor(tutor)}
                              className={`px-4 py-2 cursor-pointer rounded-md ${
                                idx === selectedTutorIndex
                                  ? 'bg-primary-500 text-white'
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

                      {/* Add to future lessons checkbox */}
                      <div className="mb-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tutorAddToFutureLessons}
                            onChange={(e) => setTutorAddToFutureLessons(e.target.checked)}
                            className="mt-1 h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300 rounded"
                          />
                          <div>
                            <div className="text-sm font-medium text-neutral-900">
                              Add to all future planned Lessons
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                              The Tutor will be added to all future planned lessons.
                            </div>
                          </div>
                        </label>
                      </div>

                      {/* More settings */}
                      <div className="mb-4">
                        <button
                          type="button"
                          onClick={() => setTutorMoreSettingsOpen(!tutorMoreSettingsOpen)}
                          className="flex items-center gap-2 text-sm text-primary-500 hover:text-primary-700 transition-colors"
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
                                className="mt-1 h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300 rounded"
                              />
                              <div>
                                <div className="text-sm font-medium text-neutral-900">
                                  Pay custom rate
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                  You can choose to override the Job pay rate for this particular Tutor.
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
                                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                            setTutorSearchOpen(false);
                            setSelectedTutorForAdd(null);
                            setTutorPayRate('');
                            setTutorCustomRateEnabled(false);
                            setTutorAddToFutureLessons(true);
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
                          className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Create Lesson Modal */}
        {createLessonModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-neutral-900">Create Lesson</h2>
                  <button
                    onClick={() => {
                      setCreateLessonModalOpen(false);
                      setLessonCreatedSuccessfully(false);
                      setCreatingLesson(false);
                      setLessonFormData({
                        start: null,
                        finish: null,
                        topic: '',
                        location: '',
                        localOnly: false
                      });
                      setSelectedLessonStudents([]);
                      setSelectedLessonTutors([]);
                    }}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <XCircleIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Page Title */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-neutral-900">
                    Create Lesson for {service?.name || `Job ${id}`}
                  </h3>
                </div>

                {/* Lesson Brick Display */}
                {service?.description && (
                  <div className="mb-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                    <div className="flex items-center gap-2 mb-2">
                      <DocumentTextIcon className="h-5 w-5 text-primary-500" />
                      <h4 className="text-sm font-semibold text-neutral-900">Lesson Brick</h4>
                    </div>
                    <div className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
                      {service.description}
                    </div>
                  </div>
                )}

                <form onSubmit={handleCreateLesson} className="space-y-6">
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Start time <span className="text-[#DA2E72]">*</span>
                        </label>
                        <DateTimePicker
                          value={lessonFormData.start}
                          onChange={(newValue) => {
                            if (newValue) {
                              // Always update finish time to maintain 1 hour duration
                              const newFinish = newValue.add(1, 'hour');
                              setLessonFormData({
                                ...lessonFormData,
                                start: newValue,
                                finish: newFinish
                              });
                            } else {
                              setLessonFormData({ ...lessonFormData, start: newValue });
                            }
                          }}
                          minutesStep={5}
                          slotProps={{
                            textField: {
                              fullWidth: true,
                              size: 'small',
                              required: true,
                              inputProps: {
                                style: { fontSize: '14px', padding: '8px 12px' },
                                placeholder: 'Select start time'
                              }
                            }
                          }}
                          format="MM/DD/YYYY hh:mm A"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Duration
                        </label>
                        <div className="px-3 py-2 border border-neutral-300 rounded-md bg-neutral-50 text-sm text-neutral-600 flex items-center h-[40px]">
                          {lessonFormData.start && lessonFormData.finish
                            ? (() => {
                                const minutes = lessonFormData.finish.diff(lessonFormData.start, 'minute');
                                const hours = minutes / 60;
                                const roundedHours = Math.round(hours * 10) / 10;
                                return `${roundedHours} hour${roundedHours !== 1 ? 's' : ''}`;
                              })()
                            : '--'}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Finish time <span className="text-[#DA2E72]">*</span>
                        </label>
                        <DateTimePicker
                          value={lessonFormData.finish}
                          onChange={(newValue) => {
                            // Allow manual adjustment of finish time
                            setLessonFormData({ ...lessonFormData, finish: newValue });
                          }}
                          minutesStep={5}
                          minDateTime={lessonFormData.start || undefined}
                          slotProps={{
                            textField: {
                              fullWidth: true,
                              size: 'small',
                              required: true,
                              inputProps: {
                                style: { fontSize: '14px', padding: '8px 12px' },
                                placeholder: 'Select finish time'
                              }
                            }
                          }}
                          format="MM/DD/YYYY hh:mm A"
                        />
                      </div>
                    </div>
                  </LocalizationProvider>

                  {/* Warning if start time is in the past */}
                  {lessonFormData.start && lessonFormData.start.isBefore(dayjs()) && (
                    <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg">
                      <p className="text-sm text-primary-700">
                        As the start time is in the past, this Lesson will be marked as <strong>complete</strong> on submission.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Topic <span className="text-[#DA2E72]">*</span>
                      </label>
                      <input
                        type="text"
                        value={lessonFormData.topic}
                        onChange={(e) => setLessonFormData({ ...lessonFormData, topic: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Lesson topic (pre-filled from job)"
                        required
                      />
                      <p className="mt-1 text-xs text-neutral-500">Brief title for the Lesson</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Location
                      </label>
                      <input
                        type="text"
                        value={lessonFormData.location}
                        onChange={(e) => setLessonFormData({ ...lessonFormData, location: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        placeholder="Location (pre-filled from job)"
                      />
                    </div>
                  </div>

                  {/* Location Availability Section (similar to TutorCruncher) */}
                  {lessonFormData.start && lessonFormData.finish && lessonFormData.location && (
                    <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircleIcon className="h-5 w-5 text-[#2A9147]" />
                        <h4 className="text-sm font-semibold text-neutral-900">
                          Location Availability {lessonFormData.start.format('hh:mm A')} - {lessonFormData.finish.format('hh:mm A')}
                        </h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircleIcon className="h-4 w-4 text-[#2A9147] flex-shrink-0" />
                          <span className="text-neutral-700">
                            <strong>{lessonFormData.location}</strong> (selected) - ✓ Available
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-2">
                          Note: Full conflict checking will be available in a future update.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Students Selection Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-neutral-900">
                        Students
                      </label>
                      {jobStudents.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedLessonStudents.length === jobStudents.length) {
                              setSelectedLessonStudents([]);
                            } else {
                              setSelectedLessonStudents(jobStudents.map(s => s.recipient_id || s.id));
                            }
                          }}
                          className="text-xs text-primary-500 hover:text-primary-700 transition-colors"
                        >
                          {selectedLessonStudents.length === jobStudents.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600">
                      Select the Student(s) that are attending the Lesson.
                    </p>
                    {jobStudents.length > 0 ? (
                      <div className="border border-neutral-200 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                        {jobStudents.map((student) => {
                          const studentId = student.recipient_id || student.id;
                          const isSelected = selectedLessonStudents.includes(studentId);
                          return (
                            <label
                              key={studentId}
                              className="flex items-center gap-3 p-2 hover:bg-neutral-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLessonStudents([...selectedLessonStudents, studentId]);
                                  } else {
                                    setSelectedLessonStudents(selectedLessonStudents.filter(id => id !== studentId));
                                  }
                                }}
                                className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300 rounded"
                              />
                              <span className="text-sm text-neutral-900 flex-1">
                                {student.recipient_name || student.name || `Student ${studentId}`}
                              </span>
                              {student.paying_client_name && (
                                <span className="text-xs text-neutral-500">
                                  Client: {student.paying_client_name}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50 text-center">
                        <p className="text-sm text-neutral-500">No students associated with this job</p>
                      </div>
                    )}
                  </div>

                  {/* Tutors Selection Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-neutral-900">
                        Tutors
                      </label>
                      {jobTutors.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedLessonTutors.length === jobTutors.length) {
                              setSelectedLessonTutors([]);
                            } else {
                              setSelectedLessonTutors(jobTutors.map(t => t.contractor_id || t.id));
                            }
                          }}
                          className="text-xs text-primary-500 hover:text-primary-700 transition-colors"
                        >
                          {selectedLessonTutors.length === jobTutors.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600">
                      Select the Tutor(s) that are providing the Lesson.
                    </p>
                    {jobTutors.length > 0 ? (
                      <div className="border border-neutral-200 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                        {jobTutors.map((tutor) => {
                          const tutorId = tutor.contractor_id || tutor.id;
                          const isSelected = selectedLessonTutors.includes(tutorId);
                          const tutorName = `${tutor.first_name || ''} ${tutor.last_name || ''}`.trim() || tutor.name || `Tutor ${tutorId}`;
                          return (
                            <label
                              key={tutorId}
                              className="flex items-center gap-3 p-2 hover:bg-neutral-50 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLessonTutors([...selectedLessonTutors, tutorId]);
                                  } else {
                                    setSelectedLessonTutors(selectedLessonTutors.filter(id => id !== tutorId));
                                  }
                                }}
                                className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300 rounded"
                              />
                              <span className="text-sm text-neutral-900 flex-1">
                                {tutorName}
                              </span>
                              {tutor.email && (
                                <span className="text-xs text-neutral-500">
                                  {tutor.email}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50 text-center">
                        <p className="text-sm text-neutral-500">No tutors associated with this job</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="localOnly"
                      checked={lessonFormData.localOnly}
                      onChange={(e) => setLessonFormData({ ...lessonFormData, localOnly: e.target.checked })}
                      className="h-4 w-4 text-primary-500 focus:ring-primary-500 border-neutral-300 rounded"
                    />
                    <label htmlFor="localOnly" className="text-sm text-neutral-700">
                      Create locally only (skip TutorCruncher sync)
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateLessonModalOpen(false);
                        setLessonCreatedSuccessfully(false);
                        setCreatingLesson(false);
                        setLessonFormData({
                          start: null,
                          finish: null,
                          topic: '',
                          location: '',
                          localOnly: false
                        });
                        setSelectedLessonStudents([]);
                        setSelectedLessonTutors([]);
                      }}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingLesson || lessonCreatedSuccessfully}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                        lessonCreatedSuccessfully
                          ? 'bg-[#2A9147] text-white cursor-default'
                          : creatingLesson
                          ? 'bg-primary-500 text-white'
                          : 'bg-primary-500 text-white hover:bg-primary-600'
                      }`}
                    >
                      {lessonCreatedSuccessfully ? (
                        <span className="flex items-center gap-2">
                          <CheckCircleIconSolid className="h-4 w-4" />
                          Lesson Created!
                        </span>
                      ) : creatingLesson ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Lesson...
                        </span>
                      ) : (
                        'Record Lesson'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

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
    </>
  );
}
