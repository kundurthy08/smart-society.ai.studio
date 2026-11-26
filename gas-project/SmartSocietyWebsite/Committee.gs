/**
 * Smart Society 3.0 — Association Committee Directory
 */

function Committee_listPublic() {
  var db = Database_getSpreadsheet();
  return Database_readTable(db, 'Committee').filter(function (m) {
    return m.Published === true || m.Published === 'TRUE';
  }).sort(function (a, b) {
    return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
  });
}

function Committee_saveMember(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.name || !payload.designation) {
    throw new Error('Member name and designation are required.');
  }
  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('Committee');
  var rows = Database_readTable(db, 'Committee');

  if (payload.memberId) {
    var existing = rows.filter(function (r) { return r.MemberID === payload.memberId; })[0];
    if (!existing) throw new Error('Committee member not found.');
    sheet.getRange(existing._rowIndex, 1, 1, 7).setValues([[
      existing.MemberID, payload.name, payload.designation,
      payload.intro || '', payload.term || '2025 - 2027',
      Number(payload.order || existing.SortOrder), payload.published !== false
    ]]);
    Database_appendAudit(db, actor.name, actor.role, 'COMMITTEE_UPDATED', 'Committee', existing.MemberID, 'Updated ' + payload.name);
    return { memberId: existing.MemberID };
  }

  var id = 'COM-' + ('000' + (rows.length + 1)).slice(-3);
  sheet.appendRow([id, payload.name, payload.designation, payload.intro || '', payload.term || '2025 - 2027', Number(payload.order || rows.length + 1), true]);
  Database_appendAudit(db, actor.name, actor.role, 'COMMITTEE_ADDED', 'Committee', id, 'Added ' + payload.name);
  return { memberId: id };
}
