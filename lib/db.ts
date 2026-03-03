import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { TimeEntry, Settings } from './types';

/**
 * IndexedDB — used ONLY for:
 *  1. Settings storage (hourly rate, currency, Google Sheet URL, project list)
 *
 * Google Sheets is the source of truth for all time entries.
 */

interface PunchClockDB extends DBSchema {
  entries: {
    key: string;
    value: TimeEntry;
    indexes: { 'by-date': string };
  };
  settings: {
    key: string;
    value: Settings;
  };
}

const DB_NAME = 'punch-clock-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PunchClockDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PunchClockDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('entries')) {
          const entryStore = db.createObjectStore('entries', { keyPath: 'id' });
          entryStore.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ── ID generation ──

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ── Settings (always stored locally) ──

const SETTINGS_ID = 'user-settings';

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const settings = await db.get('settings', SETTINGS_ID);
  return settings || { id: SETTINGS_ID, hourlyRate: 0, currency: 'USD', googleSheetUrl: '' };
}

export async function saveSettings(
  hourlyRate: number,
  currency: string = 'USD',
  googleSheetUrl?: string
): Promise<Settings> {
  const db = await getDB();
  const existing = await db.get('settings', SETTINGS_ID);
  const settings: Settings = {
    id: SETTINGS_ID,
    hourlyRate,
    currency,
    googleSheetUrl: googleSheetUrl !== undefined ? googleSheetUrl : (existing?.googleSheetUrl || ''),
  };
  await db.put('settings', settings);
  return settings;
}

// ── Pure utility (no DB) ──

export function calculateHoursWorked(
  arrivalTime: string | null,
  departureTime: string | null
): number {
  if (!arrivalTime || !departureTime) return 0;
  const [arrH, arrM] = arrivalTime.split(':').map(Number);
  const [depH, depM] = departureTime.split(':').map(Number);
  const diff = (depH * 60 + depM) - (arrH * 60 + arrM);
  return diff > 0 ? diff / 60 : 0;
}

// ── Project list management (stored in settings) ──

export async function getProjectList(): Promise<string[]> {
  const settings = await getSettings();
  return settings.projectList || [];
}

export async function saveProjectList(projects: string[]): Promise<void> {
  const db = await getDB();
  const existing = await db.get('settings', SETTINGS_ID);
  const settings: Settings = existing || { id: SETTINGS_ID, hourlyRate: 0, currency: 'USD', googleSheetUrl: '' };
  settings.projectList = projects;
  await db.put('settings', settings);
}

export async function addProjectToList(name: string): Promise<string[]> {
  const list = await getProjectList();
  const trimmed = name.trim();
  if (trimmed && !list.includes(trimmed)) {
    list.push(trimmed);
    await saveProjectList(list);
  }
  return list;
}

export async function removeProjectFromList(name: string): Promise<string[]> {
  const list = await getProjectList();
  const filtered = list.filter(p => p !== name);
  await saveProjectList(filtered);
  return filtered;
}
