import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { formatCurrency, formatDate } from '../../utils/formatters';
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

function RaisedPaymentOrdersPageContent() {
  const [paymentOrders, setPaymentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('paid'); // 'all', 'unpaid', 'in_pay_run', 'paid', 'void'
  const [sortField, setSortField] = useState('date_sent');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const [summary, setSummary] = useState({
    totalPaymentOrders: 0,
    amount: 0,
    tutorTax: 0,
  });

  useEffect(() => {
    fetchPaymentOrders();
    setCurrentPage(1); // Reset to first page when tab or sort changes
  }, [activeTab, sortField, sortOrder]);

  const fetchPaymentOrders = async () => {
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
      } else if (activeTab === 'in_pay_run') {
        params.status = 'in_pay_run';
      } else if (activeTab === 'void') {
        params.status = 'void';
      }
      // 'all' - don't send status param

      params.sortBy = sortField;
      params.sortOrder = sortOrder;

      const response = await axiosInstance.get('/api/accounting/payment-orders', { params });
      const allPaymentOrders = response.data.payment_orders || [];
      
      // Filter by active tab
      let filtered = allPaymentOrders;
      if (activeTab !== 'all') {
        filtered = allPaymentOrders.filter(po => {
          if (activeTab === 'paid') return po.status === 'paid';
          if (activeTab === 'unpaid') return po.status === 'unpaid' || po.status === 'sent' || !po.status;
          if (activeTab === 'in_pay_run') return po.status === 'in_pay_run';
          if (activeTab === 'void') return po.status === 'void';
          return true;
        });
      }
      
      setPaymentOrders(filtered);
      
      // Calculate summary from all payment orders (not filtered)
      const amount = allPaymentOrders.reduce((sum, po) => sum + (parseFloat(po.amount) || 0), 0);
      
      setSummary({
        totalPaymentOrders: allPaymentOrders.length,
        amount,
        tutorTax: 0, // Calculate if needed
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load payment orders');
    } finally {
      setLoading(false);
    }
  };


  const getStatusBadge = (paymentOrder) => {
    if (paymentOrder.status === 'paid') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Paid</span>;
    }
    if (paymentOrder.status === 'void') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-neutral-100 text-neutral-800">Void</span>;
    }
    if (paymentOrder.status === 'in_pay_run') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">In Pay Run</span>;
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
    { key: 'in_pay_run', label: 'In Pay Run' },
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
            <h1 className="text-2xl font-bold text-neutral-900">Payment Orders</h1>
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

          {/* Payment Orders Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading payment orders...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            </div>
          ) : paymentOrders.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <DocumentTextIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No payment orders found</p>
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
                        onClick={() => handleSort('payee')}
                      >
                        Payee <SortIcon field="payee" />
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
                        Total Amount <SortIcon field="amount" />
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Tax Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {paymentOrders
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map((order) => {
                        const displayId = order.display_id || `PO-${order.id}`;
                        return (
                          <tr 
                            key={order.id} 
                            className="hover:bg-neutral-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Link
                                to={`/accounting/payment-orders/${order.id}`}
                                className="text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
                              >
                                {displayId}
                              </Link>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {getStatusBadge(order)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {order.payee_id ? (
                                <Link
                                  to={`/tutors/${order.payee_id}`}
                                  className="text-sm text-neutral-700 hover:text-brand-purple hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.payee_first} {order.payee_last}
                                </Link>
                              ) : (
                                <span className="text-sm text-neutral-700">
                                  {order.payee_first} {order.payee_last}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                              {formatDate(order.date_sent)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-neutral-900">
                              {formatCurrency(order.amount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-700">
                              {formatCurrency(order.tax_amount || 0)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {paymentOrders.length > pageSize && (
                <div className="bg-white px-6 py-4 border-t border-neutral-200 flex items-center justify-between">
                  <div className="text-sm text-neutral-700">
                    Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * pageSize, paymentOrders.length)}</span> of{' '}
                    <span className="font-medium">{paymentOrders.length}</span> results
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
                      <span className="font-medium">{Math.ceil(paymentOrders.length / pageSize)}</span>
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(Math.ceil(paymentOrders.length / pageSize), prev + 1))}
                      disabled={currentPage >= Math.ceil(paymentOrders.length / pageSize)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border ${
                        currentPage >= Math.ceil(paymentOrders.length / pageSize)
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
                <span className="text-neutral-600">Total Payment Orders:</span>
                <span className="font-semibold text-neutral-900">{summary.totalPaymentOrders.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Tutor Tax:</span>
                <span className="font-semibold text-neutral-900">{formatCurrency(summary.tutorTax)}</span>
              </div>
              <div className="border-t border-neutral-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Amount:</span>
                  <span className="font-bold text-lg text-brand-purple">{formatCurrency(summary.amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RaisedPaymentOrdersPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <RaisedPaymentOrdersPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
