/**
 * Smart Society — Maintenance Billing Engine
 * Supports monthly billing, 50% door-lock discounts, special concessions, and duplicate-bill protection.
 */

function Billing_listByMonth(billingMonth) {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var bills = Database_readTable(db, 'Maintenance');
  if (actor.role === 'Resident' && actor.flatId) {
    bills = bills.filter(function (b) { return b.FlatID === actor.flatId; });
  }
  if (billingMonth) {
    bills = bills.filter(function (b) { return b.BillingMonth === billingMonth; });
  }
  return bills;
}

function Billing_generateMonthlyBills(billingMonth) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!billingMonth || !/^\d{4}-\d{2}$/.test(billingMonth)) {
    throw new Error('Billing month must be in YYYY-MM format.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var db = Database_getSpreadsheet();
    var flats = Database_readTable(db, 'Flats').filter(function (f) { return f.Active === true || f.Active === 'TRUE'; });
    var existingBills = Database_readTable(db, 'Maintenance').filter(function (b) { return b.BillingMonth === billingMonth; });
    var existingFlatSet = {};
    existingBills.forEach(function (b) { existingFlatSet[b.FlatID] = true; });

    var settings = Database_getPublicSettings();
    var baseRate = Number(settings.StandardMonthlyRate || 1200);
    var doorLockPct = Number(settings.DoorLockDiscountPercent || 50);

    var toCreate = [];
    var now = new Date().toISOString();
    flats.forEach(function (f) {
      if (existingFlatSet[f.FlatID]) return;
      var doorLock = (f.DoorLockActive === true || f.DoorLockActive === 'TRUE') ? Math.round(baseRate * doorLockPct / 100) : 0;
      var special = doorLock > 0 ? 0 : Math.min(baseRate, Number(f.SpecialDiscountAmount || 0));
      var net = Math.max(0, baseRate - doorLock - special);
      var billId = 'BILL-' + billingMonth.replace('-', '') + '-' + f.FlatNumber;
      toCreate.push([
        billId, f.FlatID, f.FlatNumber, f.OwnerName, billingMonth,
        baseRate, doorLock, special, 0, net, 0, net, 'Unpaid',
        now, actor.name, doorLock > 0 ? '50% Door-lock concession' : (special > 0 ? f.SpecialDiscountReason : 'Standard monthly maintenance')
      ]);
    });

    if (toCreate.length === 0) {
      throw new Error('Duplicate bill prevention: All active flats are already billed for ' + billingMonth + '.');
    }

    var sheet = db.getSheetByName('Maintenance');
    sheet.getRange(sheet.getLastRow() + 1, 1, toCreate.length, 16).setValues(toCreate);
    Database_appendAudit(db, actor.name, actor.role, 'BILL_RUN_GENERATED', 'Maintenance', billingMonth, 'Generated ' + toCreate.length + ' bills for ' + billingMonth);
    return { createdCount: toCreate.length, billingMonth: billingMonth };
  } finally {
    lock.releaseLock();
  }
}
