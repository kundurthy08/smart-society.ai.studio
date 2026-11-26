/**
 * Smart Society — Payment Entry, Single-Payment Multi-Month Allocation & Reversal Engine
 */

function Payments_list() {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var payments = Database_readTable(db, 'Payments');
  if (actor.role === 'Resident' && actor.flatId) {
    payments = payments.filter(function (p) { return p.FlatID === actor.flatId; });
  }
  return payments.reverse();
}

function Payments_record(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.flatId || !payload.amount || Number(payload.amount) <= 0) {
    throw new Error('Flat and valid positive payment amount are required.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var db = Database_getSpreadsheet();
    var flats = Database_readTable(db, 'Flats');
    var flat = flats.filter(function (f) { return f.FlatID === payload.flatId || f.FlatNumber === payload.flatNumber; })[0];
    if (!flat) throw new Error('Flat not found.');

    var payments = Database_readTable(db, 'Payments');
    var bankRef = String(payload.bankReference || '').trim();
    if (bankRef && payload.paymentMethod !== 'Cash') {
      var dup = payments.some(function (p) {
        return p.Status !== 'Reversed' && String(p.BankReference).toLowerCase() === bankRef.toLowerCase();
      });
      if (dup) throw new Error('Duplicate transaction blocked: Bank reference already recorded.');
    }

    var paySeq = ('0000' + (payments.length + 1)).slice(-4);
    var paymentId = 'PAY-2026-' + paySeq;
    var isConfirmed = payload.mode === 'confirm' || payload.mode === 'confirm_and_receipt';
    var targetMonths = Array.isArray(payload.targetMonths) ? payload.targetMonths : [];
    var amount = Number(payload.amount);
    var receiptNumber = '';

    var paymentSheet = db.getSheetByName('Payments');
    var now = new Date().toISOString();

    if (isConfirmed) {
      var allocResult = Payments_allocateToBills_(db, paymentId, flat.FlatID, amount, targetMonths);
      var receipt = Receipts_createAndStorePdf_(db, {
        paymentId: paymentId,
        flatId: flat.FlatID,
        flatNumber: flat.FlatNumber,
        ownerName: flat.OwnerName,
        receiptDate: payload.paymentDate || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'),
        amount: amount,
        paymentMethod: payload.paymentMethod || 'UPI',
        bankReference: bankRef || ('REF-' + paySeq),
        periods: allocResult.coveredMonths.join(', ') || targetMonths.join(', '),
        allocations: allocResult.allocations,
        issuedBy: actor.name
      });
      receiptNumber = receipt.receiptNumber;
    }

    paymentSheet.appendRow([
      paymentId,
      flat.FlatID,
      flat.FlatNumber,
      flat.OwnerName,
      payload.paymentDate || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'),
      now,
      amount,
      payload.paymentMethod || 'UPI',
      bankRef || ('REF-' + paySeq),
      payload.bankDate || payload.paymentDate || '',
      targetMonths.join(', '),
      String(payload.remarks || ''),
      isConfirmed ? 'Confirmed' : 'Draft',
      receiptNumber,
      isConfirmed ? actor.name : '',
      flat.FlatID + '-' + amount + '-' + (bankRef || paySeq)
    ]);

    Database_appendAudit(db, actor.name, actor.role, isConfirmed ? 'PAYMENT_CONFIRMED' : 'PAYMENT_DRAFT', 'Payments', paymentId, 'Recorded ₹' + amount + ' for Flat ' + flat.FlatNumber);
    return { paymentId: paymentId, status: isConfirmed ? 'Confirmed' : 'Draft', receiptNumber: receiptNumber };
  } finally {
    lock.releaseLock();
  }
}

function Payments_allocateToBills_(db, paymentId, flatId, amount, targetMonths) {
  var billsSheet = db.getSheetByName('Maintenance');
  var allocSheet = db.getSheetByName('Allocations');
  var bills = Database_readTable(db, 'Maintenance').filter(function (b) {
    return b.FlatID === flatId && Number(b.BalanceDue) > 0 && (targetMonths.length === 0 || targetMonths.indexOf(b.BillingMonth) !== -1);
  }).sort(function (a, b) {
    return String(a.BillingMonth).localeCompare(String(b.BillingMonth));
  });

  var remaining = amount;
  var existingAllocCount = Database_readTable(db, 'Allocations').length;
  var createdAllocs = [];
  var coveredMonths = [];

  bills.forEach(function (bill) {
    if (remaining <= 0) return;
    var due = Number(bill.BalanceDue);
    var allocAmt = Math.min(remaining, due);
    if (allocAmt > 0) {
      existingAllocCount += 1;
      var allocId = 'ALC-' + ('0000' + existingAllocCount).slice(-4);
      allocSheet.appendRow([allocId, paymentId, bill.BillID, flatId, bill.BillingMonth, allocAmt]);
      var newAllocated = Number(bill.AllocatedAmount) + allocAmt;
      var newDue = Math.max(0, Number(bill.NetAmount) - newAllocated);
      var newStatus = newDue === 0 ? 'Paid' : 'Partial';
      billsSheet.getRange(bill._rowIndex, 11, 1, 3).setValues([[newAllocated, newDue, newStatus]]);
      createdAllocs.push({ billingMonth: bill.BillingMonth, allocatedAmount: allocAmt });
      coveredMonths.push(bill.BillingMonth);
      remaining -= allocAmt;
    }
  });

  return { allocations: createdAllocs, coveredMonths: coveredMonths };
}
