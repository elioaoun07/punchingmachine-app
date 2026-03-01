'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, ChevronUp, ChevronDown, Check, RefreshCw } from 'lucide-react';
import { TimeEntry } from '@/lib/types';
import { generateId } from '@/lib/db';
import { upsertEntry, getEntryByDate } from '@/lib/sheets';
import { roundToNearest, getCurrentDate, getCurrentTime, formatDate } from '@/lib/utils';

interface TimeEntryFormProps {
  onEntryUpdated?: () => void;
  initialAction?: 'arrival' | 'departure';
}

export default function TimeEntryForm({ onEntryUpdated, initialAction }: TimeEntryFormProps) {
  const [currentEntry, setCurrentEntry] = useState<TimeEntry | null>(null);
  const [selectedDate, setSelectedDate] = useState(getCurrentDate());
  const [arrivalTime, setArrivalTime] = useState(getCurrentTime());
  const [departureTime, setDepartureTime] = useState(getCurrentTime());
  const [activeField, setActiveField] = useState<'arrival' | 'departure'>(initialAction || 'arrival');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadEntry = useCallback(async () => {
    setLoading(true);
    try {
      const entry = await getEntryByDate(selectedDate);
      setCurrentEntry(entry ?? null);
      if (entry) {
        if (entry.arrivalTime) setArrivalTime(entry.arrivalTime);
        if (entry.departureTime) setDepartureTime(entry.departureTime);
      } else {
        // Reset to current time for new entries
        const now = getCurrentTime();
        setArrivalTime(now);
        setDepartureTime(now);
      }
    } catch (error) {
      console.error('Error loading entry:', error);
    }
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (currentEntry) {
        const updated: TimeEntry = {
          ...currentEntry,
          arrivalTime: activeField === 'arrival' || currentEntry.arrivalTime ? 
            (activeField === 'arrival' ? arrivalTime : currentEntry.arrivalTime) : null,
          departureTime: activeField === 'departure' || currentEntry.departureTime ?
            (activeField === 'departure' ? departureTime : currentEntry.departureTime) : null,
          updatedAt: Date.now(),
        };
        await upsertEntry(updated);
        setCurrentEntry(updated);
      } else {
        const now = Date.now();
        const newEntry: TimeEntry = {
          id: generateId(),
          date: selectedDate,
          arrivalTime: activeField === 'arrival' ? arrivalTime : null,
          departureTime: activeField === 'departure' ? departureTime : null,
          createdAt: now,
          updatedAt: now,
        };
        await upsertEntry(newEntry);
        setCurrentEntry(newEntry);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onEntryUpdated?.();
    } catch (error) {
      console.error('Error saving:', error);
    }
    setSaving(false);
  };

  const handleSaveBoth = async () => {
    setSaving(true);
    try {
      if (currentEntry) {
        const updated: TimeEntry = { ...currentEntry, arrivalTime, departureTime, updatedAt: Date.now() };
        await upsertEntry(updated);
        setCurrentEntry(updated);
      } else {
        const now = Date.now();
        const newEntry: TimeEntry = {
          id: generateId(),
          date: selectedDate,
          arrivalTime,
          departureTime,
          createdAt: now,
          updatedAt: now,
        };
        await upsertEntry(newEntry);
        setCurrentEntry(newEntry);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onEntryUpdated?.();
    } catch (error) {
      console.error('Error saving:', error);
    }
    setSaving(false);
  };

  const currentTime = activeField === 'arrival' ? arrivalTime : departureTime;
  const setCurrentTime = activeField === 'arrival' ? setArrivalTime : setDepartureTime;

  const handleRound = (minutes: number, direction: 'up' | 'down') => {
    const rounded = roundToNearest(currentTime, minutes, direction);
    setCurrentTime(rounded);
  };

  const handleSetNow = () => {
    setCurrentTime(getCurrentTime());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md mx-auto">
      {/* Date Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-2">Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full p-3 text-lg border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <p className="text-sm text-gray-500 mt-1">{formatDate(selectedDate)}</p>
      </div>

      {/* Toggle Arrival/Departure */}
      <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveField('arrival')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            activeField === 'arrival'
              ? 'bg-green-500 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          🟢 Arrival
        </button>
        <button
          onClick={() => setActiveField('departure')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            activeField === 'departure'
              ? 'bg-red-500 text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          🔴 Departure
        </button>
      </div>

      {/* Time Display */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Clock className="w-6 h-6 text-gray-400" />
          <span className="text-sm text-gray-500">
            {activeField === 'arrival' ? 'Arrival Time' : 'Departure Time'}
          </span>
        </div>
        <input
          type="time"
          value={currentTime}
          onChange={(e) => setCurrentTime(e.target.value)}
          className="text-5xl font-bold text-center w-full bg-transparent border-none focus:outline-none"
        />
        <button
          onClick={handleSetNow}
          className="mt-2 text-primary hover:underline text-sm font-medium"
        >
          Set to Now
        </button>
      </div>

      {/* Quick Round Buttons */}
      <div className="mb-6">
        <p className="text-sm text-gray-500 text-center mb-3">Quick Round</p>
        <div className="grid grid-cols-3 gap-2">
          {[5, 10, 15].map((mins) => (
            <div key={mins} className="flex flex-col gap-1">
              <button
                onClick={() => handleRound(mins, 'up')}
                className="flex items-center justify-center gap-1 py-2 px-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                <ChevronUp className="w-4 h-4" />
                +{mins}m
              </button>
              <button
                onClick={() => handleRound(mins, 'down')}
                className="flex items-center justify-center gap-1 py-2 px-3 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                <ChevronDown className="w-4 h-4" />
                -{mins}m
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Current Entry Status */}
      {currentEntry && (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-500 mb-2">Today&apos;s Record</p>
          <div className="flex justify-between">
            <div>
              <span className="text-xs text-gray-400">Arrival</span>
              <p className="font-semibold text-green-600">{currentEntry.arrivalTime || '--:--'}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">Departure</span>
              <p className="font-semibold text-red-600">{currentEntry.departureTime || '--:--'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Save Buttons */}
      <div className="space-y-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-4 rounded-xl font-semibold text-white transition-all ${
            saved
              ? 'bg-green-500'
              : saving
              ? 'bg-gray-400'
              : activeField === 'arrival'
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-red-500 hover:bg-red-600'
          } ${saving ? 'cursor-not-allowed' : ''}`}
        >
          {saved ? (
            <span className="flex items-center justify-center gap-2">
              <Check className="w-5 h-5" /> Saved!
            </span>
          ) : saving ? (
            'Saving...'
          ) : (
            `Save ${activeField === 'arrival' ? 'Arrival' : 'Departure'}`
          )}
        </button>
        
        <button
          onClick={handleSaveBoth}
          disabled={saving}
          className="w-full py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
        >
          Save Both Times
        </button>
      </div>
    </div>
  );
}
