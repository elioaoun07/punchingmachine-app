'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Clock, ArrowRight } from 'lucide-react';
import { TimeEntry } from '@/lib/types';
import { calculateHoursWorked, getSettings } from '@/lib/db';
import { getAllEntries, deleteSheetEntry } from '@/lib/sheets';
import { formatDate, formatHours, formatCurrency } from '@/lib/utils';

interface EntryListProps {
  refreshTrigger?: number;
  onEdit?: (entry: TimeEntry) => void;
}

export default function EntryList({ refreshTrigger, onEdit }: EntryListProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const [data, settings] = await Promise.all([getAllEntries(), getSettings()]);
      setEntries(data);
      setHourlyRate(settings.hourlyRate);
    } catch (error) {
      console.error('Error loading entries:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadEntries();
  }, [refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (confirm('Delete this entry?')) {
      const entry = entries.find(e => e.id === id);
      if (entry) {
        await deleteSheetEntry(id, entry.date);
      }
      loadEntries();
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No entries yet</p>
        <p className="text-sm">Start tracking your time!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const hours = calculateHoursWorked(entry.arrivalTime, entry.departureTime);
        const earnings = hours * hourlyRate;

        return (
          <div
            key={entry.id}
            className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-gray-800">{formatDate(entry.date)}</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                  <span className="text-green-600 font-medium">
                    {entry.arrivalTime || '--:--'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                  <span className="text-red-600 font-medium">
                    {entry.departureTime || '--:--'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {onEdit && (
                  <button
                    onClick={() => onEdit(entry)}
                    className="p-2 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Edit entry"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-500">
                {hours > 0 ? formatHours(hours) : 'Incomplete'}
              </span>
              {hours > 0 && hourlyRate > 0 && (
                <span className="text-sm font-medium text-green-600">
                  {formatCurrency(earnings)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
