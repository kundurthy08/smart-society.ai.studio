/**
 * Smart Society 3.0 — Photo Gallery (Google Drive storage + Sheets metadata)
 */

function Gallery_list() {
  var db = Database_getSpreadsheet();
  return Database_readTable(db, 'Gallery').sort(function (a, b) {
    return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
  });
}

function Gallery_uploadPhoto(payload) {
  var actor = Auth_requireRole(['President', 'Treasurer']);
  if (!payload || !payload.title || !payload.base64Data) {
    throw new Error('Photo title and image data are required.');
  }

  var folderName = 'HappyHomesPalaceB_Gallery';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var parts = String(payload.base64Data).split(',');
  var contentType = 'image/jpeg';
  var b64 = parts[parts.length - 1];
  if (parts[0] && parts[0].indexOf('png') !== -1) contentType = 'image/png';

  var blob = Utilities.newBlob(Utilities.base64Decode(b64), contentType, payload.fileName || (payload.title + '.jpg'));
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var viewUrl = 'https://drive.google.com/uc?export=view&id=' + file.getId();

  var db = Database_getSpreadsheet();
  var sheet = db.getSheetByName('Gallery');
  var id = 'GAL-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMddHHmmss');
  sheet.appendRow([
    id, payload.title, payload.description || '', payload.category || 'Our Apartment',
    payload.date || Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd'),
    Number(payload.order || 99), Boolean(payload.featured), false, file.getId(), viewUrl
  ]);

  Database_appendAudit(db, actor.name, actor.role, 'GALLERY_ADDED', 'Gallery', id, 'Uploaded gallery photo: ' + payload.title);
  return { photoId: id, imageUrl: viewUrl };
}
