'use client';

import React, { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { calculateHoursWorked, getSettings } from '@/lib/db';
import { getEntriesByMonth } from '@/lib/sheets';
import { formatDate } from '@/lib/utils';

interface ExportButtonProps {
  year: number;
  month: number;
}

export default function ExportButton({ year, month }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const [entries, settings] = await Promise.all([
        getEntriesByMonth(year, month),
        getSettings()
      ]);

      if (entries.length === 0) {
        alert('No entries to export for this month');
        setExporting(false);
        return;
      }

      const data = entries.map((entry) => {
        const hours = calculateHoursWorked(entry.arrivalTime, entry.departureTime);
        return {
          Date: formatDate(entry.date),
          'Arrival Time': entry.arrivalTime || '',
          'Departure Time': entry.departureTime || '',
          'Hours Worked': hours > 0 ? hours.toFixed(2) : '',
          Earnings: hours > 0 && settings.hourlyRate > 0 
            ? (hours * settings.hourlyRate).toFixed(2) 
            : '',
        };
      });

      const totalHours = entries.reduce((sum, e) => 
        sum + calculateHoursWorked(e.arrivalTime, e.departureTime), 0);
      
      data.push({
        Date: 'TOTAL',
        'Arrival Time': '',
        'Departure Time': '',
        'Hours Worked': totalHours.toFixed(2),
        Earnings: settings.hourlyRate > 0 
          ? (totalHours * settings.hourlyRate).toFixed(2) 
          : '',
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];

      const wb = XLSX.utils.book_new();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'];
      XLSX.utils.book_append_sheet(wb, ws, `${monthNames[month]} ${year}`);
      XLSX.writeFile(wb, `TimeSheet_${year}_${String(month + 1).padStart(2, '0')}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export. Please try again.');
    }
    setExporting(false);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className={`flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-medium transition-all ${
        exporting
          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
          : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-md hover:shadow-lg'
      }`}
    >
      {exporting ? (
        <>
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-5 h-5" />
          Export {monthNames[month]} to Excel
        </>
      )}
    </button>
  );
}
