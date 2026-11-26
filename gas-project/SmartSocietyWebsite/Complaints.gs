/**
 * Smart Society 3.0 — Resident & Committee Complaint Management
 */

function Complaints_list() {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var rows = Database_readTable(db, 'Complaints');
  if (actor.role === 'Resident' && actor.flatId) {
    rows = rows.filter(function (c) { return c.FlatID === actor.flatId; });
  }
  return rows.reverse();
}

function Complaints_create(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  if (!payload || !payload.subject || !payload.description) {
    throw new Error('Complaint subject and description are required.');
  }
  var db = Database_getSpreadsheet();
  var flatId = actor.role === 'Resident' && actor.flatId ? actor.flatId : payload.flatId;
  var flats = Database_readTable(db, 'Flats');
  var flat = flats.filter(function (f) { return f.FlatID === flatId; })[0];
  if (!flat) throw new Error('Authorized flat not found.');

  var sheet = db.getSheetByName('Complaints');
  var id = 'CMP-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHHmmss');
  var now = new Date().toISOString();
  sheet.appendRow([
    id, flat.FlatID, flat.FlatNumber, flat.OwnerName,
    payload.category || 'Common Area', payload.subject, payload.description,
    payload.priority || 'Normal', 'Open', 'Pending Assignment', '', now, now
  ]);
  Database_appendAudit(db, actor.name, actor.role, 'COMPLAINT_LOGGED', 'Complaints', id, 'Flat ' + flat.FlatNumber + ': ' + payload.subject);
  return { complaintId: id };
}

function Complaints_updateStatus(complaintId, status, assignedTo, resolutionNotes) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('Complaints');
  var rows = Database_readTable(db, 'Complaints');
  var match = rows.filter(function (c) { return c.ComplaintID === complaintId; })[0];
  if (!match) throw new Error('Complaint ticket not found.');

  sheet.getRange(match._rowIndex, 9, 1, 5).setValues([[
    status || match.Status,
    assignedTo || match.AssignedTo,
    resolutionNotes || match.ResolutionNotes,
    match.CreatedAt,
    new Date().toISOString()
  ]]);
  Database_appendAudit(db, actor.name, actor.role, 'COMPLAINT_UPDATED', 'Complaints', complaintId, 'Status -> ' + status);
  return { ok: true };
}
