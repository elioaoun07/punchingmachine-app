'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { rebuildMasterSheet } from '@/lib/sheets';

interface SyncMasterButtonProps {
  year: number;
  month: number;
}

export default function SyncMasterButton({ year, month }: SyncMasterButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const ok = await rebuildMasterSheet(year, month);
      setResult(ok ? 'success' : 'error');
    } catch {
      setResult('error');
    }
    setSyncing(false);
    setTimeout(() => setResult(null), 3000);
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-medium transition-all ${
        syncing
          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
          : result === 'success'
          ? 'bg-green-100 text-green-700 border border-green-300'
          : result === 'error'
          ? 'bg-red-100 text-red-700 border border-red-300'
          : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-md hover:shadow-lg'
      }`}
    >
      {syncing ? (
        <>
          <RefreshCw className="w-5 h-5 animate-spin" />
          Syncing Master Sheet...
        </>
      ) : result === 'success' ? (
        <>
          <CheckCircle className="w-5 h-5" />
          Master Sheet Updated!
        </>
      ) : result === 'error' ? (
        <>
          <AlertCircle className="w-5 h-5" />
          Sync Failed — Try Again
        </>
      ) : (
        <>
          <RefreshCw className="w-5 h-5" />
          Sync Master Sheet — {monthNames[month]}
        </>
      )}
    </button>
  );
}
