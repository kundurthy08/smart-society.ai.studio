/**
 * Smart Society Website — Entry Point & Web App Router
 */

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  var userContext = Auth_getCurrentUser();
  template.initialUserJson = JSON.stringify(userContext);
  template.publicSettingsJson = JSON.stringify(Database_getPublicSettings());

  return template
    .evaluate()
    .setTitle('Smart Society — Apartment Maintenance Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardData(billingMonth) {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var flats = Database_readTable(db, 'Flats').filter(function (f) { return f.Active === true || f.Active === 'TRUE'; });
  var bills = Database_readTable(db, 'Maintenance');
  var payments = Database_readTable(db, 'Payments');

  if (actor.role === 'Resident' && actor.flatId) {
    flats = flats.filter(function (f) { return f.FlatID === actor.flatId; });
    bills = bills.filter(function (b) { return b.FlatID === actor.flatId; });
    payments = payments.filter(function (p) { return p.FlatID === actor.flatId; });
  }

  var month = billingMonth || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM');
  var monthBills = bills.filter(function (b) { return b.BillingMonth === month; });
  var priorBills = bills.filter(function (b) { return b.BillingMonth < month; });

  var monthlyDemandNet = monthBills.reduce(function (s, b) { return s + Number(b.NetAmount || 0); }, 0);
  var monthlyCollections = monthBills.reduce(function (s, b) { return s + Number(b.AllocatedAmount || 0); }, 0);
  var currentOutstanding = monthBills.reduce(function (s, b) { return s + Number(b.BalanceDue || 0); }, 0);
  var priorArrears = priorBills.reduce(function (s, b) { return s + Number(b.BalanceDue || 0); }, 0);

  return {
    selectedMonth: month,
    totalFlats: flats.length,
    monthlyDemandNet: monthlyDemandNet,
    monthlyCollections: monthlyCollections,
    currentOutstanding: currentOutstanding,
    priorArrears: priorArrears,
    totalOutstanding: currentOutstanding + priorArrears,
    recentPayments: payments.slice(-8).reverse(),
    outstandingFlats: flats.map(function (f) {
      var fBills = bills.filter(function (b) { return b.FlatID === f.FlatID && Number(b.BalanceDue) > 0; });
      var due = fBills.reduce(function (s, b) { return s + Number(b.BalanceDue || 0); }, 0);
      return {
        flatId: f.FlatID,
        flatNumber: f.FlatNumber,
        ownerName: f.OwnerName,
        totalDue: due,
        unpaidMonths: fBills.map(function (b) { return b.BillingMonth; }).join(', ')
      };
    }).filter(function (r) { return r.totalDue > 0; })
  };
}

function submitPublicContact(payload) {
  if (!payload || !payload.name || !payload.email || !payload.message) {
    throw new Error('Name, email, and message are required.');
  }
  var db = Database_getSpreadsheet();
  Database_appendAudit(db, payload.name, 'Public Visitor', 'CONTACT_INQUIRY', 'Contact', payload.email, payload.subject + ': ' + payload.message);
  return { ok: true, message: 'Thank you. Your inquiry has been logged for the association committee.' };
}
