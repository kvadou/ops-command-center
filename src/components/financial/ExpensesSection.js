import React, { useState, useEffect } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function ExpensesSection() {
  const [monthlyData, setMonthlyData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOutliersOnly, setShowOutliersOnly] = useState(false);

  useEffect(() => {
    fetchData();
  }, [showOutliersOnly]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Fetch monthly aggregates
      const monthlyResponse = await fetch(
        `/api/financial/ramp/monthly-aggregates?startDate=${startDateStr}&endDate=${endDate}`
      );
      if (monthlyResponse.ok) {
        const monthly = await monthlyResponse.json();
        setMonthlyData(monthly);
      }

      // Fetch transactions for category breakdown
      const transactionsResponse = await fetch(
        `/api/financial/ramp/transactions?startDate=${startDateStr}&endDate=${endDate}`
      );
      if (transactionsResponse.ok) {
        const transactions = await transactionsResponse.json();
        
        // Aggregate by category
        const categoryMap = {};
        transactions.forEach(t => {
          const cat = t.category || 'Uncategorized';
          categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(t.amount || 0);
        });
        setCategoryData(Object.entries(categoryMap).map(([name, value]) => ({ name, value })));

        // Aggregate by vendor
        const vendorMap = {};
        transactions.forEach(t => {
          const vendor = t.merchant_name || 'Unknown';
          vendorMap[vendor] = (vendorMap[vendor] || 0) + parseFloat(t.amount || 0);
        });
        setVendors(Object.entries(vendorMap).map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 20));
      }

      // Fetch reimbursements
      const reimbResponse = await fetch(
        `/api/financial/ramp/reimbursements?outlierOnly=${showOutliersOnly}`
      );
      if (reimbResponse.ok) {
        const reimbs = await reimbResponse.json();
        setReimbursements(reimbs.slice(0, 100));
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const vendorColumns = [
    { field: 'name', headerName: 'Vendor', width: 200 },
    {
      field: 'value',
      headerName: 'Amount',
      width: 150,
      valueFormatter: (params) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(params.value),
    },
  ];

  const reimbursementColumns = [
    { field: 'employee_name', headerName: 'Employee', width: 150 },
    {
      field: 'amount',
      headerName: 'Amount',
      width: 120,
      valueFormatter: (params) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(params.value),
    },
    { field: 'category', headerName: 'Category', width: 150 },
    { field: 'receipt_date', headerName: 'Date', width: 120 },
    {
      field: 'is_outlier',
      headerName: 'Outlier',
      width: 100,
      renderCell: (params) => (
        params.value ? (
          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Yes</span>
        ) : null
      ),
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <h2 className="text-xl font-semibold text-neutral-900 mb-6">Expenses (Ramp)</h2>

      {loading ? (
        <div className="text-neutral-500">Loading expense data...</div>
      ) : (
        <div className="space-y-6">
          {/* Monthly Spend Trend */}
          <div>
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Monthly Spend Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_spend" fill="#3b82f6" name="Total Spend" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Spend by Category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-neutral-900 mb-4">Spend by Category</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData.slice(0, 10)}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {categoryData.slice(0, 10).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-900 mb-4">Top Vendors</h3>
              <div style={{ height: 300, width: '100%' }}>
                <DataGrid
                  rows={vendors.map((v, i) => ({ id: i, ...v }))}
                  columns={vendorColumns}
                  pageSize={10}
                  disableSelectionOnClick
                />
              </div>
            </div>
          </div>

          {/* Reimbursements */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-neutral-900">Reimbursements</h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showOutliersOnly}
                  onChange={(e) => setShowOutliersOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-neutral-600">Show outliers only</span>
              </label>
            </div>
            <div style={{ height: 400, width: '100%' }}>
              <DataGrid
                rows={reimbursements.map((r, i) => ({ id: i, ...r }))}
                columns={reimbursementColumns}
                pageSize={10}
                disableSelectionOnClick
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
