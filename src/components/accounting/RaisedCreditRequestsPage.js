import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../../utils/formatters';
import axios from 'axios';
import {
  Alert,
} from '@mui/material';
import {
  DocumentTextIcon,
  FunnelIcon,
  ArrowUpTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';

function RaisedCreditRequestsPageContent() {
  const [creditRequests, setCreditRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('paid'); // 'all', 'unpaid', 'pending', 'paid', 'void'
  const [sortField, setSortField] = useState('date_sent');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [summary, setSummary] = useState({
    totalCreditRequests: 0,
    grossAmount: 0,
    tutorsAmount: 0,
    affiliateAmount: 0,
    branchTax: 0,
    branchNet: 0,
  });

  useEffect(() => {
    fetchCreditRequests();
    setCurrentPage(1); // Reset to first page when tab or sort changes
  }, [activeTab, sortField, sortOrder]);

  const fetchCreditRequests = async () => {
    try {
      setLoading(true);
      const axiosInstance = axios.create({
        withCredentials: true,
      });

      const params = {};
      
      // Filter by status tab
      if (activeTab === 'unpaid') {
        params.status = 'unpaid';
      } else if (activeTab === 'paid') {
        params.status = 'paid';
      } else if (activeTab === 'pending') {
        params.status = 'pending';
      } else if (activeTab === 'void') {
        params.status = 'void';
      }
      // 'all' - don't send status param

      params.sortBy = sortField;
      params.sortOrder = sortOrder;

      const response = await axiosInstance.get('/api/accounting/credit-requests', { params });
      const allCreditRequests = response.data.credit_requests || [];
      
      // Filter by active tab
      let filtered = allCreditRequests;
      if (activeTab !== 'all') {
        filtered = allCreditRequests.filter(cr => {
          if (activeTab === 'paid') return cr.status === 'paid' || cr.status === 'approved';
          if (activeTab === 'unpaid') return cr.status === 'unpaid' || cr.status === 'raised' || !cr.status;
          if (activeTab === 'pending') return cr.status === 'pending' || cr.status === 'draft';
          if (activeTab === 'void') return cr.status === 'void' || cr.status === 'rejected';
          return true;
        });
      }
      
      setCreditRequests(filtered);
      
      // Calculate summary from all credit requests (not filtered)
      const grossAmount = allCreditRequests.reduce((sum, cr) => sum + (parseFloat(cr.amount) || 0), 0);
      const tutorsAmount = grossAmount * 0.4; // Estimate
      const branchNet = grossAmount - tutorsAmount;
      
      setSummary({
        totalCreditRequests: allCreditRequests.length,
        grossAmount,
        tutorsAmount,
        affiliateAmount: 0,
        branchTax: 0,
        branchNet,
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load credit requests');
    } finally {
      setLoading(false);
    }
  };


  const getStatusBadge = (creditRequest) => {
    if (creditRequest.status === 'paid' || creditRequest.status === 'approved') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Paid</span>;
    }
    if (creditRequest.status === 'void' || creditRequest.status === 'rejected') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-neutral-100 text-neutral-800">Void</span>;
    }
    if (creditRequest.status === 'pending' || creditRequest.status === 'draft') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
    }
    return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Unpaid</span>;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 inline ml-1" />
    );
  };

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'pending', label: 'Pending' },
    { key: 'paid', label: 'Paid' },
    { key: 'void', label: 'Void' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3">
          {/* Header with Actions */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-neutral-900">Credit Requests</h1>
            <div className="flex gap-2">
              <button className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2">
                <FunnelIcon className="h-5 w-5 text-neutral-600" />
                <span className="text-sm font-medium text-neutral-700">Filter</span>
              </button>
              <button className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2">
                <ArrowUpTrayIcon className="h-5 w-5 text-neutral-600" />
                <span className="text-sm font-medium text-neutral-700">Export</span>
              </button>
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex gap-1 mb-6 border-b border-neutral-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Credit Requests Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading credit requests...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            </div>
          ) : creditRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <DocumentTextIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No credit requests found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('display_id')}
                      >
                        ID <SortIcon field="display_id" />
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('status')}
                      >
                        Status <SortIcon field="status" />
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('client')}
                      >
                        Client <SortIcon field="client" />
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('date_sent')}
                      >
                        Date Sent <SortIcon field="date_sent" />
                      </th>
                      <th 
                        className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('amount')}
                      >
                        Gross Amount <SortIcon field="amount" />
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Branch Net
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Still to pay
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {creditRequests
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((cr) => {
                        const stillToPay = (cr.status === 'paid' || cr.status === 'approved') ? 0 : parseFloat(cr.amount) || 0;
                        const branchNet = (parseFloat(cr.amount) || 0) * 0.6; // Estimate
                        const displayId = cr.display_id || `CR-${cr.id}`;
                        return (
                          <tr 
                            key={cr.id} 
                            className="hover:bg-neutral-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Link
                                to={`/accounting/credit-requests/${cr.id}`}
                                className="text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
                              >
                                {displayId}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getStatusBadge(cr)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {cr.client_id ? (
                                <Link
                                  to={`/clients/${cr.client_id}`}
                                  className="text-sm text-neutral-700 hover:text-brand-purple hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cr.client_first_name} {cr.client_last_name}
                                </Link>
                              ) : (
                                <span className="text-sm text-neutral-700">
                                  {cr.client_first_name} {cr.client_last_name}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                              {formatDate(cr.date_sent || cr.date_raised)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-neutral-900">
                              {formatCurrency(cr.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-700">
                              {formatCurrency(branchNet)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-neutral-900">
                              {formatCurrency(stillToPay)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {creditRequests.length > pageSize && (
                <div className="bg-white px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
                  <div className="text-sm text-neutral-700">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * pageSize, creditRequests.length)}</span> of{' '}
                    <span className="font-medium">{creditRequests.length}</span> results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                        currentPage === 1
                          ? 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                          : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <span className="text-sm text-neutral-700">
                      Page <span className="font-medium">{currentPage}</span> of{' '}
                      <span className="font-medium">{Math.ceil(creditRequests.length / pageSize)}</span>
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(creditRequests.length / pageSize), prev + 1))}
                      disabled={currentPage >= Math.ceil(creditRequests.length / pageSize)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                        currentPage >= Math.ceil(creditRequests.length / pageSize)
                          ? 'border-neutral-200 text-neutral-400 cursor-not-allowed'
                          : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <ChevronRightIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Totals Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Totals</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Total Credit Requests:</span>
                <span className="font-semibold text-neutral-900">{summary.totalCreditRequests.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Gross Amount:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.grossAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Tutors Amount:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.tutorsAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Affiliate Amount:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.affiliateAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Branch Tax:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.branchTax)}</span>
              </div>
              <div className="border-t border-neutral-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Branch Net:</span>
                  <span className="font-bold text-lg text-brand-purple">{formatCurrency(summary.branchNet)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RaisedCreditRequestsPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <RaisedCreditRequestsPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
