/**
 * Smart Society 3.0 — Google Sheets Database Engine (Smart_Society_Database)
 * Manages all Community Website + Resident + Financial worksheets cleanly.
 */

var DB_NAME = 'Smart_Society_Database';

var SCHEMA_TABS = {
  WebsiteSettings: ['Key', 'Value', 'UpdatedAt'],
  CommunityProfile: ['Key', 'PublishedValue', 'DraftValue', 'UpdatedAt'],
  Committee: ['MemberID', 'Name', 'Designation', 'Intro', 'Term', 'SortOrder', 'Published'],
  Gallery: ['PhotoID', 'Title', 'Description', 'Category', 'PhotoDate', 'SortOrder', 'Featured', 'IsPlaceholder', 'DriveFileId', 'ImageUrl'],
  Announcements: ['AnnouncementID', 'Title', 'Category', 'Priority', 'Summary', 'Body', 'PublishDate', 'ExpiryDate', 'Audience', 'Published'],
  Events: ['EventID', 'Title', 'EventDate', 'EventTime', 'Location', 'Description', 'Status', 'Featured', 'Published'],
  ContactMessages: ['ContactID', 'Name', 'Email', 'Phone', 'FlatNumber', 'Subject', 'Message', 'SubmittedAt'],
  Flats: ['FlatID', 'FlatNumber', 'Floor', 'AreaSqFt', 'OwnerName', 'Mobile', 'Email', 'MaintenanceCategory', 'OccupancyStatus', 'DoorLockActive', 'SpecialDiscountAmount', 'SpecialDiscountReason', 'Active', 'IsSampleData', 'UpdatedAt'],
  Residents: ['ResidentID', 'FlatID', 'FullName', 'Relation', 'VerifiedContact', 'Active'],
  FlatAccess: ['AccessID', 'UserID', 'FlatID', 'PermissionLevel', 'GrantedAt'],
  Maintenance: ['BillID', 'FlatID', 'FlatNumber', 'OwnerName', 'BillingMonth', 'GrossAmount', 'DoorLockDiscount', 'SpecialDiscount', 'OtherCharges', 'NetAmount', 'AllocatedAmount', 'BalanceDue', 'Status', 'GeneratedAt', 'GeneratedBy', 'Notes'],
  Payments: ['PaymentID', 'FlatID', 'FlatNumber', 'OwnerName', 'PaymentDate', 'EntryDate', 'Amount', 'PaymentMethod', 'BankReference', 'BankDate', 'TargetMonths', 'Remarks', 'Status', 'ReceiptNumber', 'VerifiedBy', 'IdempotencyKey'],
  Allocations: ['AllocationID', 'PaymentID', 'BillID', 'FlatID', 'BillingMonth', 'AllocatedAmount'],
  Receipts: ['ReceiptID', 'ReceiptNumber', 'ReceiptDate', 'PaymentID', 'FlatID', 'FlatNumber', 'OwnerName', 'AmountReceived', 'PaymentMethod', 'BankReference', 'MaintenancePeriod', 'PdfFileUrl', 'Status', 'IssuedBy'],
  Complaints: ['ComplaintID', 'FlatID', 'FlatNumber', 'ResidentName', 'Category', 'Subject', 'Description', 'Priority', 'Status', 'AssignedTo', 'ResolutionNotes', 'CreatedAt', 'UpdatedAt'],
  Settings: ['Key', 'Value', 'EffectiveFrom', 'UpdatedAt'],
  Users: ['UserID', 'Name', 'Email', 'Role', 'FlatID', 'Active'],
  AuditLog: ['AuditID', 'Timestamp', 'ActorName', 'ActorRole', 'Action', 'EntityType', 'EntityID', 'Summary']
};

function Database_getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var fileId = props.getProperty('SMART_SOCIETY_SHEET_ID');
  var ss = null;

  if (fileId) {
    try { ss = SpreadsheetApp.openById(fileId); } catch (err) { ss = null; }
  }

  if (!ss) {
    var files = DriveApp.getFilesByName(DB_NAME);
    if (files.hasNext()) {
      ss = SpreadsheetApp.open(files.next());
    } else {
      ss = SpreadsheetApp.create(DB_NAME);
      Database_initializeSchemaAndSeed(ss);
    }
    props.setProperty('SMART_SOCIETY_SHEET_ID', ss.getId());
  }
  return ss;
}

