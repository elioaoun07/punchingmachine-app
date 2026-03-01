'use client';

import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, TrendingUp, Calendar, Target, Award } from 'lucide-react';
import { calculateHoursWorked, getSettings } from '@/lib/db';
import { getEntriesByMonth } from '@/lib/sheets';
import { formatHours, formatCurrency, getWorkingDaysInMonth, getWorkingDaysPassed } from '@/lib/utils';
import { MonthlyStats } from '@/lib/types';

interface InsightsProps {
  year: number;
  month: number;
  refreshTrigger?: number;
}

export default function Insights({ year, month, refreshTrigger }: InsightsProps) {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [hourlyRate, setHourlyRate] = useState(0);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const [entries, settings] = await Promise.all([
          getEntriesByMonth(year, month),
          getSettings()
        ]);
        
        setHourlyRate(settings.hourlyRate);

        const totalHours = entries.reduce((sum, entry) => {
          return sum + calculateHoursWorked(entry.arrivalTime, entry.departureTime);
        }, 0);

        const workingDaysInMonth = getWorkingDaysInMonth(year, month);
        const workingDaysPassed = getWorkingDaysPassed(year, month);
        const workingDaysWithEntries = entries.filter(
          (e) => e.arrivalTime && e.departureTime
        ).length;

        const averageHoursPerDay = workingDaysWithEntries > 0 
          ? totalHours / workingDaysWithEntries 
          : 0;

        const remainingWorkingDays = workingDaysInMonth - workingDaysPassed;
        const projectedMonthlyHours = totalHours + (averageHoursPerDay * remainingWorkingDays);
        const projectedMonthlyEarnings = projectedMonthlyHours * settings.hourlyRate;

        setStats({
          totalHours,
          totalEarnings: totalHours * settings.hourlyRate,
          averageHoursPerDay,
          workingDays: workingDaysWithEntries,
          projectedMonthlyEarnings,
          projectedMonthlyHours,
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      }
      setLoading(false);
    };

    loadStats();
  }, [year, month, refreshTrigger]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const cards = [
    {
      label: 'Total Hours',
      value: formatHours(stats.totalHours),
      icon: Clock,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50',
      textColor: 'text-blue-600',
    },
    {
      label: 'Total Earnings',
      value: formatCurrency(stats.totalEarnings),
      icon: DollarSign,
      color: 'bg-green-500',
      lightColor: 'bg-green-50',
      textColor: 'text-green-600',
    },
    {
      label: 'Avg Hours/Day',
      value: formatHours(stats.averageHoursPerDay),
      icon: Target,
      color: 'bg-purple-500',
      lightColor: 'bg-purple-50',
      textColor: 'text-purple-600',
    },
    {
      label: 'Working Days',
      value: `${stats.workingDays} days`,
      icon: Calendar,
      color: 'bg-orange-500',
      lightColor: 'bg-orange-50',
      textColor: 'text-orange-600',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card, index) => (
          <div
            key={index}
            className={`${card.lightColor} rounded-xl p-4 transition-transform hover:scale-[1.02]`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`${card.color} p-1.5 rounded-lg`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs text-gray-500">{card.label}</span>
            </div>
            <p className={`text-xl font-bold ${card.textColor}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Forecast Section */}
      {hourlyRate > 0 && stats.projectedMonthlyHours > 0 && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5" />
            <span className="font-medium">Month-End Forecast</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-indigo-200 text-sm">Projected Hours</p>
              <p className="text-2xl font-bold">{formatHours(stats.projectedMonthlyHours)}</p>
            </div>
            <div>
              <p className="text-indigo-200 text-sm">Projected Earnings</p>
              <p className="text-2xl font-bold">{formatCurrency(stats.projectedMonthlyEarnings)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Achievement Badge */}
      {stats.totalHours >= 160 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <Award className="w-8 h-8 text-yellow-500" />
          <div>
            <p className="font-semibold text-yellow-700">Full-Time Achievement!</p>
            <p className="text-sm text-yellow-600">You&apos;ve worked 160+ hours this month</p>
          </div>
        </div>
      )}
    </div>
  );
}
