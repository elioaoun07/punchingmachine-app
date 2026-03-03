'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, RotateCcw, Pencil, Clock, LogIn, LogOut,
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight,
  Briefcase, Plus, ArrowRightLeft,
} from 'lucide-react';
import { getCurrentDate, getCurrentTime, formatDate, formatHours } from '@/lib/utils';
import {
  generateId, calculateHoursWorked, getSettings,
  getProjectList, addProjectToList,
} from '@/lib/db';
import { upsertEntry, getEntriesByDate } from '@/lib/sheets';
import { TimeEntry } from '@/lib/types';

type PunchType = 'arrival' | 'departure';
type ActiveView = 'punch' | 'project';

interface SavedSummary {
  date: string;
  time: string;
  type: PunchType;
  note: string;
  hoursWorked: number | null;
}

interface ProjectSavedSummary {
  date: string;
  startTime: string;
  projectName: string;
  ended?: boolean;            // true when ending a project (no new one started)
  closedProject?: { name: string; endTime: string };
}

// Smart round: first click rounds to nearest 15-min boundary, subsequent clicks add/subtract 15
function smartRound(time: string, interval: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m;
  const abs = Math.abs(interval);

  let result: number;
  if (total % abs === 0) {
    result = total + interval;
  } else {
    if (interval > 0) {
      result = Math.ceil(total / abs) * abs;
    } else {
      result = Math.floor(total / abs) * abs;
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
  // ── Common State ──
  const [currentDate, setCurrentDate] = useState(getCurrentDate());
  const [sheetConfigured, setSheetConfigured] = useState<boolean | null>(null);
  const [detected, setDetected] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── View State ──
  const [activeView, setActiveView] = useState<ActiveView>('punch');

  // ── Punch State ──
  const [time, setTime] = useState(getCurrentTime());
  const [punchType, setPunchType] = useState<PunchType>('arrival');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<SavedSummary | null>(null);
  const [existingEntry, setExistingEntry] = useState<TimeEntry | null>(null);

  // ── Project State ──
  const [projectTime, setProjectTime] = useState(getCurrentTime());
  const [projectName, setProjectName] = useState('');
  const [projectList, setProjectList] = useState<string[]>([]);
  const [activeProject, setActiveProject] = useState<TimeEntry | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectSaved, setProjectSaved] = useState<ProjectSavedSummary | null>(null);

  // ── Check if Sheets URL is configured ──
  useEffect(() => {
    getSettings().then(s => setSheetConfigured(!!s.googleSheetUrl?.trim()));
  }, []);

  // ── Load project list ──
  useEffect(() => {
    getProjectList().then(setProjectList);
  }, []);

  // ── Smart detection: arrival vs departure + project view ──
  useEffect(() => {
    setDetected(false);
    setExistingEntry(null);
    setSaved(null);
    setProjectSaved(null);
    setActiveProject(null);

    async function detect() {
      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get('type') as PunchType | null;
      const viewParam = params.get('view') as ActiveView | null;

      // Fetch entries directly from Google Sheets (source of truth)
      let punchEntry: TimeEntry | null = null;
      let activeProj: TimeEntry | null = null;

      try {
        const sheetEntries = await getEntriesByDate(currentDate);
        punchEntry = sheetEntries.find(e => !e.entryType || e.entryType === 'punch') ?? null;
        activeProj = sheetEntries.find(e => e.entryType === 'project' && !e.departureTime) ?? null;
      } catch {
        // Sheets unavailable — continue with nulls
      }

      setExistingEntry(punchEntry);
      setActiveProject(activeProj);

      // Punch type detection
      if (typeParam === 'arrival' || typeParam === 'departure') {
        setPunchType(typeParam);
      } else if (punchEntry) {
        if (punchEntry.arrivalTime && !punchEntry.departureTime) {
          setPunchType('departure');
        } else if (punchEntry.arrivalTime && punchEntry.departureTime) {
          setPunchType('arrival');
        } else {
          setPunchType('arrival');
        }
      } else {
        const hour = new Date().getHours();
        setPunchType(hour < 12 ? 'arrival' : 'departure');
      }

      // View detection: if arrival exists and no departure → project view
      if (viewParam === 'punch' || viewParam === 'project') {
        setActiveView(viewParam);
      } else if (typeParam === 'arrival' || typeParam === 'departure') {
        setActiveView('punch');
      } else if (punchEntry && punchEntry.arrivalTime && !punchEntry.departureTime) {
        setActiveView('project');
      }

      setDetected(true);
    }
    detect();
  }, [currentDate]);

  // ── Punch round offset (15 min only) ──
  const applyOffset = useCallback((minutes: number) => {
    setTime(prev => smartRound(prev, minutes));
  }, []);

  // ── Project round offset (15 min only) ──
  const applyProjectOffset = useCallback((minutes: number) => {
    setProjectTime(prev => smartRound(prev, minutes));
  }, []);

  const resetToNow = useCallback(() => setTime(getCurrentTime()), []);
  const resetProjectToNow = useCallback(() => setProjectTime(getCurrentTime()), []);

  // ── Punch: actually perform save ──
  const doSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const settings = await getSettings();
      if (!settings.googleSheetUrl?.trim()) {
        setSheetConfigured(false);
        setSaving(false);
        return;
      }

      const noteValue = note.trim() || undefined;
      const now = Date.now();

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
          entryType: 'punch',
          ...(punchType === 'arrival' && noteValue ? { arrivalNote: noteValue } : {}),
          ...(punchType === 'departure' && noteValue ? { departureNote: noteValue } : {}),
          createdAt: now,
          updatedAt: now,
        };
      }

      const savedResult = await upsertEntry(entry);
      if (savedResult) entry = savedResult;

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
    } catch (err) {
      console.error('Failed to save punch:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [existingEntry, punchType, time, note, currentDate]);

  // ── Punch with overwrite check ──
  const handlePunch = useCallback(async () => {
    if (existingEntry) {
      if (punchType === 'arrival' && existingEntry.arrivalTime) {
        setConfirmDialog({
          message: `Arrival is already logged at ${formatTimeAmPm(existingEntry.arrivalTime)}. Overwrite with ${formatTimeAmPm(time)}?`,
          onConfirm: () => { setConfirmDialog(null); doSave(); },
        });
        return;
      }
      if (punchType === 'departure' && existingEntry.departureTime) {
        setConfirmDialog({
          message: `Departure is already logged at ${formatTimeAmPm(existingEntry.departureTime)}. Overwrite with ${formatTimeAmPm(time)}?`,
          onConfirm: () => { setConfirmDialog(null); doSave(); },
        });
        return;
      }
    }
    doSave();
  }, [existingEntry, punchType, time, doSave]);

  // ── Punch: Edit from success screen ──
  const handleEdit = useCallback(() => {
    if (saved) {
      setTime(saved.time);
      setPunchType(saved.type);
      setNote(saved.note);
    }
    setEditing(true);
    setSaved(null);
  }, [saved]);

  // ── Punch: Punch Again (reset) ──
  const handlePunchAgain = useCallback(() => {
    setSaved(null);
    setNote('');
    setEditing(false);
    setTime(getCurrentTime());
    (async () => {
      try {
        const entries = await getEntriesByDate(currentDate);
        const punchEntry = entries.find(e => !e.entryType || e.entryType === 'punch');
        setExistingEntry(punchEntry ?? null);
        if (punchEntry) {
          if (punchEntry.arrivalTime && !punchEntry.departureTime) {
            setPunchType('departure');
          } else {
            setPunchType('arrival');
          }
        }
        const ap = entries.find(e => e.entryType === 'project' && !e.departureTime);
        setActiveProject(ap ?? null);
      } catch {}
    })();
  }, [currentDate]);

  // ── Project: Start new project ──
  const handleStartProject = useCallback(async () => {
    if (!projectName.trim()) return;
    setProjectSaving(true);
    setSaveError(null);

    try {
      const settings = await getSettings();
      if (!settings.googleSheetUrl?.trim()) {
        setSheetConfigured(false);
        setProjectSaving(false);
        return;
      }

      const now = Date.now();
      let closedInfo: ProjectSavedSummary['closedProject'] | undefined;

      // Auto-close active project
      if (activeProject) {
        const updated: TimeEntry = { ...activeProject, departureTime: projectTime, updatedAt: now };
        await upsertEntry(updated);
        closedInfo = { name: activeProject.projectName || 'Unknown', endTime: projectTime };
      }

      // Create new project entry
      const newEntry: TimeEntry = {
        id: generateId(),
        date: currentDate,
        arrivalTime: projectTime,
        departureTime: null,
        entryType: 'project',
        projectName: projectName.trim(),
        createdAt: now,
        updatedAt: now,
      };

      const savedEntry = await upsertEntry(newEntry);
      const finalEntry = savedEntry || newEntry;
      setActiveProject(finalEntry);

      setProjectSaved({
        date: currentDate,
        startTime: projectTime,
        projectName: projectName.trim(),
        closedProject: closedInfo,
      });
    } catch (err) {
      console.error('Failed to save project:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setProjectSaving(false);
    }
  }, [activeProject, projectTime, projectName, currentDate]);

  // ── Project: End active project ──
  const handleEndProject = useCallback(async () => {
    if (!activeProject) return;
    setProjectSaving(true);
    setSaveError(null);

    try {
      const now = Date.now();
      const updated: TimeEntry = { ...activeProject, departureTime: projectTime, updatedAt: now };
      await upsertEntry(updated);

      setProjectSaved({
        date: currentDate,
        startTime: activeProject.arrivalTime || projectTime,
        projectName: activeProject.projectName || 'Unknown',
        ended: true,
      });
      setActiveProject(null);
    } catch (err) {
      console.error('Failed to end project:', err);
      setSaveError('Failed to save. Please try again.');
    } finally {
      setProjectSaving(false);
    }
  }, [activeProject, projectTime, currentDate]);

  // ── Project: Log another ──
  const handleProjectAgain = useCallback(() => {
    setProjectSaved(null);
    setProjectName('');
    setProjectTime(getCurrentTime());
    setSaveError(null);
    getEntriesByDate(currentDate).then(entries => {
      const ap = entries.find(e => e.entryType === 'project' && !e.departureTime);
      setActiveProject(ap ?? null);
    }).catch(() => {});
  }, [currentDate]);

  // ── Project: Add to saved list ──
  const handleAddToProjectList = useCallback(async () => {
    if (!projectName.trim()) return;
    const updated = await addProjectToList(projectName.trim());
    setProjectList(updated);
  }, [projectName]);

  // ── Loading screen ──
  if (!detected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Clock className="w-8 h-8 text-slate-400 animate-pulse" />
      </div>
    );
  }

  // ── Punch Success Screen ──
  if (saved) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
        <div className="animate-punch-success">
          <CheckCircle className="w-20 h-20 text-emerald-500 mb-6" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-slate-800 mb-1">
          {saved.type === 'arrival' ? 'Arrival' : 'Departure'} Recorded
        </h1>
        <p className="text-slate-500 text-sm mb-8">Successfully saved</p>

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
          <button
            onClick={() => { setSaved(null); setActiveView('project'); }}
            className="flex items-center gap-2 text-purple-500 hover:text-purple-700 transition-colors text-sm"
          >
            <Briefcase className="w-4 h-4" />
            Projects
          </button>
        </div>
      </div>
    );
  }

  // ── Project Success Screen ──
  if (projectSaved) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12">
        <div className="animate-punch-success">
          <CheckCircle className="w-20 h-20 text-purple-500 mb-6" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-semibold text-slate-800 mb-1">
          {projectSaved.ended ? 'Project Ended' : 'Project Started'}
        </h1>
        <p className="text-slate-500 text-sm mb-8">Successfully saved</p>

        <div className="w-full max-w-xs bg-slate-50 rounded-2xl p-6 space-y-4 mb-8">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">Project</span>
            <span className="text-purple-700 font-medium text-sm bg-purple-100 px-2.5 py-0.5 rounded-full">
              {projectSaved.projectName}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">{projectSaved.ended ? 'End Time' : 'Start Time'}</span>
            <span className="text-slate-800 font-mono font-semibold text-lg">{formatTimeAmPm(projectSaved.startTime)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-sm">Date</span>
            <span className="text-slate-800 font-medium text-sm">{formatDate(projectSaved.date)}</span>
          </div>
          {projectSaved.closedProject && (
            <div className="pt-3 border-t border-slate-200 space-y-1.5">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Previous project auto-closed</p>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">{projectSaved.closedProject.name}</span>
                <span className="text-amber-600 text-sm font-mono">
                  ended {formatTimeAmPm(projectSaved.closedProject.endTime)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          <button
            onClick={handleProjectAgain}
            className="flex items-center gap-2 text-purple-500 hover:text-purple-700 transition-colors text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Log another
          </button>
          <button
            onClick={() => { setProjectSaved(null); setActiveView('punch'); }}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors text-sm"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Switch to Punch
          </button>
        </div>
      </div>
    );
  }

  // ── Shared: Date header ──
  const dateHeader = (
    <div className="text-center mb-6">
      <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">
        {activeView === 'punch' ? 'Punch Clock' : 'Project Log'}
      </p>
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
  );

  // ── Shared: View toggle ──
  const viewToggle = (
    <div className="max-w-sm mx-auto w-full mb-6">
      <div className="flex bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setActiveView('punch')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeView === 'punch'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Punch Clock
        </button>
        <button
          onClick={() => setActiveView('project')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeView === 'project'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          Project Log
        </button>
      </div>
    </div>
  );

  // ── Shared: Error + no-sheet warnings ──
  const warnings = (
    <>
      {sheetConfigured === false && (
        <div className="w-full max-w-sm mx-auto px-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700">Google Sheet not connected</p>
              <p className="text-xs text-red-600 mt-0.5">
                Go to the <a href="/" className="underline font-medium">main page</a> → Settings → paste your Google Apps Script URL.
              </p>
            </div>
          </div>
        </div>
      )}
      {saveError && (
        <div className="w-full max-w-sm mx-auto px-4">
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600">{saveError}</p>
          </div>
        </div>
      )}
    </>
  );

  // ── Shared: 15-min round buttons ──
  const roundButtons = (forProject: boolean) => (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => forProject ? applyProjectOffset(-15) : applyOffset(-15)}
          className="py-3 rounded-lg text-sm font-medium bg-slate-100 text-slate-600
                     hover:bg-slate-200 active:bg-slate-300 transition-colors"
        >
          −15 min
        </button>
        <button
          onClick={() => forProject ? applyProjectOffset(15) : applyOffset(15)}
          className="py-3 rounded-lg text-sm font-medium bg-slate-100 text-slate-600
                     hover:bg-slate-200 active:bg-slate-300 transition-colors"
        >
          +15 min
        </button>
      </div>
    </div>
  );

  // ── Main Form ──
  return (
    <div className="min-h-screen bg-white flex flex-col px-6 py-8">
      {dateHeader}
      {viewToggle}

      {activeView === 'punch' ? (
        /* ═══════════════════════════════════════ PUNCH VIEW ═══════════════════════════════════════ */
        <>
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
                  <p className="text-[10px] text-slate-400 text-center uppercase tracking-wider mb-1">
                    {currentDate === getCurrentDate() ? "Today's" : formatDate(currentDate).split(',')[0] + "'s"} log
                  </p>
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

            {/* ── Quick Round Buttons (15 min only) ── */}
            {roundButtons(false)}

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

          {warnings}

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
        </>
      ) : (
        /* ═══════════════════════════════════════ PROJECT VIEW ═══════════════════════════════════════ */
        <>
          <div className="flex-1 flex flex-col items-center justify-center space-y-6 max-w-sm mx-auto w-full">
            {/* ── Active project info ── */}
            {activeProject && (
              <div className="w-full bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="text-[10px] text-purple-400 uppercase tracking-wider mb-2">Active Project</p>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-purple-800">{activeProject.projectName}</span>
                  <span className="text-purple-600 font-mono text-sm">
                    since {formatTimeAmPm(activeProject.arrivalTime || '')}
                  </span>
                </div>
              </div>
            )}

            {/* ── Time Display ── */}
            <div className="text-center w-full">
              <input
                type="time"
                value={projectTime}
                onChange={(e) => setProjectTime(e.target.value)}
                className="w-full text-center text-6xl font-light text-slate-800 bg-transparent border-none outline-none appearance-none
                           [font-variant-numeric:tabular-nums]
                           [&::-webkit-calendar-picker-indicator]:hidden
                           [&::-webkit-datetime-edit-hour-field]:p-0
                           [&::-webkit-datetime-edit-minute-field]:p-0
                           [&::-webkit-datetime-edit-text]:text-slate-300"
                style={{ caretColor: 'transparent' }}
              />
              <button
                onClick={resetProjectToNow}
                className="mt-2 text-xs text-slate-400 hover:text-purple-500 transition-colors flex items-center gap-1 mx-auto"
              >
                <RotateCcw className="w-3 h-3" />
                Reset to now
              </button>
            </div>

            {/* ── Quick Round Buttons (15 min only) ── */}
            {roundButtons(true)}

            {/* ── Project Selector ── */}
            <div className="w-full">
              <label className="text-sm font-medium text-slate-600 mb-2 block">Project Name</label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    list="project-list-options"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Select or type a project..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700
                               placeholder-slate-400 outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all"
                  />
                  <datalist id="project-list-options">
                    {projectList.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
                {projectName.trim() && !projectList.includes(projectName.trim()) && (
                  <button
                    onClick={handleAddToProjectList}
                    className="px-3.5 bg-purple-100 text-purple-600 rounded-xl hover:bg-purple-200 transition-colors
                               flex items-center shrink-0"
                    title={`Add "${projectName.trim()}" to saved projects`}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
              {projectName.trim() && !projectList.includes(projectName.trim()) && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Tap <span className="text-purple-500 font-medium">+</span> to save &ldquo;{projectName.trim()}&rdquo; to your project list
                </p>
              )}
            </div>
          </div>

          {warnings}

          {/* ── Project Action Buttons ── */}
          <div className="pt-6 pb-4 max-w-sm mx-auto w-full space-y-2">
            <button
              onClick={handleStartProject}
              disabled={projectSaving || !projectName.trim()}
              className="w-full py-4 rounded-2xl text-lg font-semibold text-white transition-all active:scale-[0.98]
                         disabled:opacity-50 bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/25"
            >
              {projectSaving
                ? 'Saving...'
                : activeProject
                  ? `Switch to ${projectName.trim() || '...'}`
                  : `Start ${projectName.trim() || '...'}`
              }
            </button>
            {activeProject && (
              <button
                onClick={handleEndProject}
                disabled={projectSaving}
                className="w-full py-3 rounded-xl text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200
                           hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                End {activeProject.projectName}
              </button>
            )}
          </div>
        </>
      )}

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
