/**
 * Smart Society — Flat Register CRUD Operations
 */

function Flats_list() {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var flats = Database_readTable(db, 'Flats');
  if (actor.role === 'Resident' && actor.flatId) {
    flats = flats.filter(function (f) { return f.FlatID === actor.flatId; });
  }
  return flats;
}

function Flats_save(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.flatNumber || !payload.ownerName || !payload.mobile) {
    throw new Error('Flat Number, Owner Name, and Mobile Number are required.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var db = Database_getSpreadsheet();
    var sheet = db.getSheetByName('Flats');
    var flats = Database_readTable(db, 'Flats');
    var now = new Date().toISOString();
    var doorLock = Boolean(payload.doorLockActive) || payload.occupancyStatus === 'Vacant / Door-Lock';
    var special = doorLock ? 0 : Math.max(0, Number(payload.specialDiscountAmount || 0));
    var category = doorLock ? 'Door-Lock (50%)' : (special > 0 ? 'Special Concession' : 'Standard');

    if (payload.flatId) {
      var existing = flats.filter(function (f) { return f.FlatID === payload.flatId; })[0];
      if (!existing) throw new Error('Flat not found.');
      sheet.getRange(existing._rowIndex, 1, 1, 15).setValues([[
        existing.FlatID,
        String(payload.flatNumber).trim(),
        String(payload.floor || existing.Floor),
        Number(payload.areaSqFt || existing.AreaSqFt),
        String(payload.ownerName).trim(),
        String(payload.mobile).trim(),
        String(payload.email || ''),
        category,
        payload.occupancyStatus || existing.OccupancyStatus,
        doorLock,
        special,
        String(payload.specialDiscountReason || ''),
        payload.active !== false,
        existing.IsSampleData,
        now
      ]]);
      Database_appendAudit(db, actor.name, actor.role, 'FLAT_UPDATED', 'Flats', existing.FlatID, 'Updated flat ' + payload.flatNumber);
      return { flatId: existing.FlatID, status: 'updated' };
    }

    var dup = flats.some(function (f) { return String(f.FlatNumber).toLowerCase() === String(payload.flatNumber).trim().toLowerCase(); });
    if (dup) throw new Error('Flat ' + payload.flatNumber + ' already exists.');

    var newId = 'FLT-' + String(payload.flatNumber).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    sheet.appendRow([
      newId,
      String(payload.flatNumber).trim(),
      String(payload.floor || '1st Floor'),
      Number(payload.areaSqFt || 1250),
      String(payload.ownerName).trim(),
      String(payload.mobile).trim(),
      String(payload.email || ''),
      category,
      payload.occupancyStatus || (doorLock ? 'Vacant / Door-Lock' : 'Occupied'),
      doorLock,
      special,
      String(payload.specialDiscountReason || ''),
      true,
      false,
      now
    ]);
    Database_appendAudit(db, actor.name, actor.role, 'FLAT_CREATED', 'Flats', newId, 'Added flat ' + payload.flatNumber);
    return { flatId: newId, status: 'created' };
  } finally {
    lock.releaseLock();
  }
}
