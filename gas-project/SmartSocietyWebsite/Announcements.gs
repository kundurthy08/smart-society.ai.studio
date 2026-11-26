/**
 * Smart Society 3.0 — Public Announcements & Community Events
 */

function Announcements_listPublic() {
  var db = Database_getSpreadsheet();
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  return Database_readTable(db, 'Announcements').filter(function (a) {
    var pub = a.Published === true || a.Published === 'TRUE';
    var isPublic = String(a.Audience || 'Public') === 'Public';
    var notExpired = !a.ExpiryDate || String(a.ExpiryDate) >= today;
    return pub && isPublic && notExpired;
  }).reverse();
}

function Announcements_listAllForResident() {
  Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  return Database_readTable(db, 'Announcements').filter(function (a) {
    return a.Published === true || a.Published === 'TRUE';
  }).reverse();
}

function Announcements_publish(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.title || !payload.summary) {
    throw new Error('Title and summary are required.');
  }
  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('Announcements');
  var id = 'ANN-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHHmmss');
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  sheet.appendRow([
    id, payload.title, payload.category || 'Common area',
    payload.priority || 'General', payload.summary, payload.body || payload.summary,
    payload.publishDate || today, payload.expiryDate || '2027-12-31',
    payload.audience || 'Public', true
  ]);
  Database_appendAudit(db, actor.name, actor.role, 'ANNOUNCEMENT_PUBLISHED', 'Announcements', id, 'Published: ' + payload.title);
  return { announcementId: id };
}

function Events_listPublic() {
  var db = Database_getSpreadsheet();
  return Database_readTable(db, 'Events').filter(function (e) {
    return e.Published === true || e.Published === 'TRUE';
  }).reverse();
}

function Events_create(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.title || !payload.date) {
    throw new Error('Event title and date are required.');
  }
  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('Events');
  var id = 'EVT-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHHmmss');
  sheet.appendRow([
    id, payload.title, payload.date, payload.time || '5:00 PM',
    payload.location || 'Community Courtyard', payload.description || '',
    payload.status || 'Upcoming', Boolean(payload.featured), true
  ]);
  Database_appendAudit(db, actor.name, actor.role, 'EVENT_CREATED', 'Events', id, 'Created event: ' + payload.title);
  return { eventId: id };
}
