/**
 * ============================================================
 * Punch Clock — Google Apps Script (Web App)
 * ============================================================
 *
 * SETUP:
 * 1. Create a new Google Spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code, paste THIS entire file
 * 4. Click Deploy > New deployment
 * 5. Type = Web app, Execute as = Me, Access = Anyone
 * 6. Click Deploy, authorize when prompted
 * 7. Copy the Web App URL → paste into Punch Clock Settings
 *
 * Monthly tabs (e.g. "March 2026") are auto-created on first write.
 * A "Master" tab is auto-maintained with the manager-ready view.
 *
 * ────────────────────────────────────────────────────────────
 * API
 * ────────────────────────────────────────────────────────────
 *
 * GET  ?date=YYYY-MM-DD       → { entry, entries }
 * GET  ?month=YYYY-MM         → { entries: [...] }
 * GET  (no params)            → { entries: [...] }  (all)
 *
 * POST { action:"upsert", ... }  → upsert + rebuild Master
 * POST { action:"delete", ... }  → delete + rebuild Master
 * POST { action:"rebuildMaster", year, month } → rebuild only
 * ============================================================
 */

var MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

var HEADERS = [
  'Date','Arrival Time','Departure Time',
  'Arrival Note','Departure Note','Entry ID','Last Updated',
  'Entry Type','Project Name'
];

var MASTER_HEADERS = [
  'DATE','IN','OUT','IN','OUT','IN','OUT','IN','OUT','LUNCH','TOTAL','REQUIRED'
];

/* ── Sheet helpers ──────────────────────────────────────────── */

function getSheetForDate(dateStr) {
  var p = dateStr.split('-');
  var tabName = MONTH_NAMES[parseInt(p[1],10)-1] + ' ' + p[0];
  return getOrCreateSheet(tabName);
}

function getOrCreateSheet(tabName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  var firstCell = sheet.getRange(1,1).getValue();
  if (firstCell !== HEADERS[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,HEADERS.length).setFontWeight('bold');
    sheet.setColumnWidth(1, 120);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 110);
    sheet.setColumnWidth(4, 180);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(6, 200);
    sheet.setColumnWidth(7, 140);
    sheet.setColumnWidth(8, 100);
    sheet.setColumnWidth(9, 160);
  } else {
    // Migration: add new columns if missing
    var lastCol = sheet.getLastColumn();
    if (lastCol < HEADERS.length) {
      sheet.getRange(1, lastCol + 1, 1, HEADERS.length - lastCol)
        .setValues([HEADERS.slice(lastCol)]);
      sheet.getRange(1, lastCol + 1, 1, HEADERS.length - lastCol).setFontWeight('bold');
      if (lastCol < 8) sheet.setColumnWidth(8, 100);
      if (lastCol < 9) sheet.setColumnWidth(9, 160);
    }
  }
  return sheet;
}

function tabNameToYM(name) {
  var parts = name.split(' ');
  if (parts.length !== 2) return null;
  var mi = MONTH_NAMES.indexOf(parts[0]);
  if (mi === -1) return null;
  var y = parseInt(parts[1],10);
  if (isNaN(y)) return null;
  return y + '-' + ('0'+(mi+1)).slice(-2);
}

/**
 * Convert a value (Date object or string) to "HH:MM" format.
 * Google Sheets returns time cells as Date objects (epoch 1899-12-30).
 */
function normalizeTimeStr(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var h = val.getHours();
    var m = val.getMinutes();
    return ('0'+h).slice(-2) + ':' + ('0'+m).slice(-2);
  }
  var s = String(val).trim();
  // Already HH:MM or H:MM
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  // Try parsing as date string (e.g. "Sat Dec 30 1899 07:45:00 ...")
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
  }
  return s || null;
}

function readEntries(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    out.push({
      date:          normalizeDateStr(r[0]),
      arrivalTime:   normalizeTimeStr(r[1]),
      departureTime: normalizeTimeStr(r[2]),
      arrivalNote:   r[3] ? String(r[3]) : '',
      departureNote: r[4] ? String(r[4]) : '',
      id:            r[5] ? String(r[5]) : '',
      updatedAt:     r[6] || 0,
      entryType:     r[7] ? String(r[7]) : 'punch',
      projectName:   r[8] ? String(r[8]) : '',
      sheetRow:      i + 1
    });
  }
  return out;
}

