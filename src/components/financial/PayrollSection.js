import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../utils/formatters';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function PayrollSection() {
  const [payrollData, setPayrollData] = useState([]);
  const [revenueData, setRevenueData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState('combined');

  useEffect(() => {
    fetchData();
  }, [selectedAccount]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 12);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Fetch payroll
      const payrollResponse = await fetch(
        `/api/financial/payroll/monthly?startDate=${startDateStr}&endDate=${endDate}`
      );
      if (payrollResponse.ok) {
        const payroll = await payrollResponse.json();
        
        // Aggregate by month across providers
        const monthlyMap = {};
        payroll.forEach(p => {
          const month = p.month;
          if (!monthlyMap[month]) {
            monthlyMap[month] = {
              month,
              gross_wages: 0,
              employer_taxes: 0,
              benefits: 0,
              total: 0,
            };
          }
          monthlyMap[month].gross_wages += parseFloat(p.total_gross_wages || 0);
          monthlyMap[month].employer_taxes += parseFloat(p.total_employer_taxes || 0);
          monthlyMap[month].benefits += parseFloat(p.total_benefits || 0);
          monthlyMap[month].total += parseFloat(p.total_payroll_cost || 0);
        });
        setPayrollData(Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)));
      }

      // Fetch revenue for percentage calculation
      const params = new URLSearchParams({
        startDate: startDateStr,
        endDate: endDate,
      });
      if (selectedAccount === 'combined') {
        params.append('combined', 'true');
      } else {
        params.append('accountId', selectedAccount);
      }

      const revenueResponse = await fetch(`/api/financial/stripe/revenue?${params}`);
      if (revenueResponse.ok) {
        const revenue = await revenueResponse.json();
        setRevenueData(revenue);
      }
    } catch (error) {
      console.error('Error fetching payroll:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate payroll as % of revenue
  const payrollPercentages = React.useMemo(() => {
    const monthlyRevenue = {};
    revenueData.forEach(r => {
      const month = new Date(r.revenue_date).toISOString().slice(0, 7);
      monthlyRevenue[month] = (monthlyRevenue[month] || 0) + parseFloat(r.net_revenue || 0);
    });

    return payrollData.map(p => {
      const month = p.month.slice(0, 7);
      const revenue = monthlyRevenue[month] || 0;
      const percentage = revenue > 0 ? (p.total / revenue) * 100 : 0;
      return { ...p, revenue, percentage };
    });
  }, [payrollData, revenueData]);

  // Calculate MoM growth
  const momGrowth = React.useMemo(() => {
    if (payrollPercentages.length < 2) return null;
    const current = payrollPercentages[payrollPercentages.length - 1];
    const previous = payrollPercentages[payrollPercentages.length - 2];
    if (previous.total === 0) return null;
    return ((current.total - previous.total) / previous.total) * 100;
  }, [payrollPercentages]);


  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Payroll</h2>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
        >
          <option value="combined">Combined</option>
          {/* Account options */}
        </select>
      </div>

      {loading ? (
        <div className="text-neutral-500">Loading payroll data...</div>
      ) : (
        <div className="space-y-6">
          {/* Monthly Payroll Stacked Chart */}
          <div>
            <h3 className="text-lg font-medium text-neutral-900 mb-4">Monthly Payroll Breakdown</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={payrollData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${value / 1000}k`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey="gross_wages" stackId="a" fill="#3b82f6" name="Gross Wages" />
                <Bar dataKey="employer_taxes" stackId="a" fill="#f59e0b" name="Employer Taxes" />
                <Bar dataKey="benefits" stackId="a" fill="#10b981" name="Benefits" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Payroll Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-neutral-600">Payroll as % of Revenue</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {payrollPercentages.length > 0
                  ? `${payrollPercentages[payrollPercentages.length - 1].percentage.toFixed(1)}%`
                  : 'N/A'}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-neutral-600">MoM Payroll Growth</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {momGrowth !== null ? `${momGrowth >= 0 ? '+' : ''}${momGrowth.toFixed(1)}%` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
