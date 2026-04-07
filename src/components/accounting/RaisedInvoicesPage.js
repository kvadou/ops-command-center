import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  DocumentTextIcon,
  FunnelIcon,
  ArrowUpTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

function RaisedInvoicesPageContent() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('paid'); // 'all', 'unpaid', 'pending', 'paid', 'void'
  const [sortField, setSortField] = useState('date_sent');
  const [sortOrder, setSortOrder] = useState('desc');
  const [summary, setSummary] = useState({
    totalInvoices: 0,
    grossAmount: 0,
    tutorsAmount: 0,
    affiliateAmount: 0,
    branchTax: 0,
    branchNet: 0,
  });

  useEffect(() => {
    fetchInvoices();
  }, [activeTab, sortField, sortOrder]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Filter by status tab
      if (activeTab === 'unpaid') {
        params.set('status', 'unpaid');
      } else if (activeTab === 'paid') {
        params.set('status', 'paid');
      } else if (activeTab === 'pending') {
        params.set('status', 'pending');
      } else if (activeTab === 'void') {
        params.set('status', 'void');
      } else {
        // 'all' - fetch all raised invoices
        params.set('status', 'unpaid,paid,pending');
      }
      
      params.set('sortBy', sortField);
      params.set('sortOrder', sortOrder);

      const response = await fetch(`/api/invoices?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch invoices');

      const data = await response.json();
      const allInvoices = data.invoices || [];
      
      // Filter by active tab
      let filtered = allInvoices;
      if (activeTab !== 'all') {
        filtered = allInvoices.filter(inv => {
          if (activeTab === 'paid') return inv.status === 'paid';
          if (activeTab === 'unpaid') return inv.status === 'unpaid';
          if (activeTab === 'pending') return inv.status === 'pending';
          if (activeTab === 'void') return inv.status === 'void';
          return true;
        });
      }
      
      setInvoices(filtered);
      
      // Calculate summary from all invoices (not filtered)
      const grossAmount = allInvoices.reduce((sum, inv) => sum + (parseFloat(inv.gross) || 0), 0);
      const tutorsAmount = grossAmount * 0.4; // Estimate
      const branchNet = grossAmount - tutorsAmount;
      
      setSummary({
        totalInvoices: allInvoices.length,
        grossAmount,
        tutorsAmount,
        affiliateAmount: 0,
        branchTax: 0,
        branchNet,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const getDaysOutstanding = (dateString) => {
    if (!dateString) return 0;
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (invoice) => {
    if (invoice.status === 'paid') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Paid</span>;
    }
    if (invoice.status === 'void') {
      return <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-neutral-100 text-neutral-800">Void</span>;
    }
    if (invoice.status === 'pending') {
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
            <h1 className="text-2xl font-bold text-neutral-900">Invoices</h1>
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

          {/* Invoices Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading invoices...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="text-red-600">{error}</div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <DocumentTextIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No invoices found</p>
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
                        onClick={() => handleSort('gross')}
                      >
                        Gross Amount <SortIcon field="gross" />
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
                    {invoices.map((invoice) => {
                      const stillToPay = invoice.status === 'paid' ? 0 : parseFloat(invoice.gross) || 0;
                      const branchNet = (parseFloat(invoice.gross) || 0) * 0.6; // Estimate
                      const invoiceNumber = invoice.invoice_number || invoice.display_id || `INV-${invoice.id}`;
                      return (
                        <tr 
                          key={invoice.id} 
                          className="hover:bg-neutral-50"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link
                              to={`/accounting/invoices/${invoice.id}`}
                              className="text-sm font-medium text-brand-purple hover:text-brand-navy hover:underline"
                            >
                              {invoiceNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(invoice)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {invoice.client_id ? (
                              <Link
                                to={`/clients/${invoice.client_id}`}
                                className="text-sm text-neutral-700 hover:text-brand-purple hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {invoice.client_first_name} {invoice.client_last_name}
                              </Link>
                            ) : (
                              <span className="text-sm text-neutral-700">
                                {invoice.client_first_name} {invoice.client_last_name}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {formatDate(invoice.date_sent)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-neutral-900">
                            {formatCurrency(invoice.gross)}
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
            </div>
          )}
        </div>

        {/* Totals Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Totals</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Total Invoices:</span>
                <span className="font-semibold text-neutral-900">{summary.totalInvoices.toLocaleString()}</span>
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

export default function RaisedInvoicesPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <RaisedInvoicesPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}

