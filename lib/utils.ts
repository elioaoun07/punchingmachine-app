import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, getDate, getDaysInMonth } from 'date-fns';

// Round time to nearest X minutes
export function roundToNearest(time: string, minutes: number, direction: 'up' | 'down' | 'nearest' = 'nearest'): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins;
  
  let rounded: number;
  if (direction === 'up') {
    rounded = Math.ceil(totalMinutes / minutes) * minutes;
  } else if (direction === 'down') {
    rounded = Math.floor(totalMinutes / minutes) * minutes;
  } else {
    rounded = Math.round(totalMinutes / minutes) * minutes;
  }
  
  // Handle overflow past midnight
  if (rounded >= 24 * 60) rounded = 24 * 60 - 1;
  
  const newHours = Math.floor(rounded / 60);
  const newMins = rounded % 60;
  
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

// Format time for display
export function formatTime(time: string | null): string {
  if (!time) return '--:--';
  return time;
}

// Get current date in YYYY-MM-DD format
export function getCurrentDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

// Get current time in HH:MM format
export function getCurrentTime(): string {
  return format(new Date(), 'HH:mm');
}

// Format date for display
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, 'EEE, MMM d, yyyy');
}

// Format date short
export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return format(date, 'MMM d');
}

// Get working days in month (excluding weekends)
export function getWorkingDaysInMonth(year: number, month: number): number {
  const start = startOfMonth(new Date(year, month));
  const end = endOfMonth(new Date(year, month));
  const days = eachDayOfInterval({ start, end });
  return days.filter(day => !isWeekend(day)).length;
}

// Get working days passed in month
export function getWorkingDaysPassed(year: number, month: number): number {
  const start = startOfMonth(new Date(year, month));
  const today = new Date();
  const currentDay = today.getFullYear() === year && today.getMonth() === month 
    ? today 
    : endOfMonth(new Date(year, month));
  
  const days = eachDayOfInterval({ start, end: currentDay });
  return days.filter(day => !isWeekend(day)).length;
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format hours
export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Parse URL parameters for NFC/QR
export function parseUrlParams(): { action?: 'arrival' | 'departure'; date?: string; time?: string } {
  if (typeof window === 'undefined') return {};
  
  const params = new URLSearchParams(window.location.search);
  return {
    action: params.get('action') as 'arrival' | 'departure' | undefined,
    date: params.get('date') || undefined,
    time: params.get('time') || undefined,
  };
}
