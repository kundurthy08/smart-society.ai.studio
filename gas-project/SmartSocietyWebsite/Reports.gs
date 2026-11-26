/**
 * Smart Society — Financial Reports Engine
 * Computes all reports strictly from posted source sheets.
 */

function Reports_get(reportType, filters) {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var month = filters && filters.month ? filters.month : '';
  var flatId = actor.role === 'Resident' && actor.flatId ? actor.flatId : (filters && filters.flatId ? filters.flatId : '');

  var bills = Database_readTable(db, 'Maintenance');
  var receipts = Database_readTable(db, 'Receipts');

  if (flatId) {
    bills = bills.filter(function (b) { return b.FlatID === flatId; });
    receipts = receipts.filter(function (r) { return r.FlatID === flatId; });
  }
  if (month) {
    bills = bills.filter(function (b) { return b.BillingMonth === month; });
  }

  if (reportType === 'receipt_register') return receipts;
  if (reportType === 'outstanding_dues') {
    return bills.filter(function (b) { return Number(b.BalanceDue) > 0; });
  }
  if (reportType === 'discount_report') {
    return bills.filter(function (b) { return Number(b.DoorLockDiscount) + Number(b.SpecialDiscount) > 0; });
  }
  return bills;
}
