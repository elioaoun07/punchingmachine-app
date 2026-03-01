import { TimeEntry } from './types';
import { getSettings } from './db';

/**
 * Google Sheets — source of truth for all time entries.
 *
 * All requests go through /api/sheets (server-side proxy) to avoid CORS.
 * The proxy forwards to the Google Apps Script Web App URL.
 */

// ── Internals ──

async function getSheetUrl(): Promise<string | null> {
  const settings = await getSettings();
  const url = settings.googleSheetUrl?.trim();
  return url || null;
}

function mapRow(row: any): TimeEntry {
  return {
    id: row.id || `sheet-${row.date}`,
    date: String(row.date),
    arrivalTime: row.arrivalTime || null,
    departureTime: row.departureTime || null,
    arrivalNote: row.arrivalNote || undefined,
    departureNote: row.departureNote || undefined,
    createdAt: row.updatedAt || Date.now(),
    updatedAt: row.updatedAt || Date.now(),
  };
}

/** Build the proxy URL for GET requests */
function proxyGet(sheetUrl: string, params?: Record<string, string>): string {
  const qs = new URLSearchParams({ url: sheetUrl, ...params });
  return `/api/sheets?${qs.toString()}`;
}

// ── Write operations ──

/**
 * Upsert an entry to Google Sheets via server proxy.
 * Returns the saved entry on success, null on failure.
 */
export async function upsertEntry(entry: TimeEntry): Promise<TimeEntry | null> {
  try {
    const url = await getSheetUrl();
    if (!url) return null;

    const response = await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        action: 'upsert',
        date: entry.date,
        arrivalTime: entry.arrivalTime || '',
        departureTime: entry.departureTime || '',
        arrivalNote: entry.arrivalNote || '',
        departureNote: entry.departureNote || '',
        id: entry.id,
        updatedAt: entry.updatedAt || Date.now(),
      }),
    });

    const data = await response.json();
    if (data.entry) return mapRow(data.entry);
    return entry; // assume success even if response format is unexpected
  } catch (error) {
    console.error('[Sheets] upsert failed:', error);
    return null;
  }
}

/**
 * Delete an entry from Google Sheets via server proxy.
 */
export async function deleteSheetEntry(id: string, date: string): Promise<boolean> {
  try {
    const url = await getSheetUrl();
    if (!url) return false;

    const response = await fetch('/api/sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, action: 'delete', id, date }),
    });

    const data = await response.json();
    return data.status === 'deleted' || data.status === 'ok';
  } catch (error) {
    console.error('[Sheets] delete failed:', error);
    return false;
  }
}

// ── Read operations ──

/**
 * Get a single entry by date.
 */
export async function getEntryByDate(date: string): Promise<TimeEntry | null> {
  try {
    const url = await getSheetUrl();
    if (!url) return null;

    const response = await fetch(proxyGet(url, { date }));
    const data = await response.json();
    if (data.entry) return mapRow(data.entry);
    return null;
  } catch (error) {
    console.warn('[Sheets] getEntryByDate failed:', error);
    return null;
  }
}

/**
 * Get all entries for a specific month.
 */
export async function getEntriesByMonth(year: number, month: number): Promise<TimeEntry[]> {
  try {
    const url = await getSheetUrl();
    if (!url) return [];

    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const response = await fetch(proxyGet(url, { month: monthStr }));
    const data = await response.json();
    if (!data.entries || !Array.isArray(data.entries)) return [];
    return data.entries.map(mapRow);
  } catch (error) {
    console.warn('[Sheets] getEntriesByMonth failed:', error);
    return [];
  }
}

/**
 * Get all entries across all months.
 */
export async function getAllEntries(): Promise<TimeEntry[]> {
  try {
    const url = await getSheetUrl();
    if (!url) return [];

    const response = await fetch(proxyGet(url));
    const data = await response.json();
    if (!data.entries || !Array.isArray(data.entries)) return [];
    return data.entries.map(mapRow);
  } catch (error) {
    console.warn('[Sheets] getAllEntries failed:', error);
    return [];
  }
}

/**
 * Check if Google Sheets is configured.
 */
export async function isSheetsConfigured(): Promise<boolean> {
  return (await getSheetUrl()) !== null;
}
