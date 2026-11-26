/**
 * Smart Society 3.0 — Website Content Management (Draft / Preview / Publish)
 */

function WebsiteContent_getPublic(previewDraft) {
  var db = Database_getSpreadsheet();
  var rows = Database_readTable(db, 'CommunityProfile');
  var result = {};
  rows.forEach(function (r) {
    result[r.Key] = previewDraft && r.DraftValue ? r.DraftValue : r.PublishedValue;
  });
  return result;
}

function WebsiteContent_saveDraft(payload, publishNow) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('CommunityProfile');
  var rows = Database_readTable(db, 'CommunityProfile');
  var now = new Date().toISOString();

  Object.keys(payload || {}).forEach(function (key) {
    var val = String(payload[key] || '');
    var existing = rows.filter(function (r) { return r.Key === key; })[0];
    if (existing) {
      sheet.getRange(existing._rowIndex, 2, 1, 3).setValues([[
        publishNow ? val : existing.PublishedValue,
        val,
        now
      ]]);
    } else {
      sheet.appendRow([key, publishNow ? val : '', val, now]);
    }
  });

  Database_appendAudit(
    db,
    actor.name,
    actor.role,
    publishNow ? 'WEBSITE_PUBLISHED' : 'WEBSITE_DRAFT_SAVED',
    'CommunityProfile',
    'PUBLIC',
    (publishNow ? 'Published' : 'Saved draft') + ' website content updates'
  );
  return { ok: true, published: Boolean(publishNow) };
}
