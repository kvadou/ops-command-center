import React, { useState, useEffect } from 'react';
import { XMarkIcon, UserIcon, ClockIcon, ArrowDownTrayIcon, CheckCircleIcon, CurrencyDollarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';
import ConfirmationModal from './ConfirmationModal';

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function TutorDrilldownModal({ 
  open, 
  onClose, 
  bucketData, 
  timeView,
  dateRange,
  onRefresh
}) {
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [tutorLessons, setTutorLessons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bonusStatus, setBonusStatus] = useState(null);
  const [applyingBonus, setApplyingBonus] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({ open: false, type: null, message: '', details: null });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const fetchTutorLessons = async (tutorId) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tutorId: tutorId.toString(),
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });

      const response = await fetch(`/api/tutor-lessons?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch tutor lessons');
      
      const data = await response.json();
      setTutorLessons(data.lessons || []);
    } catch (error) {
      console.error('Error fetching tutor lessons:', error);
      setTutorLessons([]);
    } finally {
      setLoading(false);
    }
  };

  // Extract bonus amount from bucket name (e.g., "40-59.99 hours - Consistency Bonus $200" → 200)
  const extractBonusAmount = (bucketName) => {
    const match = bucketName.match(/\$(\d+)/);
    return match ? parseFloat(match[1]) : null;
  };

  // Tier boundaries for consistency bonuses
  const BONUS_TIERS = [
    { min: 40, max: 59.99, bonus: 200 },
    { min: 60, max: 79.99, bonus: 400 },
    { min: 80, max: Infinity, bonus: 600 }
  ];

  // Check if tutor's hours are close to the next tier boundary
  const getNextTierWarning = (hours) => {
    if (!hours) return null;

    const THRESHOLD = 10; // Warn if within 10 hours of next tier

    for (const tier of BONUS_TIERS) {
      if (hours >= tier.min && hours <= tier.max) {
        // Find the next tier
        const nextTier = BONUS_TIERS.find(t => t.min > tier.max);
        if (nextTier) {
          const hoursToNextTier = nextTier.min - hours;
          if (hoursToNextTier <= THRESHOLD) {
            return {
              currentTier: tier.bonus,
              nextTier: nextTier.bonus,
              hoursToNextTier: hoursToNextTier.toFixed(1),
              nextTierMin: nextTier.min
            };
          }
        }
        break;
      }
    }
    return null;
  };

  // Check if bonus has been applied for selected tutor
  const checkBonusStatus = async (tutorId) => {
    if (!bucketData || !dateRange) return;
    
    const bonusAmount = extractBonusAmount(bucketData.name);
    if (!bonusAmount) return;

    try {
      const params = new URLSearchParams({
        contractorId: tutorId.toString(),
        periodStart: dateRange.start.toISOString().split('T')[0],
        periodEnd: dateRange.end.toISOString().split('T')[0],
        bucketName: bucketData.name
      });

      const response = await fetch(`/api/consistency-bonus/status?${params}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setBonusStatus(data);
      }
    } catch (error) {
      console.error('Error checking bonus status:', error);
    }
  };

  // Apply consistency bonus
  const handleApplyBonus = async () => {
    if (!selectedTutor || !bucketData || !dateRange) return;

    const bonusAmount = extractBonusAmount(bucketData.name);
    if (!bonusAmount) {
      setFeedbackModal({
        open: true,
        type: 'error',
        message: 'Could not determine bonus amount from bucket name',
        details: null
      });
      return;
    }

    const tierWarning = getNextTierWarning(selectedTutor.hours);
    let confirmMessage = `Apply $${bonusAmount} consistency bonus to ${selectedTutor.name}?`;

    if (tierWarning) {
      confirmMessage = `WARNING: ${selectedTutor.name} is only ${tierWarning.hoursToNextTier} hours away from the $${tierWarning.nextTier} tier (${tierWarning.nextTierMin}+ hours). If more lessons sync, they may qualify for the higher tier. Are you sure you want to apply the $${bonusAmount} bonus now?`;
    }

    setConfirmState({
      isOpen: true,
      title: 'Apply Consistency Bonus',
      message: confirmMessage,
      action: () => applyBonusConfirmed(bonusAmount)
    });
  };

  const applyBonusConfirmed = async (bonusAmount) => {
    setApplyingBonus(true);
    try {
      const payload = {
        contractorId: selectedTutor.id,
        contractorName: selectedTutor.name,
        bonusAmount: bonusAmount,
        periodStart: dateRange.start.toISOString().split('T')[0],
        periodEnd: dateRange.end.toISOString().split('T')[0],
        hoursWorked: selectedTutor.hours,
        bucketName: bucketData.name
      };

      const response = await fetch('/api/consistency-bonus/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response from server:', errorData);

        // Build detailed error message
        let errorMessage = errorData.error || 'Failed to apply bonus';
        if (errorData.details) {
          if (errorData.details.data) {
            errorMessage += `\n\nDetails: ${JSON.stringify(errorData.details.data, null, 2)}`;
          } else if (errorData.details.message) {
            errorMessage += `\n\nTechnical details: ${errorData.details.message}`;
          }
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Show success modal
      setFeedbackModal({
        open: true,
        type: 'success',
        message: data.message,
        details: {
          tutorName: selectedTutor.name,
          bonusAmount: bonusAmount,
          tutorcruncherChargeId: data.tutorcruncherChargeId
        }
      });

      // Refresh bonus status
      await checkBonusStatus(selectedTutor.id);

      // Refresh bucket data if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error applying bonus:', error);
      console.error('Error details:', error.message);

      // Show error modal
      setFeedbackModal({
        open: true,
        type: 'error',
        message: 'Error applying bonus',
        details: {
          error: error.message
        }
      });
    } finally {
      setApplyingBonus(false);
    }
  };

  const handleTutorClick = (tutor) => {
    setSelectedTutor(tutor);
    
    // Use bonus status from tutor object if available, otherwise set to null
    if (tutor.bonusStatus?.applied) {
      setBonusStatus({
        applied: true,
        bonus: {
          bonus_amount: tutor.bonusStatus.bonusAmount,
          applied_at: tutor.bonusStatus.appliedAt,
          tutorcruncher_charge_id: tutor.bonusStatus.tutorcruncherChargeId
        }
      });
    } else {
      setBonusStatus(null);
    }
    
    fetchTutorLessons(tutor.id);
    // Still check bonus status via API to ensure we have the latest data
    checkBonusStatus(tutor.id);
  };

  const handleClose = () => {
    setSelectedTutor(null);
    setTutorLessons([]);
    onClose();
  };

  const exportToCSV = () => {
    if (!selectedTutor || !tutorLessons.length) return;

    // Create CSV headers
    const headers = [
      'Date',
      'Start Time', 
      'Finish Time',
      'Service Name',
      'Raw Duration (hours)',
      'Calculated Hours',
      'Labels',
      'Student Names',
      'Student Count',
      'Appointment ID'
    ];

    // Create CSV rows
    const rows = tutorLessons.map(lesson => {
      const startDate = new Date(lesson.start);
      const endDate = new Date(lesson.finish);
      const durationHours = lesson.durationHours || lesson.teachingHours || 0;
      const rawDurationHours = lesson.rawDurationHours || 0;
      
      return [
        startDate.toLocaleDateString(),
        startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        `"${lesson.serviceName || ''}"`, // Escape quotes in service name
        rawDurationHours.toFixed(2),
        durationHours.toFixed(2),
        `"${Array.isArray(lesson.labels) ? lesson.labels.join(', ') : (lesson.labels || '')}"`,
        `"${(lesson.students || []).map(s => s.student_name).join(', ')}"`, // Escape quotes in student names
        (lesson.students || []).length,
        lesson.appointmentId
      ];
    });

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedTutor.name.replace(/[^a-z0-9]/gi, '_')}_lessons_${timeView.toLowerCase()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!open || !bucketData) return null;

  const totalHours = bucketData.tutors.reduce((sum, tutor) => sum + tutor.hours, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] min-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">
              {bucketData.name} - Tutor Details
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              {bucketData.tutors.length} tutors • {totalHours.toFixed(1)} total hours
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedTutor ? (
            /* Tutor List View */
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid gap-3">
                {bucketData.tutors.map((tutor) => (
                  <div
                    key={tutor.id}
                    onClick={() => handleTutorClick(tutor)}
                    className="p-4 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                            <UserIcon className="h-5 w-5 text-purple-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-sm font-medium text-neutral-900">
                              {tutor.name}
                            </h3>
                            {tutor.bonusStatus?.applied && (
                              <CheckCircleIconSolid className="h-4 w-4 text-green-500 flex-shrink-0" title="Consistency bonus applied" />
                            )}
                          </div>
                          <div className="flex items-center space-x-3 mt-1">
                            <p className="text-sm text-neutral-500">
                              {tutor.hours} hours
                            </p>
                            {tutor.bonusStatus?.applied && (
                              <p className="text-xs text-green-600">
                                ✓ Bonus: ${tutor.bonusStatus.bonusAmount} • {new Date(tutor.bonusStatus.appliedAt).toLocaleDateString()}
                              </p>
                            )}
                            {!tutor.bonusStatus?.applied && getNextTierWarning(tutor.hours) && (
                              <p className="text-xs text-amber-600 flex items-center">
                                <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                                {getNextTierWarning(tutor.hours).hoursToNextTier}h to ${getNextTierWarning(tutor.hours).nextTier} tier
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTutor(tutor);
                          fetchTutorLessons(tutor.id);
                          checkBonusStatus(tutor.id);
                        }}
                        className="text-sm text-purple-600 hover:text-purple-700 ml-4 hover:underline cursor-pointer"
                      >
                        Click to view lessons →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Tutor Lessons View */
            <>
              {/* Tutor Header */}
              <div className="flex-shrink-0 p-6 border-b border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setSelectedTutor(null)}
                      className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                    >
                      ← Back to tutors
                    </button>
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold text-neutral-900">
                            <a
                              href={`https://account.acmeops.com/contractors/${selectedTutor.id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-purple-600 hover:text-purple-700 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {selectedTutor.name}
                            </a>
                          </h3>
                          {bonusStatus?.applied && (
                            <CheckCircleIconSolid className="h-5 w-5 text-green-500" title="Consistency bonus applied" />
                          )}
                        </div>
                        <p className="text-sm text-neutral-500">
                          {selectedTutor.hours} hours • {timeView} view • {tutorLessons.length} lessons
                        </p>
                        {bonusStatus?.applied && (
                          <p className="text-xs text-green-600 mt-1">
                            ✓ Bonus applied: ${bonusStatus.bonus.bonus_amount} on {new Date(bonusStatus.bonus.applied_at).toLocaleDateString()}
                          </p>
                        )}
                        {!bonusStatus?.applied && selectedTutor && getNextTierWarning(selectedTutor.hours) && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                            <p className="text-xs text-amber-700 flex items-center">
                              <ExclamationTriangleIcon className="h-4 w-4 mr-1.5 flex-shrink-0" />
                              <span>
                                <strong>Warning:</strong> This tutor is only {getNextTierWarning(selectedTutor.hours).hoursToNextTier} hours away from the ${getNextTierWarning(selectedTutor.hours).nextTier} tier ({getNextTierWarning(selectedTutor.hours).nextTierMin}+ hours).
                                Consider waiting for more lessons to sync before applying.
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {extractBonusAmount(bucketData.name) && (
                      <button
                        onClick={handleApplyBonus}
                        disabled={applyingBonus || bonusStatus?.applied}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                          bonusStatus?.applied
                            ? 'bg-green-100 text-green-700 cursor-not-allowed'
                            : applyingBonus
                            ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                        title={bonusStatus?.applied ? 'Bonus already applied' : `Apply $${extractBonusAmount(bucketData.name)} consistency bonus`}
                      >
                        {bonusStatus?.applied ? (
                          <>
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="text-sm font-medium">Bonus Applied</span>
                          </>
                        ) : (
                          <>
                            <CurrencyDollarIcon className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              {applyingBonus ? 'Applying...' : `Apply $${extractBonusAmount(bucketData.name)} Bonus`}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    {tutorLessons.length > 0 && (
                      <button
                        onClick={exportToCSV}
                        className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Export CSV</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Lessons List */}
              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-neutral-600">Loading lessons...</span>
                  </div>
                ) : tutorLessons.length > 0 ? (
                  <div className="space-y-4 pb-4">
                    {tutorLessons.map((lesson, index) => (
                      <div key={lesson.appointmentId} className="border border-neutral-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <div className="flex items-center text-sm text-neutral-500">
                                <ClockIcon className="h-4 w-4 mr-1" />
                                {parseFloat(lesson.durationHours || lesson.teachingHours || 0).toFixed(2)}h
                                {lesson.rawDurationHours && lesson.rawDurationHours < 1 && parseFloat(lesson.durationHours || lesson.teachingHours || 0) === 1.0 && (
                                  <span className="ml-1 text-xs text-yellow-600">(min 1.0h)</span>
                                )}
                              </div>
                              <div className="text-sm font-medium text-neutral-900">
                                {lesson.serviceName}
                              </div>
                            </div>
                            <div className="text-sm text-neutral-600">
                              <div>
                                Start: {new Date(lesson.start).toLocaleDateString()} {new Date(lesson.start).toLocaleTimeString([], { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                              <div>
                                Finish: {new Date(lesson.finish).toLocaleDateString()} {new Date(lesson.finish).toLocaleTimeString([], { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                              {lesson.rawDurationHours && (
                                <div className="text-xs text-neutral-500 mt-1">
                                  Raw Duration: {parseFloat(lesson.rawDurationHours).toFixed(2)}h → Calculated: {parseFloat(lesson.durationHours || lesson.teachingHours || 0).toFixed(2)}h
                                </div>
                              )}
                              {lesson.labels && (
                                <div className="text-xs text-neutral-500 mt-1">
                                  Labels: {Array.isArray(lesson.labels) ? lesson.labels.join(', ') : lesson.labels}
                                </div>
                              )}
                            </div>
                            {lesson.students && lesson.students.length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs font-medium text-neutral-500 mb-1">
                                  Students ({lesson.students.length}):
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {lesson.students.map((student, idx) => (
                                    <span
                                      key={idx}
                                      className={classNames(
                                        "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                                        student.status === 'attended' 
                                          ? "bg-green-100 text-green-800"
                                          : "bg-yellow-100 text-yellow-800"
                                      )}
                                    >
                                      {student.student_name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-neutral-500">
                      No lessons found for this tutor in the selected period.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />

      {/* Feedback Modal */}
      {feedbackModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-popover p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className={`p-6 ${feedbackModal.type === 'success' ? 'bg-green-50' : 'bg-red-50'} rounded-t-lg`}>
              <div className="flex items-start">
                <div className={`flex-shrink-0 ${feedbackModal.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {feedbackModal.type === 'success' ? (
                    <CheckCircleIconSolid className="h-6 w-6" />
                  ) : (
                    <ExclamationTriangleIcon className="h-6 w-6" />
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <h3 className={`text-lg font-medium ${feedbackModal.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                    {feedbackModal.type === 'success' ? 'Bonus Applied Successfully' : 'Error Applying Bonus'}
                  </h3>
                  <div className={`mt-2 text-sm ${feedbackModal.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                    <p>{feedbackModal.message}</p>
                  </div>
                </div>
                <button
                  onClick={() => setFeedbackModal({ open: false, type: null, message: '', details: null })}
                  className={`ml-4 flex-shrink-0 ${feedbackModal.type === 'success' ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 bg-white rounded-b-lg">
              {feedbackModal.type === 'success' && feedbackModal.details && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-neutral-200">
                    <span className="text-sm font-medium text-neutral-500">Tutor:</span>
                    <span className="text-sm text-neutral-900">{feedbackModal.details.tutorName}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-neutral-200">
                    <span className="text-sm font-medium text-neutral-500">Bonus Amount:</span>
                    <span className="text-sm font-semibold text-green-600">${feedbackModal.details.bonusAmount}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-medium text-neutral-500">Charge ID:</span>
                    <a
                      href={`https://account.acmeops.com/accounting/adhoccharges/${feedbackModal.details.tutorcruncherChargeId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-purple-600 hover:text-purple-700 hover:underline"
                    >
                      {feedbackModal.details.tutorcruncherChargeId}
                    </a>
                  </div>
                </div>
              )}
              
              {feedbackModal.type === 'error' && feedbackModal.details && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800 font-medium">Error Details:</p>
                    <p className="text-sm text-red-700 mt-1">{feedbackModal.details.error}</p>
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Check the browser console for more technical details.
                  </p>
                </div>
              )}
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setFeedbackModal({ open: false, type: null, message: '', details: null })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    feedbackModal.type === 'success'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