function Database_initializeSchemaAndSeed(ss) {
  Object.keys(SCHEMA_TABS).forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SCHEMA_TABS[tabName]);
      sheet.setFrozenRows(1);
    }
  });

  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  var now = new Date().toISOString();
  var profileSheet = ss.getSheetByName('CommunityProfile');
  if (profileSheet.getLastRow() === 1) {
    profileSheet.getRange(2, 1, 4, 4).setValues([
      ['AssociationName', 'HAPPY HOMES PALACE-B', 'HAPPY HOMES PALACE-B', now],
      ['Subtitle', 'Owners Welfare Association', 'Owners Welfare Association', now],
      ['HeroTitle', 'WELCOME TO HAPPY HOMES PALACE-B', 'WELCOME TO HAPPY HOMES PALACE-B', now],
      ['HeroTagline', 'More Than an Apartment. A Place to Belong.', 'More Than an Apartment. A Place to Belong.', now]
    ]);
  }

  var settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet.getLastRow() === 1) {
    settingsSheet.getRange(2, 1, 5, 4).setValues([
      ['SocietyName', 'HAPPY HOMES PALACE-B Owners Welfare Association', '2026-01', now],
      ['StandardMonthlyRate', '1200', '2026-01', now],
      ['DoorLockDiscountPercent', '50', '2026-01', now],
      ['ReceiptPrefix', 'RCP-2026', '2026-01', now],
      ['ContactEmail', 'office@happyhomespalaceb.example.in', '2026-01', now]
    ]);
  }

  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() === 1) {
    var adminEmail = Session.getActiveUser().getEmail() || 'admin@example.com';
    usersSheet.appendRow(['USR-001', 'Society Administrator', adminEmail, 'President', '', true]);
  }

  var flatsSheet = ss.getSheetByName('Flats');
  if (flatsSheet.getLastRow() === 1) {
    var pilotFlats = [
      ['FLT-101', '101', '1st Floor', 1250, 'Raghavendra Kulkarni', '+91 98450 11201', 'raghav@example.in', 'Standard', 'Occupied', false, 0, '', true, true, now],
      ['FLT-102', '102', '1st Floor', 1250, 'Meenakshi Sundaram', '+91 98450 11202', 'meenakshi@example.in', 'Standard', 'Occupied', false, 0, '', true, true, now],
      ['FLT-103', '103', '1st Floor', 1180, 'Arvind Deshmukh', '+91 98450 11203', 'arvind@example.in', 'Door-Lock (50%)', 'Vacant / Door-Lock', true, 0, '50% door-lock concession', true, true, now],
      ['FLT-104', '104', '1st Floor', 1250, 'Priya Nair', '+91 98450 11204', 'priya@example.in', 'Special Concession', 'Occupied', false, 200, 'Senior citizen concession', true, true, now],
      ['FLT-105', '105', '2nd Floor', 1320, 'Suresh Babu Rao', '+91 98450 11205', 'suresh@example.in', 'Standard', 'Occupied', false, 0, '', true, true, now],
      ['FLT-106', '106', '2nd Floor', 1250, 'Ananya Chatterjee', '+91 98450 11206', 'ananya@example.in', 'Standard', 'Occupied', false, 0, '', true, true, now],
      ['FLT-107', '107', '2nd Floor', 1250, 'Vikramaditya Joshi', '+91 98450 11207', 'vikram@example.in', 'Standard', 'Tenant', false, 0, '', true, true, now],
      ['FLT-108', '108', '2nd Floor', 1180, 'Kavitha Reddy', '+91 98450 11208', 'kavitha@example.in', 'Door-Lock (50%)', 'Vacant / Door-Lock', true, 0, '50% door-lock concession', true, true, now],
      ['FLT-109', '109', '3rd Floor', 1320, 'Harishankar Menon', '+91 98450 11209', 'hari@example.in', 'Special Concession', 'Occupied', false, 100, 'Meter credit ₹100', true, true, now],
      ['FLT-110', '110', '3rd Floor', 1250, 'Deepika Sharma', '+91 98450 11210', 'deepika@example.in', 'Standard', 'Occupied', false, 0, '', true, true, now]
    ];
    flatsSheet.getRange(2, 1, pilotFlats.length, SCHEMA_TABS.Flats.length).setValues(pilotFlats);
  }
}

function Database_readTable(ss, tabName) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = { _rowIndex: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function Database_appendAudit(ss, actorName, actorRole, action, entityType, entityId, summary) {
  var sheet = ss.getSheetByName('AuditLog');
  var id = 'AUD-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHHmmss');
  sheet.appendRow([id, new Date().toISOString(), actorName, actorRole, action, entityType, entityId, summary]);
}

function Database_getPublicSettings() {
  var ss = Database_getSpreadsheet();
  var rows = Database_readTable(ss, 'Settings');
  var out = {};
  rows.forEach(function (r) { out[r.Key] = r.Value; });
  return out;
}
