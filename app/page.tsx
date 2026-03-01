'use client';

import React, { useState, useEffect } from 'react';
import { Clock, LayoutDashboard, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import TimeEntryForm from '@/components/TimeEntryForm';
import EntryList from '@/components/EntryList';
import HoursChart from '@/components/HoursChart';
import Insights from '@/components/Insights';
import HourlyRateInput from '@/components/HourlyRateInput';
import ExportButton from '@/components/ExportButton';
import { parseUrlParams } from '@/lib/utils';

type Tab = 'punch' | 'dashboard' | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('punch');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [initialAction, setInitialAction] = useState<'arrival' | 'departure' | undefined>();

  // Check URL params for NFC/QR trigger
  useEffect(() => {
    const params = parseUrlParams();
    if (params.action) {
      setInitialAction(params.action);
      setActiveTab('punch');
    }
  }, []);

  // Auto-refresh data when page becomes visible (e.g. switching from /nfc tab)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleEntryUpdated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth((prev) => {
      if (direction === 'prev') {
        if (prev.month === 0) {
          return { year: prev.year - 1, month: 11 };
        }
        return { ...prev, month: prev.month - 1 };
      } else {
        if (prev.month === 11) {
          return { year: prev.year + 1, month: 0 };
        }
        return { ...prev, month: prev.month + 1 };
      }
    });
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const isCurrentMonth = () => {
    const now = new Date();
    return selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth();
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-gray-800">Punch Clock</h1>
                <p className="text-xs text-gray-500">Time Tracker</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {activeTab === 'punch' && (
          <div className="space-y-6">
            <TimeEntryForm 
              onEntryUpdated={handleEntryUpdated} 
              initialAction={initialAction}
            />
            
            <div className="mt-8">
              <h2 className="font-semibold text-gray-700 mb-4">Recent Entries</h2>
              <EntryList refreshTrigger={refreshTrigger} />
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Month Navigator */}
            <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="text-center">
                <h2 className="font-bold text-lg text-gray-800">
                  {monthNames[selectedMonth.month]} {selectedMonth.year}
                </h2>
                {!isCurrentMonth() && (
                  <button
                    onClick={() => {
                      const now = new Date();
                      setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Go to current month
                  </button>
                )}
              </div>
              <button
                onClick={() => navigateMonth('next')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Insights */}
            <Insights
              year={selectedMonth.year}
              month={selectedMonth.month}
              refreshTrigger={refreshTrigger}
            />

            {/* Hours Chart */}
            <HoursChart
              year={selectedMonth.year}
              month={selectedMonth.month}
              refreshTrigger={refreshTrigger}
            />

            {/* Export Button */}
            <ExportButton
              year={selectedMonth.year}
              month={selectedMonth.month}
            />

          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="font-semibold text-gray-700">Settings</h2>
            
            <HourlyRateInput onChange={handleEntryUpdated} />

            {/* NFC/QR Setup Instructions */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-3">📱 NFC / QR Setup</h3>
              <p className="text-sm text-gray-600 mb-4">
                Create NFC tags or QR codes with these URLs for quick punch-in:
              </p>
              <div className="space-y-3">
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-green-700 mb-1">Arrival URL:</p>
                  <code className="text-xs text-green-800 break-all">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/nfc?type=arrival
                  </code>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-red-700 mb-1">Departure URL:</p>
                  <code className="text-xs text-red-800 break-all">
                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/nfc?type=departure
                  </code>
                </div>
              </div>
            </div>

            {/* A2HS Instructions */}
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-700 mb-3">📲 Add to Home Screen</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p><strong>iOS Safari:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Tap the Share button (box with arrow)</li>
                  <li>Scroll down and tap &quot;Add to Home Screen&quot;</li>
                  <li>Tap &quot;Add&quot; to confirm</li>
                </ol>
                <p className="mt-3"><strong>Android Chrome:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Tap the menu (three dots)</li>
                  <li>Tap &quot;Add to Home screen&quot;</li>
                  <li>Tap &quot;Add&quot; to confirm</li>
                </ol>
              </div>
            </div>

            {/* App Info */}
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-sm text-gray-500">Punch Clock v1.0.0</p>
              <p className="text-xs text-gray-400 mt-1">Data synced via Google Sheets</p>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 bottom-nav">
        <div className="max-w-lg mx-auto px-6 py-2">
          <div className="flex justify-around">
            {[
              { id: 'punch' as Tab, icon: Clock, label: 'Punch' },
              { id: 'dashboard' as Tab, icon: LayoutDashboard, label: 'Dashboard' },
              { id: 'settings' as Tab, icon: Settings, label: 'Settings' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center py-2 px-4 rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'text-primary bg-blue-50'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'stroke-[2.5]' : ''}`} />
                <span className="text-xs mt-1 font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
