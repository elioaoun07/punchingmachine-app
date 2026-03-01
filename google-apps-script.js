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
 * Headers are auto-added.
 *
 * ────────────────────────────────────────────────────────────
 * API
 * ────────────────────────────────────────────────────────────
 *
 * GET  ?date=YYYY-MM-DD       → { entry: {...} | null }
 * GET  ?month=YYYY-MM         → { entries: [...] }
 * GET  (no params)            → { entries: [...] }  (all)
 *
 * POST { action:"upsert", date, arrivalTime, departureTime,
 *        arrivalNote, departureNote, id, updatedAt }
 *      → { status:"created"|"updated", row, entry }
 *
 * POST { action:"delete", id, date }
 *      → { status:"deleted"|"not_found" }
 * ============================================================
 */

var MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

var HEADERS = [
  'Date','Arrival Time','Departure Time',
  'Arrival Note','Departure Note','Entry ID','Last Updated'
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
  // Always ensure headers exist (handles pre-created tabs too)
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

function readEntries(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var out = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (!r[0]) continue;
    out.push({
      date:          String(r[0]),
      arrivalTime:   r[1] ? String(r[1]) : null,
      departureTime: r[2] ? String(r[2]) : null,
      arrivalNote:   r[3] ? String(r[3]) : '',
      departureNote: r[4] ? String(r[4]) : '',
      id:            r[5] ? String(r[5]) : '',
      updatedAt:     r[6] || 0,
      sheetRow:      i + 1
    });
  }
  return out;
}

/* ── GET ────────────────────────────────────────────────────── */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Single entry by date
    if (e && e.parameter && e.parameter.date) {
      var d = e.parameter.date;
      var sh = getSheetForDate(d);
      var all = readEntries(sh);
      var match = null;
      for (var i = 0; i < all.length; i++) {
        if (all[i].date === d) { match = all[i]; break; }
      }
      return json({ entry: match });
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
    if ((body.action || 'upsert') === 'delete') return handleDelete(body);
    return handleUpsert(body);
  } catch(err) {
    return json({ error: err.message });
  }
}

function handleUpsert(body) {
  var sheet = getSheetForDate(body.date);
  var data  = sheet.getDataRange().getValues();
  var existingRow = -1;

  for (var i = 1; i < data.length; i++) {
    if (body.id && String(data[i][5]) === String(body.id)) { existingRow = i+1; break; }
    if (String(data[i][0]) === String(body.date))          { existingRow = i+1; break; }
  }

  var now = body.updatedAt || new Date().getTime();
  var row = [body.date, body.arrivalTime||'', body.departureTime||'',
             body.arrivalNote||'', body.departureNote||'', body.id||'', now];

  var status, rowNum;
  if (existingRow > 0) {
    sheet.getRange(existingRow,1,1,row.length).setValues([row]);
    status = 'updated'; rowNum = existingRow;
  } else {
    sheet.appendRow(row);
    rowNum = sheet.getLastRow(); status = 'created';
  }

  return json({
    status: status, row: rowNum,
    entry: {
      date: body.date,
      arrivalTime:   body.arrivalTime   || null,
      departureTime: body.departureTime || null,
      arrivalNote:   body.arrivalNote   || '',
      departureNote: body.departureNote || '',
      id: body.id || '', updatedAt: now
    }
  });
}

function handleDelete(body) {
  if (!body.date) return json({ error:'date is required for delete' });
  var sheet = getSheetForDate(body.date);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((body.id && String(data[i][5])===String(body.id)) || String(data[i][0])===String(body.date)) {
      sheet.deleteRow(i+1);
      return json({ status:'deleted', row: i+1 });
    }
  }
  return json({ status:'not_found' });
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
