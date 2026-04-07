import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DocumentArrowUpIcon, DocumentArrowDownIcon, PencilIcon, CheckIcon, XMarkIcon, ClockIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../utils/formatters';

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState('w2-hourly'); // 'w2-hourly' or '1099-branch'
  
  // W2 Hourly state
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [employeeRates, setEmployeeRates] = useState({});
  const [editingRate, setEditingRate] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [savingRates, setSavingRates] = useState(false);
  const [dynamicRates, setDynamicRates] = useState({}); // Rates edited in summary table
  const [payCycles, setPayCycles] = useState([]);
  const [selectedPayCycle, setSelectedPayCycle] = useState(null);
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingCycles, setLoadingCycles] = useState(false);

  // Load employee rates and pay cycles on mount
  useEffect(() => {
    loadEmployeeRates();
    loadPayCycles();
    loadPayrollHistory();
  }, []);

  const loadEmployeeRates = async () => {
    try {
      const response = await axios.get('/api/payroll/rates');
      setEmployeeRates(response.data);
    } catch (err) {
      console.error('Error loading employee rates:', err);
    }
  };

  const loadPayCycles = async () => {
    setLoadingCycles(true);
    try {
      console.log('Fetching pay cycles from API...');
      const response = await axios.get('/api/payroll/pay-cycles');
      console.log('API Response:', response);
      console.log('Response data:', response.data);
      const cycles = response.data.cycles || [];
      console.log('Loaded pay cycles:', cycles);
      console.log('Number of cycles:', cycles.length);
      setPayCycles(cycles);
      // Auto-select the first (most recent) pay cycle
      if (cycles.length > 0 && !selectedPayCycle) {
        console.log('Auto-selecting first cycle:', cycles[0]);
        setSelectedPayCycle(cycles[0]);
      } else if (cycles.length === 0) {
        console.warn('No pay cycles returned from API. The pay_cycles table may be empty.');
      }
    } catch (err) {
      console.error('Error loading pay cycles:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(`Failed to load pay periods: ${err.response?.data?.error || err.message}. Please refresh the page.`);
    } finally {
      setLoadingCycles(false);
    }
  };

  const generatePayCycles = async () => {
    try {
      // Generate cycles starting from 11/2/2025
      await axios.post('/api/payroll/pay-cycles', {
        startDate: '2025-11-02',
        count: 12
      });
      await loadPayCycles();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to generate pay cycles');
      console.error('Error generating pay cycles:', err);
    }
  };

  const loadPayrollHistory = async () => {
    try {
      const response = await axios.get('/api/payroll/history');
      setPayrollHistory(response.data.history || []);
    } catch (err) {
      console.error('Error loading payroll history:', err);
    }
  };

  const downloadHistoricalCSV = async (payrollId) => {
    try {
      const response = await axios.get(`/api/payroll/history/${payrollId}`);
      const payroll = response.data.payroll;
      
      // Format today's date as YYYYMMDD for filename
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      // Create download link with filename: hourly_w2_payroll_import_YYYYMMDD.csv
      const blob = new Blob([payroll.csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hourly_w2_payroll_import_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading historical CSV:', err);
      setError('Failed to download historical CSV');
    }
  };

  const saveEmployeeRates = async () => {
    setSavingRates(true);
    try {
      await axios.put('/api/payroll/rates', employeeRates);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save rates');
      console.error('Error saving rates:', err);
    } finally {
      setSavingRates(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
        setError('Please upload a CSV file');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setError(null);
      setSuccess(false);
      setAnalysis(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/payroll/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setAnalysis(response.data);
      // Initialize dynamic rates from analysis (use rates from CSV)
      const initialRates = {};
      response.data.summary.forEach(emp => {
        initialRates[emp.employeeId] = {
          regRate: emp.regRate,
          reg1Rate: emp.reg1Rate
        };
      });
      setDynamicRates(initialRates);
      // Update rates if they were returned
      if (response.data.employeeRates) {
        setEmployeeRates(response.data.employeeRates);
      }
    } catch (err) {
      console.error('Error analyzing file:', err);
      let errorMessage = 'Failed to analyze file';
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          try {
            const errorData = JSON.parse(err.response.data);
            errorMessage = errorData.error || errorData.details || errorMessage;
          } catch (e) {
            errorMessage = err.response.data;
          }
        } else {
          errorMessage = err.response.data.error || err.response.data.details || errorMessage;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleProcess = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    if (!selectedPayCycle) {
      setError('Please select a pay period');
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      // First, save the dynamic rates to the server so they're used in processing
      if (Object.keys(dynamicRates).length > 0) {
        const updatedRates = { ...employeeRates };
        Object.keys(dynamicRates).forEach(empId => {
          if (updatedRates[empId]) {
            updatedRates[empId].regRate = dynamicRates[empId].regRate;
            updatedRates[empId].reg1Rate = dynamicRates[empId].reg1Rate;
          }
        });
        await axios.put('/api/payroll/rates', updatedRates);
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('payPeriodStart', selectedPayCycle.payPeriodStart);
      formData.append('payPeriodEnd', selectedPayCycle.payPeriodEnd);
      formData.append('payrollDeadline', selectedPayCycle.payrollDeadline);
      formData.append('payday', selectedPayCycle.payday);
      formData.append('saveToHistory', saveToHistory);

      const response = await axios.post('/api/payroll/process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'blob',
      });

      // Format today's date as YYYYMMDD for filename
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      // Create download link with filename: hourly_w2_payroll_import_YYYYMMDD.csv
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hourly_w2_payroll_import_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setSuccess(true);
      setFile(null);
      setAnalysis(null);
      // Reset file input
      const fileInput = document.getElementById('file-input');
      if (fileInput) fileInput.value = '';
      
      // Reload history if saved
      if (saveToHistory) {
        await loadPayrollHistory();
      }
    } catch (err) {
      console.error('Error processing file:', err);
      let errorMessage = 'Failed to process file';
      
      if (err.response?.data) {
        try {
          const errorText = await err.response.data.text();
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.details || errorMessage;
        } catch (e) {
          errorMessage = err.response.status === 403 
            ? 'Access denied. Admin access required.'
            : errorMessage;
        }
      }
      
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const updateRate = (employeeId, field, value) => {
    setEmployeeRates(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  const updateDynamicRate = (employeeId, field, value) => {
    setDynamicRates(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  // Calculate totals using dynamic rates - all hours use REG rate only
  const calculateTotals = () => {
    if (!analysis) return null;
    
    return analysis.summary.map(emp => {
      const rates = dynamicRates[emp.employeeId] || { regRate: emp.regRate, reg1Rate: emp.reg1Rate };
      // All hours use REG rate only - use totalHours from backend
      const totalHours = emp.totalHours || emp.regularHours || 0;
      const totalAmount = totalHours * rates.regRate;
      return {
        ...emp,
        regRate: rates.regRate,
        reg1Rate: rates.reg1Rate,
        totalHours: totalHours,
        totalAmount: totalAmount
      };
    });
  };

  const startEditingRate = (employeeId) => {
    setEditingRate(employeeId);
  };

  const cancelEditingRate = () => {
    setEditingRate(null);
    loadEmployeeRates(); // Reload to discard changes
  };

  const saveRate = (employeeId) => {
    setEditingRate(null);
    saveEmployeeRates();
  };


  const employeesList = Object.values(employeeRates).sort((a, b) => 
    a.employeeName.localeCompare(b.employeeName)
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-neutral-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('w2-hourly')}
              className={`
                px-6 py-4 text-sm font-medium border-b-2 transition-colors
                ${activeTab === 'w2-hourly'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }
              `}
            >
              W2 Hourly - Engage PEO
            </button>
            <button
              onClick={() => setActiveTab('1099-branch')}
              className={`
                px-6 py-4 text-sm font-medium border-b-2 transition-colors
                ${activeTab === '1099-branch'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }
              `}
            >
              1099 Tutors - Branch
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'w2-hourly' && (
        <W2HourlyTabContent
          file={file}
          setFile={setFile}
          processing={processing}
          setProcessing={setProcessing}
          analyzing={analyzing}
          setAnalyzing={setAnalyzing}
          error={error}
          setError={setError}
          success={success}
          setSuccess={setSuccess}
          employeeRates={employeeRates}
          setEmployeeRates={setEmployeeRates}
          editingRate={editingRate}
          setEditingRate={setEditingRate}
          analysis={analysis}
          setAnalysis={setAnalysis}
          savingRates={savingRates}
          setSavingRates={setSavingRates}
          dynamicRates={dynamicRates}
          setDynamicRates={setDynamicRates}
          payCycles={payCycles}
          setPayCycles={setPayCycles}
          selectedPayCycle={selectedPayCycle}
          setSelectedPayCycle={setSelectedPayCycle}
          saveToHistory={saveToHistory}
          setSaveToHistory={setSaveToHistory}
          payrollHistory={payrollHistory}
          setPayrollHistory={setPayrollHistory}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
          loadingCycles={loadingCycles}
          setLoadingCycles={setLoadingCycles}
          loadEmployeeRates={loadEmployeeRates}
          loadPayCycles={loadPayCycles}
          generatePayCycles={generatePayCycles}
          loadPayrollHistory={loadPayrollHistory}
          downloadHistoricalCSV={downloadHistoricalCSV}
          saveEmployeeRates={saveEmployeeRates}
          saveRate={saveRate}
          updateRate={updateRate}
          updateDynamicRate={updateDynamicRate}
          cancelEditingRate={cancelEditingRate}
          startEditingRate={startEditingRate}
          handleFileChange={handleFileChange}
          handleAnalyze={handleAnalyze}
          handleProcess={handleProcess}
          calculateTotals={calculateTotals}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === '1099-branch' && (
        <Branch1099Content />
      )}
    </div>
  );
}

// W2 Hourly Tab Content Component
function W2HourlyTabContent({
  file, setFile, processing, setProcessing, analyzing, setAnalyzing,
  error, setError, success, setSuccess, employeeRates, setEmployeeRates,
  editingRate, setEditingRate, analysis, setAnalysis, savingRates, setSavingRates,
  dynamicRates, setDynamicRates, payCycles, setPayCycles, selectedPayCycle, setSelectedPayCycle,
  saveToHistory, setSaveToHistory, payrollHistory, setPayrollHistory,
  showHistory, setShowHistory, loadingCycles, setLoadingCycles,
  loadEmployeeRates, loadPayCycles, generatePayCycles, loadPayrollHistory,
  downloadHistoricalCSV, saveEmployeeRates, saveRate, updateRate, updateDynamicRate,
  cancelEditingRate, startEditingRate, handleFileChange, handleAnalyze, handleProcess,
  calculateTotals, formatCurrency
}) {
  const employeesList = Object.values(employeeRates).sort((a, b) => 
    a.employeeName.localeCompare(b.employeeName)
  );

  return (
    <div className="space-y-6">
      {/* Rate Configuration Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Employee Rate Configuration</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Configure REG rate (teaching) and REG1 rate (non-teaching) for each employee
            </p>
          </div>
          {savingRates && (
            <span className="text-sm text-neutral-500">Saving...</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  REG Rate ($/hr)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  REG1 Rate ($/hr)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {employeesList.map((emp) => {
                const isEditing = editingRate === emp.employeeId;
                return (
                  <tr key={emp.employeeId}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                      {emp.employeeName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                      {emp.department}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={emp.regRate || ''}
                          onChange={(e) => updateRate(emp.employeeId, 'regRate', e.target.value)}
                          className="w-24 px-2 py-1 border border-neutral-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-neutral-900">${emp.regRate || 0}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={emp.reg1Rate || ''}
                          onChange={(e) => updateRate(emp.employeeId, 'reg1Rate', e.target.value)}
                          className="w-24 px-2 py-1 border border-neutral-300 rounded-md text-sm"
                        />
                      ) : (
                        <span className="text-sm text-neutral-900">${emp.reg1Rate || 0}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveRate(emp.employeeId)}
                            className="text-green-600 hover:text-green-800"
                            title="Save"
                          >
                            <CheckIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={cancelEditingRate}
                            className="text-red-600 hover:text-red-800"
                            title="Cancel"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingRate(emp.employeeId)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* File Upload Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Payroll Import/Export</h2>
          <p className="text-neutral-600">
            Upload a TutorCruncher payment order export CSV to generate an Engage PEO import file.
          </p>
        </div>

        <div className="space-y-6">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Upload TutorCruncher Export CSV
            </label>
            <div className="mt-1 flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-md shadow-sm text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer">
                <DocumentArrowUpIcon className="h-5 w-5" />
                Choose File
                <input
                  id="file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {file && (
                <span className="text-sm text-neutral-600">
                  {file.name}
                </span>
              )}
            </div>
          </div>

          {/* Pay Period Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Select Pay Period <span className="text-red-500">*</span>
            </label>
            {loadingCycles ? (
              <div className="text-sm text-neutral-500">Loading pay periods...</div>
            ) : payCycles.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="font-medium">No pay periods available</p>
                <p className="text-xs mt-1">The pay cycles may need to be generated. Check the browser console for details.</p>
              </div>
            ) : (
              <select
                value={selectedPayCycle?.id || selectedPayCycle?.payPeriodStart || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  // Try to find by id first, then by payPeriodStart
                  const cycle = payCycles.find(c => 
                    (c.id && c.id.toString() === value) || 
                    (!c.id && c.payPeriodStart === value)
                  );
                  setSelectedPayCycle(cycle || null);
                  setError(null); // Clear error when selection is made
                }}
                className="mt-1 block w-full max-w-md px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-purple focus:border-brand-purple text-sm"
              >
                <option value="">-- Select a pay period --</option>
                {(() => {
                  // Filter cycles - include past 30 days, current, and future pay periods
                  const filteredCycles = payCycles.filter(cycle => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Calculate date 30 days ago to include recent past periods
                    const thirtyDaysAgo = new Date(today);
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    
                    // Parse date - handle both ISO format (YYYY-MM-DD) and MM/DD/YYYY format
                    let periodStart = new Date(cycle.payPeriodStart);
                    let periodEnd = new Date(cycle.payPeriodEnd);
                    
                    // If date parsing failed, try parsing MM/DD/YYYY format
                    if (isNaN(periodStart.getTime()) && cycle.payPeriodStart.includes('/')) {
                      const [month, day, year] = cycle.payPeriodStart.split('/');
                      periodStart = new Date(year, month - 1, day);
                    }
                    if (isNaN(periodEnd.getTime()) && cycle.payPeriodEnd.includes('/')) {
                      const [month, day, year] = cycle.payPeriodEnd.split('/');
                      periodEnd = new Date(year, month - 1, day);
                    }
                    
                    periodStart.setHours(0, 0, 0, 0);
                    periodEnd.setHours(0, 0, 0, 0);
                    
                    // Include if: period ended within last 30 days, current period, or future period
                    const isRecentPast = periodEnd >= thirtyDaysAgo && periodEnd < today;
                    const isCurrentOrFuture = (today >= periodStart && today <= periodEnd) || periodStart >= today;
                    return isRecentPast || isCurrentOrFuture;
                  });
                  
                  // If filter excluded everything, show all cycles (for debugging)
                  const cyclesToShow = filteredCycles.length > 0 ? filteredCycles : payCycles;
                  
                  return cyclesToShow.sort((a, b) => {
                    // Sort: current period first, then future periods chronologically
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Parse dates - handle both ISO format (YYYY-MM-DD) and MM/DD/YYYY format
                    let aStart = new Date(a.payPeriodStart);
                    let bStart = new Date(b.payPeriodStart);
                    let aEnd = new Date(a.payPeriodEnd);
                    let bEnd = new Date(b.payPeriodEnd);
                    
                    // If date parsing failed, try parsing MM/DD/YYYY format
                    if (isNaN(aStart.getTime()) && a.payPeriodStart.includes('/')) {
                      const [month, day, year] = a.payPeriodStart.split('/');
                      aStart = new Date(year, month - 1, day);
                    }
                    if (isNaN(bStart.getTime()) && b.payPeriodStart.includes('/')) {
                      const [month, day, year] = b.payPeriodStart.split('/');
                      bStart = new Date(year, month - 1, day);
                    }
                    if (isNaN(aEnd.getTime()) && a.payPeriodEnd.includes('/')) {
                      const [month, day, year] = a.payPeriodEnd.split('/');
                      aEnd = new Date(year, month - 1, day);
                    }
                    if (isNaN(bEnd.getTime()) && b.payPeriodEnd.includes('/')) {
                      const [month, day, year] = b.payPeriodEnd.split('/');
                      bEnd = new Date(year, month - 1, day);
                    }
                    
                    aStart.setHours(0, 0, 0, 0);
                    bStart.setHours(0, 0, 0, 0);
                    aEnd.setHours(0, 0, 0, 0);
                    bEnd.setHours(0, 0, 0, 0);
                    
                    const aIsCurrent = today >= aStart && today <= aEnd;
                    const bIsCurrent = today >= bStart && today <= bEnd;
                    
                    if (aIsCurrent && !bIsCurrent) return -1;
                    if (!aIsCurrent && bIsCurrent) return 1;
                    // Both current or both future - sort by start date
                    return aStart - bStart;
                  })
                  .map((cycle) => {
                    const formatDate = (dateStr) => {
                      // Parse date - handle both ISO format (YYYY-MM-DD) and MM/DD/YYYY format
                      let date = new Date(dateStr);
                      if (isNaN(date.getTime()) && dateStr.includes('/')) {
                        const [month, day, year] = dateStr.split('/');
                        date = new Date(year, month - 1, day);
                      }
                      return date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      });
                    };
                    const periodLabel = `${formatDate(cycle.payPeriodStart)} - ${formatDate(cycle.payPeriodEnd)}`;
                    const paydayLabel = ` (Payday: ${formatDate(cycle.payday)})`;
                    const isCurrent = (() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      
                      // Parse dates - handle both ISO format (YYYY-MM-DD) and MM/DD/YYYY format
                      let periodStart = new Date(cycle.payPeriodStart);
                      let periodEnd = new Date(cycle.payPeriodEnd);
                      
                      if (isNaN(periodStart.getTime()) && cycle.payPeriodStart.includes('/')) {
                        const [month, day, year] = cycle.payPeriodStart.split('/');
                        periodStart = new Date(year, month - 1, day);
                      }
                      if (isNaN(periodEnd.getTime()) && cycle.payPeriodEnd.includes('/')) {
                        const [month, day, year] = cycle.payPeriodEnd.split('/');
                        periodEnd = new Date(year, month - 1, day);
                      }
                      
                      periodStart.setHours(0, 0, 0, 0);
                      periodEnd.setHours(0, 0, 0, 0);
                      return today >= periodStart && today <= periodEnd;
                    })();
                    return (
                      <option key={cycle.id || cycle.payPeriodStart} value={cycle.id ? cycle.id.toString() : cycle.payPeriodStart}>
                        {isCurrent ? '🟢 ' : ''}{periodLabel}{paydayLabel}
                      </option>
                    );
                  });
                })()}
              </select>
            )}
            {selectedPayCycle && (
              <div className="mt-2 text-sm text-neutral-600">
                <div>Pay Period: {new Date(selectedPayCycle.payPeriodStart).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {new Date(selectedPayCycle.payPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <div>Payroll Deadline: {new Date(selectedPayCycle.payrollDeadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <div>Payday: {new Date(selectedPayCycle.payday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800">
                    File processed successfully! The Engage PEO import file has been downloaded.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleAnalyze}
              disabled={!file || analyzing}
              className={`flex items-center gap-2 px-6 py-3 rounded-md font-medium text-white ${
                !file || analyzing
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } transition-colors`}
            >
              {analyzing ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                'Analyze Hours & Totals'
              )}
            </button>
            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className={`flex items-center gap-2 px-6 py-3 rounded-md font-medium text-white ${
                !file || processing
                  ? 'bg-neutral-400 cursor-not-allowed'
                  : 'bg-brand-purple hover:bg-purple-700'
              } transition-colors`}
            >
              {processing ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <DocumentArrowDownIcon className="h-5 w-5" />
                  Generate Engage PEO Import File
                </>
              )}
            </button>
          </div>

          {/* Analysis Summary */}
          {analysis && (() => {
            const calculatedTotals = calculateTotals();
            const grandTotal = calculatedTotals.reduce((sum, emp) => sum + emp.totalAmount, 0);
            
            return (
              <div className="mt-6 border-t border-neutral-200 pt-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Hours & Totals Summary</h3>
                <p className="text-sm text-neutral-600 mb-4">
                  Edit rates in the table below to adjust totals. Hours are from the CSV Quantity column.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Total Hours
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          REG Rate ($/hr)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Grand Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {calculatedTotals.map((emp) => (
                        <tr key={emp.employeeId}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                            {emp.employeeName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 text-right">
                            {emp.totalHours.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={emp.regRate || ''}
                              onChange={(e) => updateDynamicRate(emp.employeeId, 'regRate', e.target.value)}
                              className="w-20 px-2 py-1 border border-neutral-300 rounded-md text-sm text-right"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-right">
                            {formatCurrency(emp.totalAmount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-neutral-50 font-bold">
                        <td colSpan="3" className="px-4 py-3 text-right text-sm text-neutral-900">
                          Grand Total:
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-right">
                          {formatCurrency(grandTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Instructions */}
          <div className="mt-8 border-t border-neutral-200 pt-6">
            <h3 className="text-sm font-medium text-neutral-900 mb-3">Instructions</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-neutral-600">
              <li>Configure employee rates using the table above (REG = teaching rate, REG1 = non-teaching rate)</li>
              <li>Select the pay period for this payroll run</li>
              <li>Export payment orders from TutorCruncher for the desired date range</li>
              <li>Upload the CSV export file using the button above</li>
              <li>Click "Analyze Hours & Totals" to preview the calculated hours and dollar amounts</li>
              <li>Click "Generate Engage PEO Import File" to create the import file</li>
              <li>The system will automatically:
                <ul className="list-disc list-inside ml-6 mt-1">
                  <li>Sum all dollar amounts from CSV (Quantity × UnitAmount)</li>
                  <li>Calculate hours by dividing total amount by REG rate</li>
                  <li>Generate the import file in Engage PEO format</li>
                  <li>Save to history if enabled</li>
                </ul>
              </li>
              <li>Download and import the generated file into Engage PEO</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Payroll History Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Payroll History</h2>
            <p className="text-sm text-neutral-600 mt-1">
              View and download past payroll runs
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
          >
            <ClockIcon className="h-5 w-5" />
            {showHistory ? 'Hide' : 'Show'} History
          </button>
        </div>

        {showHistory && (
          <div className="mt-4">
            {payrollHistory.length === 0 ? (
              <div className="text-center py-8 text-neutral-500">
                No payroll history yet. Complete a payroll run to see it here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Pay Period
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Deadline
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Payday
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Grand Total
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {payrollHistory.map((payroll) => {
                      const summary = payroll.summaryData || {};
                      const grandTotal = summary.grandTotal || 0;
                      
                      // Format dates as MM/DD/YYYY
                      const formatDateDisplay = (dateStr) => {
                        if (!dateStr) return '';
                        const date = new Date(dateStr);
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const year = date.getFullYear();
                        return `${month}/${day}/${year}`;
                      };
                      
                      return (
                        <tr key={payroll.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                            {formatDateDisplay(payroll.payPeriodStart)} - {formatDateDisplay(payroll.payPeriodEnd)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-600">
                            {formatDateDisplay(payroll.payrollDeadline)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-600">
                            {formatDateDisplay(payroll.payday)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 text-right">
                            {formatCurrency(grandTotal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                            {formatDateDisplay(payroll.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <button
                              onClick={() => downloadHistoricalCSV(payroll.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Download CSV
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 1099 Branch Content Component (Placeholder)
function Branch1099Content() {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">1099 Tutors - Branch</h2>
        <p className="text-neutral-600">
          This section will be built out later for processing 1099 contractor payroll through Branch.
        </p>
      </div>
    </div>
  );
}