function timeToFraction(timeStr) {
  if (!timeStr) return '';
  // Handle Date objects directly
  if (timeStr instanceof Date) {
    return (timeStr.getHours() * 60 + timeStr.getMinutes()) / (24 * 60);
  }
  var s = String(timeStr).trim();
  var parts = s.split(':');
  var h = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '';
  return (h * 60 + m) / (24 * 60);
}

/**
 * Normalize a date value (could be Date object or string) to "YYYY-MM-DD".
 * Handles Google Sheets returning Date objects from getValues().
 */
function normalizeDateStr(val) {
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(val);
  // If it's already YYYY-MM-DD, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try to parse as Date string (e.g. "Tue Mar 03 2026 ...")
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    var y2 = parsed.getFullYear();
    var m2 = ('0' + (parsed.getMonth() + 1)).slice(-2);
    var d2 = ('0' + parsed.getDate()).slice(-2);
    return y2 + '-' + m2 + '-' + d2;
  }
  return s;
}

/* ── Custom Menu ────────────────────────────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⏱ Punch Clock')
    .addItem('Rebuild Master Sheet (Current Month)', 'rebuildMasterCurrent')
    .addToUi();
}

function rebuildMasterCurrent() {
  var now = new Date();
  rebuildMasterSheet(now.getFullYear(), now.getMonth());
  SpreadsheetApp.getUi().alert(
    'Master sheet rebuilt for ' + MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear()
  );
}

/* ── Master Sheet Builder ───────────────────────────────────── */

/**
 * Rebuild the "Master" tab for a given month.
 * @param {number} year  – full year (e.g. 2026)
 * @param {number} month – 0-based month (0 = January)
 *
 * Layout (matches manager format):
 *   Row 1 : Company name  ...  Name : Person
 *   Row 2 : Monthly Time Sheet – Month Year  (merged)
 *   Row 3 : Headers  DATE | IN | OUT | IN | OUT | IN | OUT | IN | OUT | LUNCH | TOTAL | REQUIRED
 *   Row 4…: One row per calendar day
 *           ↳ Saturdays double as weekly-total rows (SUM formula)
 *   Last  : TOTALS (Hours)  with monthly sums
 */
