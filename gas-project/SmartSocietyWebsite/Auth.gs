/**
 * Smart Society — Server-Side Role Verification & Authorization
 * Enforces Google Session identity against the Users sheet.
 */

function Auth_getCurrentUser() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    return {
      authenticated: false,
      email: '',
      name: 'Guest Visitor',
      role: 'Public',
      flatId: ''
    };
  }

  var db = Database_getSpreadsheet();
  var users = Database_readTable(db, 'Users');
  var match = users.filter(function (u) {
    return String(u.Email || '').toLowerCase() === email.toLowerCase() && (u.Active === true || u.Active === 'TRUE');
  })[0];

  if (!match) {
    return {
      authenticated: true,
      email: email,
      name: email.split('@')[0],
      role: 'Unassigned',
      flatId: ''
    };
  }

  return {
    authenticated: true,
    userId: match.UserID,
    email: match.Email,
    name: match.Name,
    role: match.Role, // President, Treasurer, Resident
    flatId: match.FlatID || ''
  };
}

function Auth_requireRole(allowedRoles) {
  var user = Auth_getCurrentUser();
  if (!user.authenticated || !user.email) {
    throw new Error('Authentication required: Unable to establish verified user identity under current Web App execution settings.');
  }
  if (allowedRoles.indexOf(user.role) === -1) {
    throw new Error('Access denied: Role "' + user.role + '" is not authorized for this action.');
  }
  return user;
}
