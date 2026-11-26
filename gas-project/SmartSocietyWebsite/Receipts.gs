/**
 * Smart Society — Receipt Registry & Google Drive PDF Generator
 */

function Receipts_list() {
  var actor = Auth_requireRole(['President', 'Treasurer', 'Resident']);
  var db = Database_getSpreadsheet();
  var receipts = Database_readTable(db, 'Receipts');
  if (actor.role === 'Resident' && actor.flatId) {
    receipts = receipts.filter(function (r) { return r.FlatID === actor.flatId; });
  }
  return receipts.reverse();
}

function Receipts_createAndStorePdf_(db, data) {
  var settings = Database_getPublicSettings();
  var receiptsSheet = db.getSheetByName('Receipts');
  var seq = ('0000' + (Database_readTable(db, 'Receipts').length + 1)).slice(-4);
  var receiptId = 'REC-2026-' + seq;
  var receiptNumber = (settings.ReceiptPrefix || 'RCP-2026') + '-' + seq;

  // Create formatted Google Doc and convert to PDF in Google Drive
  var folderName = 'Smart_Society_Receipts';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var doc = DocumentApp.create(receiptNumber + '_Flat_' + data.flatNumber);
  var body = doc.getBody();
  body.appendParagraph(settings.SocietyName || 'Smart Society Welfare Association').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('OFFICIAL MAINTENANCE PAYMENT RECEIPT').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Receipt No: ' + receiptNumber + '   |   Date: ' + data.receiptDate);
  body.appendParagraph('Flat Number: ' + data.flatNumber + '   |   Owner: ' + data.ownerName);
  body.appendParagraph('Amount Received: INR ' + Number(data.amount).toLocaleString('en-IN') + '.00');
  body.appendParagraph('Payment Mode: ' + data.paymentMethod + '   |   Reference: ' + data.bankReference);
  body.appendParagraph('Maintenance Period(s): ' + data.periods);
  body.appendParagraph('Issued By: ' + data.issuedBy);
  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs('application/pdf').setName(receiptNumber + '-Flat-' + data.flatNumber + '.pdf');
  var pdfFile = folder.createFile(pdfBlob);
  pdfFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  docFile.setTrashed(true);

  var pdfUrl = pdfFile.getUrl();
  receiptsSheet.appendRow([
    receiptId, receiptNumber, data.receiptDate, data.paymentId,
    data.flatId, data.flatNumber, data.ownerName, data.amount,
    data.paymentMethod, data.bankReference, data.periods, pdfUrl, 'Active', data.issuedBy
  ]);

  return { receiptId: receiptId, receiptNumber: receiptNumber, pdfUrl: pdfUrl };
}