function rebuildMasterSheet(year, month) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName('Master');
  if (!master) {
    master = ss.insertSheet('Master', 0);
  }

  /* ── 1. Read entry data ───────────────────────────────── */
  var tabName    = MONTH_NAMES[month] + ' ' + year;
  var entrySheet = ss.getSheetByName(tabName);
  var entries    = entrySheet ? readEntries(entrySheet) : [];

  // Group entries by date, sorted by arrival time
  // Use normalizeDateStr to handle Date objects vs strings
  // Only include punch entries for the Master sheet
  var byDate = {};
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].entryType && entries[i].entryType !== 'punch') continue;
    var d = normalizeDateStr(entries[i].date);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(entries[i]);
  }
  var dateKeys = Object.keys(byDate);
  for (var k = 0; k < dateKeys.length; k++) {
    byDate[dateKeys[k]].sort(function(a, b) {
      return (a.arrivalTime || '').localeCompare(b.arrivalTime || '');
    });
  }

  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var totalRow    = daysInMonth + 4;          // row after last day
  var neededRows  = totalRow;                 // 3 header + days + 1 total

  /* ── 2. Ensure correct grid size ──────────────────────── */
  var curRows = master.getMaxRows();
  if (curRows < neededRows) {
    master.insertRowsAfter(curRows, neededRows - curRows);
  } else if (curRows > neededRows) {
    master.deleteRows(neededRows + 1, curRows - neededRows);
  }
  var curCols = master.getMaxColumns();
  if (curCols < 12) master.insertColumnsAfter(curCols, 12 - curCols);
  if (curCols > 12) master.deleteColumns(13, curCols - 12);

  /* ── 3. Clear everything below row 1 (keep company name row) */
  master.getRange(2, 1, neededRows - 1, 12).clear();
  // Also reset all backgrounds from row 2 down
  master.getRange(2, 1, neededRows - 1, 12).setBackground(null);

  /* ── 4. Row 1 — keep existing (company name / person) ── */
  if (!master.getRange(1, 1).getValue()) {
    master.getRange(1, 1).setValue('Company Name');
    master.getRange(1, 9).setValue('Name : Racha Touma');
  }

  /* ── 5. Row 2 — title ────────────────────────────────── */
  master.getRange(2, 1, 1, 12).merge();
  master.getRange(2, 1)
    .setValue('Monthly Time Sheet - ' + MONTH_NAMES[month] + ' ' + year)
    .setFontSize(14)
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  /* ── 6. Row 3 — headers ──────────────────────────────── */
  master.getRange(3, 1, 1, 12).setValues([MASTER_HEADERS])
    .setFontWeight('bold');

  /* ── 7. Build value grid for all day rows ─────────────── */
  var values = [];                    // daysInMonth × 12
  var saturdayInfo  = [];             // {idx, weekStartRow}  (idx in values[])
  var weekStartRow  = 4;              // 1-based sheet row where current week begins

  for (var day = 1; day <= daysInMonth; day++) {
    var dateObj = new Date(year, month, day);
    var dow     = dateObj.getDay();    // 0=Sun … 6=Sat
    var dateStr = year + '-' + ('0'+(month+1)).slice(-2) + '-' + ('0'+day).slice(-2);
    var dayEntries = byDate[dateStr] || [];

    var row = [];
    row.push(dateObj);                // A — date value

    // B–I : up to 4 IN/OUT pairs
    for (var p = 0; p < 4; p++) {
      var inVal  = '';
      var outVal = '';
      if (p < dayEntries.length) {
        if (dayEntries[p].arrivalTime)   inVal  = timeToFraction(dayEntries[p].arrivalTime);
        if (dayEntries[p].departureTime) outVal = timeToFraction(dayEntries[p].departureTime);
      }
      row.push(inVal);
      row.push(outVal);
    }

    row.push('');                     // J — LUNCH (blank)
    row.push('');                     // K — TOTAL (formula set later)

    // L — REQUIRED  (9 h for workdays, blank for weekends)
    row.push((dow !== 0 && dow !== 6) ? 9/24 : '');

    values.push(row);

    if (dow === 6) {                  // Saturday = weekly-total row
      saturdayInfo.push({ idx: day - 1, row: day + 3, weekStartRow: weekStartRow });
      weekStartRow = day + 3 + 1;
    }
  }

  // Write the entire block in one call
  master.getRange(4, 1, daysInMonth, 12).setValues(values);

  /* ── 8. Set formulas for TOTAL column (K = col 11) ────── */
  var nonSatRows = [];

  for (var day = 1; day <= daysInMonth; day++) {
    var dateObj2 = new Date(year, month, day);
    var dow2     = dateObj2.getDay();
    var r        = day + 3;

    if (dow2 === 6) {
      // Saturday → weekly SUM
      var info = null;
      for (var s = 0; s < saturdayInfo.length; s++) {
        if (saturdayInfo[s].row === r) { info = saturdayInfo[s]; break; }
      }
      if (info) {
        master.getRange(r, 11).setFormula('=SUM(K' + info.weekStartRow + ':K' + (r - 1) + ')');
        master.getRange(r, 12).setFormula('=SUM(L' + info.weekStartRow + ':L' + (r - 1) + ')');
      }
    } else {
      nonSatRows.push(r);
      // Daily total: sum of each (OUT − IN) pair when both are present
      var f = '=IF(COUNTA(B'+r+':I'+r+')=0,"",';
      f += 'IF(AND(B'+r+'<>"",C'+r+'<>""),C'+r+'-B'+r+',0)+';
      f += 'IF(AND(D'+r+'<>"",E'+r+'<>""),E'+r+'-D'+r+',0)+';
      f += 'IF(AND(F'+r+'<>"",G'+r+'<>""),G'+r+'-F'+r+',0)+';
      f += 'IF(AND(H'+r+'<>"",I'+r+'<>""),I'+r+'-H'+r+',0))';
      master.getRange(r, 11).setFormula(f);
    }
  }

  /* ── 9. Monthly TOTALS row ────────────────────────────── */
  // TOTALS = sum of Saturday weekly-total cells + any remaining days after the last Saturday
  var satKRefs = [], satLRefs = [];
  for (var si = 0; si < saturdayInfo.length; si++) {
    satKRefs.push('K' + saturdayInfo[si].row);
    satLRefs.push('L' + saturdayInfo[si].row);
  }

  // Remaining days after the last Saturday (partial week)
  var lastSatRow = saturdayInfo.length > 0 ? saturdayInfo[saturdayInfo.length - 1].row : 3;
  var remKRefs = [], remLRefs = [];
  for (var rr = lastSatRow + 1; rr < totalRow; rr++) {
    var dayNum = rr - 3;
    if (dayNum >= 1 && dayNum <= daysInMonth) {
      var dowRem = new Date(year, month, dayNum).getDay();
      if (dowRem !== 6) { // not a Saturday (shouldn't be, but guard)
        remKRefs.push('K' + rr);
        remLRefs.push('L' + rr);
      }
    }
  }

  var allKRefs = satKRefs.concat(remKRefs);
  var allLRefs = satLRefs.concat(remLRefs);

  master.getRange(totalRow, 10).setValue('TOTALS (Hours)').setFontWeight('bold');
  if (allKRefs.length > 0) {
    master.getRange(totalRow, 11).setFormula('=' + allKRefs.join('+')).setFontWeight('bold');
    master.getRange(totalRow, 12).setFormula('=' + allLRefs.join('+')).setFontWeight('bold');
  }

  /* ── 10. Number formats ───────────────────────────────── */
  // Dates
  master.getRange(4, 1, daysInMonth, 1).setNumberFormat('d-MMM-yy');
  // IN/OUT times
  master.getRange(4, 2, daysInMonth, 8).setNumberFormat('h:mm');
  // Daily TOTAL  → h:mm
  master.getRange(4, 11, daysInMonth, 1).setNumberFormat('h:mm');
  // Daily REQUIRED  → h:mm:ss
  master.getRange(4, 12, daysInMonth, 1).setNumberFormat('h:mm:ss');
  // Saturday weekly totals → [h]:mm:ss
  for (var s = 0; s < saturdayInfo.length; s++) {
    var sr = saturdayInfo[s].row;
    master.getRange(sr, 11).setNumberFormat('[h]:mm:ss');
    master.getRange(sr, 12).setNumberFormat('[h]:mm:ss');
  }
  // Monthly totals → [h]:mm:ss
  master.getRange(totalRow, 11, 1, 2).setNumberFormat('[h]:mm:ss');

  /* ── 11. Formatting & colours ─────────────────────────── */
  var PEACH = '#FDE9D9';

  // Weekend rows  →  peach background
  for (var day = 1; day <= daysInMonth; day++) {
    var dateObj3 = new Date(year, month, day);
    var dow3     = dateObj3.getDay();
    if (dow3 === 0 || dow3 === 6) {
      master.getRange(day + 3, 1, 1, 12).setBackground(PEACH);
    }
  }

  // Borders on header + data + total
  master.getRange(3, 1, daysInMonth + 2, 12)
    .setBorder(true, true, true, true, true, true);

  // Bold Saturday weekly-total cells
  for (var s = 0; s < saturdayInfo.length; s++) {
    master.getRange(saturdayInfo[s].row, 11, 1, 2).setFontWeight('bold');
  }

  // Column widths
  master.setColumnWidth(1, 100);
  for (var c = 2; c <= 9; c++) master.setColumnWidth(c, 65);
  master.setColumnWidth(10, 120);
  master.setColumnWidth(11, 90);
  master.setColumnWidth(12, 90);

  SpreadsheetApp.flush();
}

