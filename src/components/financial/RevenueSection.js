import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function RevenueSection() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('combined');
  const [revenueData, setRevenueData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('monthly'); // daily, weekly, monthly

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      fetchRevenue();
    }
  }, [selectedAccount, timeframe]);

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/financial/stripe/accounts');
      if (response.ok) {
        const accountsData = await response.json();
        setAccounts(accountsData);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const fetchRevenue = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      const startDateStr = startDate.toISOString().split('T')[0];

      const params = new URLSearchParams({
        startDate: startDateStr,
        endDate: endDate,
      });

      if (selectedAccount === 'combined') {
        params.append('combined', 'true');
      } else {
        params.append('accountId', selectedAccount);
      }

      const response = await fetch(`/api/financial/stripe/revenue?${params}`);
      if (response.ok) {
        const data = await response.json();
        setRevenueData(data);
      }
    } catch (error) {
      console.error('Error fetching revenue:', error);
    } finally {
      setLoading(false);
    }
  };


  // Aggregate data by timeframe
  const aggregatedData = React.useMemo(() => {
    if (!revenueData.length) return [];

    const grouped = {};
    revenueData.forEach(item => {
      const date = new Date(item.revenue_date);
      let key;
      
      if (timeframe === 'daily') {
        key = date.toISOString().split('T')[0];
      } else if (timeframe === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!grouped[key]) {
        grouped[key] = { date: key, gross: 0, net: 0, refunds: 0 };
      }
      grouped[key].gross += parseFloat(item.gross_revenue || 0);
      grouped[key].net += parseFloat(item.net_revenue || 0);
      grouped[key].refunds += parseFloat(item.refunds || 0);
    });

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [revenueData, timeframe]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Revenue (Stripe)</h2>
        <div className="flex items-center gap-3">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
          >
            <option value="combined">Combined</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.display_name}
              </option>
            ))}
          </select>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-neutral-500">Loading revenue data...</div>
      ) : (
        <div className="space-y-6">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={aggregatedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="gross" stroke="#3b82f6" name="Gross Revenue" />
              <Line type="monotone" dataKey="net" stroke="#10b981" name="Net Revenue" />
            </LineChart>
          </ResponsiveContainer>

          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={aggregatedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => `$${value / 1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="refunds" fill="#ef4444" name="Refunds" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
