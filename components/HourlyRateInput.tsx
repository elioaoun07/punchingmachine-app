'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Save, Check, Link2, Unlink } from 'lucide-react';
import { getSettings, saveSettings } from '@/lib/db';

interface HourlyRateInputProps {
  onChange?: () => void;
}

export default function HourlyRateInput({ onChange }: HourlyRateInputProps) {
  const [rate, setRate] = useState<string>('');
  const [currency, setCurrency] = useState('USD');
  const [sheetUrl, setSheetUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings();
        setRate(settings.hourlyRate > 0 ? settings.hourlyRate.toString() : '');
        setCurrency(settings.currency);
        setSheetUrl(settings.googleSheetUrl || '');
      } catch (error) {
        console.error('Error loading settings:', error);
      }
      setLoading(false);
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    const rateNum = parseFloat(rate) || 0;
    await saveSettings(rateNum, currency);
    setSaved(true);
    onChange?.();
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveSheetUrl = async () => {
    const rateNum = parseFloat(rate) || 0;
    await saveSettings(rateNum, currency, sheetUrl.trim());
    setSheetSaved(true);
    onChange?.();
    setTimeout(() => setSheetSaved(false), 2000);
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setRate(value);
    }
  };

  if (loading) {
    return <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {/* Hourly Rate */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
          <DollarSign className="w-4 h-4" />
          Hourly Rate
        </label>
        <div className="flex gap-2">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="USD">USD $</option>
            <option value="EUR">EUR €</option>
            <option value="GBP">GBP £</option>
            <option value="CAD">CAD $</option>
            <option value="AUD">AUD $</option>
            <option value="JPY">JPY ¥</option>
            <option value="ILS">ILS ₪</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={handleRateChange}
            placeholder="0.00"
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-primary text-white hover:bg-blue-600'
            }`}
          >
            {saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          </button>
        </div>
        {rate && parseFloat(rate) > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            Daily (8h): {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(rate) * 8)}
            {' • '}
            Monthly (160h): {new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(parseFloat(rate) * 160)}
          </p>
        )}
      </div>

      {/* Google Sheet Sync */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-1">
          {sheetUrl ? <Link2 className="w-4 h-4 text-green-500" /> : <Unlink className="w-4 h-4 text-gray-400" />}
          Google Sheet Sync
        </label>
        <p className="text-xs text-gray-400 mb-3">
          Paste your Google Apps Script Web App URL to sync data across devices.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            onClick={handleSaveSheetUrl}
            className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${
              sheetSaved
                ? 'bg-green-500 text-white'
                : 'bg-primary text-white hover:bg-blue-600'
            }`}
          >
            {sheetSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          </button>
        </div>
        {sheetUrl && (
          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Sync enabled — entries will be pushed to Google Sheets
          </p>
        )}
      </div>
    </div>
  );
}