/* ── Auto-rebuild helper (called after upsert/delete) ──────── */

function autoRebuildMaster(entryDate) {
  try {
    var parts = entryDate.split('-');
    var eYear  = parseInt(parts[0], 10);
    var eMonth = parseInt(parts[1], 10) - 1;
    // Always rebuild — Master sheet shows whichever month was last modified
    rebuildMasterSheet(eYear, eMonth);
  } catch (ignore) {}
}

/* ── GET ────────────────────────────────────────────────────── */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Entries for a specific date (returns all entries for multi-IN/OUT support)
    if (e && e.parameter && e.parameter.date) {
      var d = e.parameter.date;
      var sh = getSheetForDate(d);
      var all = readEntries(sh);
      var matches = [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].date === d) matches.push(all[i]);
      }
      return json({ entry: matches[0] || null, entries: matches });
    }

    // Entries for a month
    if (e && e.parameter && e.parameter.month) {
      var ms = e.parameter.month;
      var pp = ms.split('-');
      var tab = MONTH_NAMES[parseInt(pp[1],10)-1] + ' ' + pp[0];
      var mSh = ss.getSheetByName(tab);
      if (!mSh) return json({ entries: [] });
      return json({ entries: readEntries(mSh) });
    }

    // All entries
    var result = [];
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      if (!tabNameToYM(sheets[s].getName())) continue;
      var ents = readEntries(sheets[s]);
      for (var j = 0; j < ents.length; j++) result.push(ents[j]);
    }
    result.sort(function(a,b){ return b.date.localeCompare(a.date); });
    return json({ entries: result });
  } catch(err) {
    return json({ error: err.message });
  }
}

