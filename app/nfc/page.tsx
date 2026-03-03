'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, RotateCcw, Pencil, Clock, LogIn, LogOut, AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCurrentDate, getCurrentTime, formatDate, formatHours } from '@/lib/utils';
import { getCachedEntry, cacheEntry, generateId, calculateHoursWorked, getSettings } from '@/lib/db';
import { upsertEntry, getEntryByDate as getSheetEntry } from '@/lib/sheets';
import { TimeEntry } from '@/lib/types';

type PunchType = 'arrival' | 'departure';

interface SavedSummary {
  date: string;
  time: string;
  type: PunchType;
  note: string;
  hoursWorked: number | null;
}

// Smart round then add: first click rounds to nearest boundary, subsequent clicks add/subtract
function smartRound(time: string, interval: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m;
  const abs = Math.abs(interval);

  let result: number;
  if (total % abs === 0) {
    // Already on a clean boundary → just add/subtract
    result = total + interval;
  } else {
    // Not on boundary → round to nearest boundary in the direction
    if (interval > 0) {
      result = Math.ceil(total / abs) * abs;   // round up
    } else {
      result = Math.floor(total / abs) * abs;  // round down
    }
  }

  if (result < 0) result = 0;
  if (result >= 24 * 60) result = 24 * 60 - 1;
  const newH = Math.floor(result / 60);
  const newM = result % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// Format HH:MM to 12h AM/PM
function formatTimeAmPm(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function NFCPage() {
  // ── State ──
  const [currentDate, setCurrentDate] = useState(getCurrentDate());
  const [time, setTime] = useState(getCurrentTime());
  const [punchType, setPunchType] = useState<PunchType>('arrival');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false); // editing from success screen
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [existingEntry, setExistingEntry] = useState<TimeEntry | null>(null);
  const [detected, setDetected] = useState(false); // has smart detection run?
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const addDebug = useCallback((msg: string) => {
    setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // ── Smart detection: arrival vs departure ──
  useEffect(() => {
    setDetected(false);
    setExistingEntry(null);
    setSaved(null);

    async function detect() {
      // Check URL param override first: /nfc?type=arrival or /nfc?type=departure
      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get('type') as PunchType | null;

      const entry = await getCachedEntry(currentDate);
      setExistingEntry(entry ?? null);

      // Background: fetch latest from Google Sheets
      getSheetEntry(currentDate).then(sheetEntry => {
        if (sheetEntry) {
          setExistingEntry(sheetEntry);
          cacheEntry(sheetEntry);
          // Re-detect punch type based on fresh data
          if (!typeParam) {
            if (sheetEntry.arrivalTime && !sheetEntry.departureTime) {
              setPunchType('departure');
            } else if (sheetEntry.arrivalTime && sheetEntry.departureTime) {
              setPunchType('arrival');
            }
          }
        }
      }).catch(() => {});

      if (typeParam === 'arrival' || typeParam === 'departure') {
        setPunchType(typeParam);
      } else if (entry) {
        // Smart: if arrival exists but no departure → departure
        if (entry.arrivalTime && !entry.departureTime) {
          setPunchType('departure');
        } else if (entry.arrivalTime && entry.departureTime) {
          // Both exist — likely a correction, default to arrival
          setPunchType('arrival');
        } else {
          // No arrival yet → arrival
          setPunchType('arrival');
        }
      } else {
        // No entry today → time-based fallback
        const hour = new Date().getHours();
        setPunchType(hour < 12 ? 'arrival' : 'departure');
      }

      setDetected(true);
    }
    detect();
  }, [currentDate]);

  // ── Smart round + offset ──
  const applyOffset = useCallback((minutes: number) => {
    setTime(prev => smartRound(prev, minutes));
  }, []);

  // ── Reset to now ──
  const resetToNow = useCallback(() => {
    setTime(getCurrentTime());
  }, []);

  // ── Actually perform the save ──
  const doSave = useCallback(async () => {
    setSaving(true);
    setDebugLogs([]);

    try {
      // Step 1: Check settings
      const settings = await getSettings();
      const sheetUrl = settings.googleSheetUrl?.trim();
      addDebug(`Settings loaded. Sheet URL: ${sheetUrl ? sheetUrl.substring(0, 60) + '...' : '(EMPTY - NOT CONFIGURED)'}`);

      if (!sheetUrl) {
        addDebug('ERROR: No Google Sheet URL configured! Go to main page Settings to set it.');
        setSaving(false);
        return;
      }

      const noteValue = note.trim() || undefined;
      const now = Date.now();

      // Build the entry to save
      let entry: TimeEntry;
      if (existingEntry) {
        entry = { ...existingEntry, updatedAt: now };
        if (punchType === 'arrival') {
          entry.arrivalTime = time;
          if (noteValue) entry.arrivalNote = noteValue;
        } else {
          entry.departureTime = time;
          if (noteValue) entry.departureNote = noteValue;
        }
      } else {
        entry = {
          id: generateId(),
          date: currentDate,
          arrivalTime: punchType === 'arrival' ? time : null,
          departureTime: punchType === 'departure' ? time : null,
          ...(punchType === 'arrival' && noteValue ? { arrivalNote: noteValue } : {}),
          ...(punchType === 'departure' && noteValue ? { departureNote: noteValue } : {}),
          createdAt: now,
          updatedAt: now,
        };
      }

      addDebug(`Entry built: ${JSON.stringify({ date: entry.date, arrival: entry.arrivalTime, departure: entry.departureTime, id: entry.id })}`);

      // Step 2: Call the API proxy directly for debug visibility
      const postBody = {
        url: sheetUrl,
        action: 'upsert',
        date: entry.date,
        arrivalTime: entry.arrivalTime || '',
        departureTime: entry.departureTime || '',
        arrivalNote: entry.arrivalNote || '',
        departureNote: entry.departureNote || '',
        id: entry.id,
        updatedAt: entry.updatedAt || Date.now(),
      };
      addDebug(`POST /api/sheets with: ${JSON.stringify(postBody).substring(0, 200)}`);

      const response = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postBody),
      });

      addDebug(`Response status: ${response.status} ${response.statusText}`);
      const responseText = await response.text();
      addDebug(`Response body: ${responseText.substring(0, 500)}`);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        addDebug('ERROR: Could not parse response as JSON');
        data = {};
      }

      if (data.error) {
        addDebug(`SERVER ERROR: ${data.error} — ${data.message || ''}`);
        if (data.redirectChain) addDebug(`Redirect chain: ${JSON.stringify(data.redirectChain)}`);
      }

      if (data.entry) {
        entry = {
          id: data.entry.id || entry.id,
          date: String(data.entry.date),
          arrivalTime: data.entry.arrivalTime || null,
          departureTime: data.entry.departureTime || null,
          arrivalNote: data.entry.arrivalNote || undefined,
          departureNote: data.entry.departureNote || undefined,
          createdAt: data.entry.updatedAt || Date.now(),
          updatedAt: data.entry.updatedAt || Date.now(),
        };
        addDebug(`SUCCESS: entry saved — ${JSON.stringify(data.entry)}`);
      } else if (data.status === 'ok') {
        addDebug(`Probably OK (non-JSON GAS response). raw: ${data.raw || 'none'}`);
      } else {
        addDebug(`Unexpected response shape: ${JSON.stringify(data).substring(0, 300)}`);
      }

      // Cache locally for fast NFC access
      await cacheEntry(entry);

      let hoursWorked: number | null = null;
      if (entry.arrivalTime && entry.departureTime) {
        hoursWorked = calculateHoursWorked(entry.arrivalTime, entry.departureTime);
      }

      setExistingEntry(entry);

      setSaved({
        date: currentDate,
        time,
        type: punchType,
        note: note.trim(),
        hoursWorked,
      });
      setEditing(false);
    } catch (err: any) {
      addDebug(`EXCEPTION: ${err.message || err}`);
      console.error('Failed to save punch:', err);
    } finally {
      setSaving(false);
    }
  }, [existingEntry, punchType, time, note, currentDate, addDebug]);

  // ── Punch with overwrite check ──
  const handlePunch = useCallback(async () => {
    if (existingEntry) {
      if (punchType === 'arrival' && existingEntry.arrivalTime) {
        setConfirmDialog({
          message: `Arrival is already logged at ${formatTimeAmPm(existingEntry.arrivalTime)}. Overwrite with ${formatTimeAmPm(time)}?`,
          onConfirm: () => {
            setConfirmDialog(null);
            doSave();
          },
        });
        return;
      }
      if (punchType === 'departure' && existingEntry.departureTime) {
        setConfirmDialog({
          message: `Departure is already logged at ${formatTimeAmPm(existingEntry.departureTime)}. Overwrite with ${formatTimeAmPm(time)}?`,
          onConfirm: () => {
            setConfirmDialog(null);
            doSave();
          },
        });
        return;
      }
    }
    doSave();
  }, [existingEntry, punchType, time, doSave]);

  // ── Edit from success screen ──
  const handleEdit = useCallback(() => {
    if (saved) {
      setTime(saved.time);
      setPunchType(saved.type);
      setNote(saved.note);
    }
    setEditing(true);
    setSaved(null);
  }, [saved]);

  // ── Punch Again (reset) ──
  const handlePunchAgain = useCallback(() => {
    setSaved(null);
    setNote('');
    setEditing(false);
    setTime(getCurrentTime());
    // Re-run detection
    (async () => {
      const cached = await getCachedEntry(currentDate);
      setExistingEntry(cached ?? null);
      if (cached) {
        if (cached.arrivalTime && !cached.departureTime) {
          setPunchType('departure');
        } else {
          setPunchType('arrival');
        }
      }
      // Also refresh from sheet
      getSheetEntry(currentDate).then(se => {
        if (se) { setExistingEntry(se); cacheEntry(se); }
      }).catch(() => {});
    })();
  }, [currentDate]);

  // ── Don't render until detection is done ──
  if (!detected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Clock className="w-8 h-8 text-slate-400 animate-pulse" />
      </div>
    );
  }

  // ── Success Screen ──
  if (saved) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
        {/* Checkmark */}
        <div className="animate-punch-success">
          <CheckCircle className="w-20 h-20 text-emerald-500 mb-6" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-slate-800 mb-1">
          {saved.type === 'arrival' ? 'Arrival' : 'Departure'} Recorded
        </h1>

        <p className="text-slate-500 text-sm mb-8">Successfully saved</p>

        {/* Summary Card */}
        <div className="w-full max-w-xs bg-slate-50 rounded-2xl p-6 space-y-4 mb-8">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">Date</span>
            <span className="text-slate-800 font-medium text-sm">{formatDate(saved.date)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">Time</span>
            <span className="text-slate-800 font-mono font-semibold text-lg">{formatTimeAmPm(saved.time)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">Type</span>
            <span className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
              saved.type === 'arrival'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {saved.type === 'arrival' ? 'Arrival' : 'Departure'}
            </span>
          </div>
          {saved.note && (
            <div className="flex justify-between items-start">
              <span className="text-slate-500 text-sm">Note</span>
              <span className="text-slate-700 text-sm text-right max-w-[60%]">{saved.note}</span>
            </div>
          )}
          {saved.hoursWorked !== null && saved.hoursWorked > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-500 text-sm">Hours Today</span>
              <span className="text-emerald-600 font-semibold">{formatHours(saved.hoursWorked)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-6">
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 text-blue-500 hover:text-blue-700 transition-colors text-sm font-medium"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={handlePunchAgain}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Punch again
          </button>
        </div>
      </div>
    );
  }

  // ── Main Punch Form ──
  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Punch Clock</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() - 1);
              setCurrentDate(d.toISOString().split('T')[0]);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'date';
              input.value = currentDate;
              input.onchange = (e) => setCurrentDate((e.target as HTMLInputElement).value);
              input.showPicker?.();
              input.click();
            }}
            className="flex items-center gap-1.5 text-slate-700 font-medium text-base hover:text-blue-600 transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
            {formatDate(currentDate)}
          </button>
          <button
            onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() + 1);
              const next = d.toISOString().split('T')[0];
              if (next <= getCurrentDate()) setCurrentDate(next);
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              currentDate >= getCurrentDate()
                ? 'text-slate-200 cursor-not-allowed'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
            disabled={currentDate >= getCurrentDate()}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {currentDate !== getCurrentDate() && (
          <button
            onClick={() => setCurrentDate(getCurrentDate())}
            className="mt-1 text-xs text-blue-500 hover:text-blue-700 transition-colors"
          >
            Back to today
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 max-w-sm mx-auto w-full">

        {/* ── Time Display ── */}
        <div className="text-center w-full">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full text-center text-6xl font-light text-slate-800 bg-transparent border-none outline-none appearance-none
                       [font-variant-numeric:tabular-nums]
                       [&::-webkit-calendar-picker-indicator]:hidden
                       [&::-webkit-datetime-edit-hour-field]:p-0
                       [&::-webkit-datetime-edit-minute-field]:p-0
                       [&::-webkit-datetime-edit-text]:text-slate-300"
            style={{ caretColor: 'transparent' }}
          />
          <button
            onClick={resetToNow}
            className="mt-2 text-xs text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1 mx-auto"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to now
          </button>
        </div>

        {/* ── Type Toggle ── */}
        <div className="w-full">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setPunchType('arrival')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                punchType === 'arrival'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Arrival
            </button>
            <button
              onClick={() => setPunchType('departure')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium transition-all ${
                punchType === 'departure'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LogOut className="w-4 h-4" />
              Departure
            </button>
          </div>
          {existingEntry && existingEntry.date === currentDate && (
            <div className="mt-3 bg-slate-50 rounded-xl px-4 py-2.5 space-y-1.5">
              <p className="text-[10px] text-slate-400 text-center uppercase tracking-wider mb-1">{currentDate === getCurrentDate() ? "Today's" : formatDate(currentDate).split(',')[0] + "'s"} log</p>
              {existingEntry.arrivalTime && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <LogIn className="w-3 h-3" /> Arrival
                  </span>
                  <span className="text-xs font-mono font-medium text-blue-600">{formatTimeAmPm(existingEntry.arrivalTime)}</span>
                </div>
              )}
              {existingEntry.departureTime && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <LogOut className="w-3 h-3" /> Departure
                  </span>
                  <span className="text-xs font-mono font-medium text-amber-600">{formatTimeAmPm(existingEntry.departureTime)}</span>
                </div>
              )}
              {!existingEntry.arrivalTime && !existingEntry.departureTime && (
                <p className="text-xs text-slate-400 text-center">No times logged yet today</p>
              )}
            </div>
          )}
        </div>

        {/* ── Quick Round Buttons ── */}
        <div className="w-full">
          <div className="grid grid-cols-6 gap-1.5">
            {[
              { label: '−15', value: -15 },
              { label: '−10', value: -10 },
              { label: '−5', value: -5 },
              { label: '+5', value: 5 },
              { label: '+10', value: 10 },
              { label: '+15', value: 15 },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={() => applyOffset(btn.value)}
                className="py-2.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600
                           hover:bg-slate-200 active:bg-slate-300 transition-colors"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Note ── */}
        <div className="w-full">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note..."
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700
                       placeholder-slate-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
      </div>

      {/* ── PUNCH Button ── */}
      <div className="pt-6 pb-4 max-w-sm mx-auto w-full">
        <button
          onClick={handlePunch}
          disabled={saving || !time}
          className={`w-full py-4 rounded-2xl text-lg font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50
            ${punchType === 'arrival'
              ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/25'
              : 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/25'
            }`}
        >
          {saving
            ? 'Saving...'
            : `Punch ${punchType === 'arrival' ? 'Arrival' : 'Departure'}`
          }
        </button>
      </div>

      {/* ── Debug Panel ── */}
      <div className="w-full max-w-sm mx-auto px-4 pb-4">
        <button
          onClick={() => setShowDebug(d => !d)}
          className="text-xs text-slate-400 underline"
        >
          {showDebug ? 'Hide' : 'Show'} Debug
        </button>
        {showDebug && (
          <div className="mt-2 p-3 bg-slate-900 text-green-400 rounded-xl text-[10px] font-mono leading-relaxed max-h-64 overflow-y-auto">
            {debugLogs.length === 0 ? (
              <p className="text-slate-500">Punch to see debug output...</p>
            ) : (
              debugLogs.map((log, i) => <p key={i} className="break-all">{log}</p>)
            )}
          </div>
        )}
      </div>

      {/* ── Confirm Overwrite Dialog ── */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 animate-slide-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">Overwrite existing entry?</h3>
                <p className="text-slate-500 text-sm mt-1">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
