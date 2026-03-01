'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calculateHoursWorked, getSettings } from '@/lib/db';
import { getEntriesByMonth } from '@/lib/sheets';
import { formatDateShort, formatHours, formatCurrency } from '@/lib/utils';

interface HoursChartProps {
  year: number;
  month: number;
  refreshTrigger?: number;
}

export default function HoursChart({ year, month, refreshTrigger }: HoursChartProps) {
  const [data, setData] = useState<{ date: string; hours: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [hourlyRate, setHourlyRate] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [entries, settings] = await Promise.all([
          getEntriesByMonth(year, month),
          getSettings()
        ]);
        
        const chartData = entries.map((entry) => ({
          date: entry.date,
          hours: calculateHoursWorked(entry.arrivalTime, entry.departureTime),
          label: formatDateShort(entry.date),
        }));
        
        setData(chartData);
        setHourlyRate(settings.hourlyRate);
      } catch (error) {
        console.error('Error loading chart data:', error);
      }
      setLoading(false);
    };

    loadData();
  }, [year, month, refreshTrigger]);

  if (loading) {
    return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-xl">
        No data for this month
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const hours = payload[0].value;
      const earnings = hours * hourlyRate;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-100">
          <p className="font-medium">{payload[0].payload.label}</p>
          <p className="text-primary font-bold">{formatHours(hours)}</p>
          {hourlyRate > 0 && (
            <p className="text-green-600 text-sm">{formatCurrency(earnings)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <h3 className="font-semibold text-gray-700 mb-4">Hours per Day</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="label" 
              tick={{ fontSize: 10 }} 
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis 
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}h`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.hours >= 8 ? '#22c55e' : entry.hours >= 6 ? '#3b82f6' : '#f59e0b'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
