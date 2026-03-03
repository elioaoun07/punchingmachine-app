export interface TimeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  arrivalTime: string | null; // HH:MM
  departureTime: string | null; // HH:MM
  arrivalNote?: string;
  departureNote?: string;
  entryType?: 'punch' | 'project';
  projectName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  id: string;
  hourlyRate: number;
  currency: string;
  googleSheetUrl?: string;
  projectList?: string[];
}

export interface DailyStats {
  date: string;
  hoursWorked: number;
  earnings: number;
}

export interface MonthlyStats {
  totalHours: number;
  totalEarnings: number;
  averageHoursPerDay: number;
  workingDays: number;
  projectedMonthlyEarnings: number;
  projectedMonthlyHours: number;
}