/* ── POST ───────────────────────────────────────────────────── */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'delete')       return handleDelete(body);
    if (body.action === 'rebuildMaster') return handleRebuildMaster(body);
    return handleUpsert(body);
  } catch(err) {
    return json({ error: err.message });
  }
}

function handleUpsert(body) {
  var sheet = getSheetForDate(body.date);
  var data  = sheet.getDataRange().getValues();
  var existingRow = -1;

  // Match ONLY by entry ID — allows multiple entries per date
  for (var i = 1; i < data.length; i++) {
    if (body.id && String(data[i][5]) === String(body.id)) { existingRow = i+1; break; }
  }

  var now = body.updatedAt || new Date().getTime();
  var row = [body.date, body.arrivalTime||'', body.departureTime||'',
             body.arrivalNote||'', body.departureNote||'', body.id||'', now,
             body.entryType||'punch', body.projectName||''];

  var status, rowNum;
  if (existingRow > 0) {
    sheet.getRange(existingRow,1,1,row.length).setValues([row]);
    status = 'updated'; rowNum = existingRow;
  } else {
    sheet.appendRow(row);
    rowNum = sheet.getLastRow(); status = 'created';
  }

  // Auto-update Master sheet
  autoRebuildMaster(body.date);

  return json({
    status: status, row: rowNum,
    entry: {
      date: body.date,
      arrivalTime:   body.arrivalTime   || null,
      departureTime: body.departureTime || null,
      arrivalNote:   body.arrivalNote   || '',
      departureNote: body.departureNote || '',
      id: body.id || '', updatedAt: now,
      entryType: body.entryType || 'punch',
      projectName: body.projectName || ''
    }
  });
}

function handleDelete(body) {
  if (!body.id && !body.date) return json({ error:'id or date is required for delete' });
  var sheet = getSheetForDate(body.date);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (body.id && String(data[i][5]) === String(body.id)) {
      sheet.deleteRow(i+1);
      autoRebuildMaster(body.date);
      return json({ status:'deleted', row: i+1 });
    }
    if (!body.id && String(data[i][0]) === String(body.date)) {
      sheet.deleteRow(i+1);
      autoRebuildMaster(body.date);
      return json({ status:'deleted', row: i+1 });
    }
  }
  return json({ status:'not_found' });
}

function handleRebuildMaster(body) {
  var y = body.year;
  var m = body.month;  // 0-based
  if (!y || m === undefined) {
    var now = new Date();
    y = now.getFullYear();
    m = now.getMonth();
  }
  rebuildMasterSheet(y, m);
  return json({ status: 'ok', month: MONTH_NAMES[m] + ' ' + y });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
