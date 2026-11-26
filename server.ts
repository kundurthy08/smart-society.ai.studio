import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  appendAudit,
  generateReceiptPdfBuffer,
  getRateForMonth,
  hashActivationCode,
  hashPassword,
  isStrongResidentPassword,
  loadDatabase,
  normalizeMobile,
  pushNotification,
  readPrivateEvidenceFile,
  saveDatabase,
  savePrivateEvidenceFile,
  verifyPassword,
  type SocietyDatabase,
  type StoredUser,
} from './server/db.ts';
import type {
  Announcement,
  CommitteeMember,
  CommunityEvent,
  Complaint,
  ComplaintStatus,
  DashboardSummary,
  Flat,
  FlatAccessSummary,
  GalleryItem,
  LedgerEntry,
  MaintenanceBill,
  NotificationPreferences,
  PaymentAllocation,
  PaymentMethod,
  PaymentRecord,
  PaymentSubmission,
  ReceiptRecord,
  ResidentAccountSummary,
  UserSession,
} from './src/types/society.ts';

const PORT = 3000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface SessionRecord {
  userId: string;
  activeFlatId?: string;
  expiresAt: number;
}

const sessions = new Map<string, SessionRecord>();
const approvalInFlight = new Set<string>();
const authAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts = 12, windowMs = 5 * 60 * 1000): boolean {
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count += 1;
  return true;
}

function clearRateLimit(key: string): void {
  authAttempts.delete(key);
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    map[k] = v;
  }
  return map;
}

function getTokenFromRequest(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.ss_session) {
    return cookies.ss_session;
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

function setSessionCookie(req: express.Request, res: express.Response, token: string): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `ss_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: express.Request, res: express.Response): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = ['ss_session=', 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getAllowedFlatsForUser(db: SocietyDatabase, user: StoredUser): FlatAccessSummary[] {
  if (user.role !== 'resident') return [];
  const grants = db.flatAccess.filter((fa) => fa.userId === user.userId && fa.active);
  return grants.map((g) => ({
    flatId: g.flatId,
    flatNumber: g.flatNumber,
    relationship: g.relationship,
  }));
}

function buildUserSession(
  db: SocietyDatabase,
  user: StoredUser,
  preferredFlatId?: string
): UserSession {
  const allowedFlats = getAllowedFlatsForUser(db, user);
  const activeFlatId =
    user.role === 'resident'
      ? allowedFlats.find((f) => f.flatId === preferredFlatId)?.flatId ??
        allowedFlats.find((f) => f.flatId === user.flatId)?.flatId ??
        allowedFlats[0]?.flatId
      : undefined;

  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    roleLabel:
      user.role === 'resident' && allowedFlats.length > 0
        ? `Resident (${allowedFlats.map((f) => `Flat ${f.flatNumber}`).join(', ')})`
        : user.roleLabel,
    status: user.status,
    flatId: activeFlatId,
    allowedFlats,
    activeFlatId,
  };
}

function resolveSession(
  req: express.Request,
  db: SocietyDatabase
): { session: UserSession; token: string; record: SessionRecord } | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const record = sessions.get(token);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = db.users.find((u) => u.userId === record.userId);
  if (!user || user.status !== 'Active') {
    sessions.delete(token);
    return null;
  }
  const built = buildUserSession(db, user, record.activeFlatId);
  if (user.role === 'resident' && built.allowedFlats.length === 0) {
    return null;
  }
  return { session: built, token, record };
}

function revokeUserSessions(userId: string): void {
  for (const [tok, rec] of sessions.entries()) {
    if (rec.userId === userId) {
      sessions.delete(tok);
    }
  }
}

function getSession(req: express.Request): UserSession | null {
  const db = loadDatabase();
  return resolveSession(req, db)?.session ?? null;
}

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const db = loadDatabase();
  const resolved = resolveSession(req, db);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  (req as express.Request & { user: UserSession }).user = resolved.session;
  next();
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const db = loadDatabase();
  const resolved = resolveSession(req, db);
  if (!resolved) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const session = resolved.session;
  if (session.role !== 'president' && session.role !== 'treasurer') {
    res.status(403).json({
      error: 'Committee administrator privileges required for this operation.',
    });
    return;
  }
  (req as express.Request & { user: UserSession }).user = session;
  next();
}

function resolveAuthorizedFlatIds(
  db: SocietyDatabase,
  user: UserSession,
  requestedFlatParam?: string
):
  | { ok: true; flatIds: string[]; singleFlat?: Flat }
  | { ok: false; status: number; error: string } {
  const cleanParam = String(requestedFlatParam || '').trim();
  const requestedFlat = cleanParam
    ? db.flats.find(
        (f) =>
          f.flatId.toLowerCase() === cleanParam.toLowerCase() ||
          f.flatNumber.toLowerCase() === cleanParam.toLowerCase()
      )
    : undefined;

  if (user.role === 'resident') {
    const allowedIds = user.allowedFlats.map((f) => f.flatId);
    if (allowedIds.length === 0) {
      return {
        ok: false,
        status: 403,
        error: 'No active flat access is assigned to your account. Contact the Association Secretary.',
      };
    }
    if (cleanParam) {
      if (!requestedFlat || !allowedIds.includes(requestedFlat.flatId)) {
        return {
          ok: false,
          status: 403,
          error: 'Access denied: You are only permitted to access records for your authorized flat(s).',
        };
      }
      return { ok: true, flatIds: [requestedFlat.flatId], singleFlat: requestedFlat };
    }
    const defaultId = user.activeFlatId && allowedIds.includes(user.activeFlatId)
      ? user.activeFlatId
      : allowedIds[0];
    const defaultFlat = db.flats.find((f) => f.flatId === defaultId);
    return { ok: true, flatIds: [defaultId], singleFlat: defaultFlat };
  }

  // Admin scope
  if (cleanParam) {
    if (!requestedFlat) {
      return { ok: false, status: 404, error: 'Requested flat not found.' };
    }
    return { ok: true, flatIds: [requestedFlat.flatId], singleFlat: requestedFlat };
  }
  return { ok: true, flatIds: db.flats.filter((f) => f.active).map((f) => f.flatId) };
}

function isFlatAccessible(user: UserSession, flatId: string): boolean {
  if (user.role === 'president' || user.role === 'treasurer') return true;
  return user.allowedFlats.some((f) => f.flatId === flatId);
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function allocatePaymentToBills(
  db: SocietyDatabase,
  payment: PaymentRecord,
  targetMonths: string[]
): { allocations: PaymentAllocation[]; coveredMonths: string[] } {
  const candidateBills = db.maintenance
    .filter(
      (b) =>
        b.flatId === payment.flatId &&
        (targetMonths.length === 0 || targetMonths.includes(b.billingMonth)) &&
        b.balanceDue > 0
    )
    .sort((a, b) => a.billingMonth.localeCompare(b.billingMonth));

  let remaining = payment.amount;
  const createdAllocations: PaymentAllocation[] = [];
  const coveredMonths: string[] = [];

  for (const bill of candidateBills) {
    if (remaining <= 0) break;
    const allocAmount = Math.min(remaining, bill.balanceDue);
    if (allocAmount > 0) {
      const allocNum = String(db.allocations.length + createdAllocations.length + 1).padStart(4, '0');
      const alloc: PaymentAllocation = {
        allocationId: `ALC-${allocNum}`,
        paymentId: payment.paymentId,
        billId: bill.billId,
        flatId: payment.flatId,
        billingMonth: bill.billingMonth,
        allocatedAmount: allocAmount,
      };
      createdAllocations.push(alloc);
      coveredMonths.push(bill.billingMonth);
      remaining -= allocAmount;
    }
  }

  if (remaining > 0 && candidateBills.length > 0 && createdAllocations.length > 0) {
    createdAllocations[createdAllocations.length - 1].allocatedAmount += remaining;
    remaining = 0;
  }

  return { allocations: createdAllocations, coveredMonths };
}

function createReceiptForPayment(
  db: SocietyDatabase,
  payment: PaymentRecord,
  allocs: PaymentAllocation[],
  actorName: string
): ReceiptRecord {
  const nextNumber = db.receipts.length + 1;
  const seq = String(nextNumber).padStart(4, '0');
  const receiptNumber = `${db.settings.receiptPrefix}-${seq}`;
  const receiptId = `REC-2026-${seq}`;
  const periods =
    allocs.length > 0
      ? allocs.map((a) => a.billingMonth).join(', ')
      : payment.targetMonths.join(', ');

  const receipt: ReceiptRecord = {
    receiptId,
    receiptNumber,
    receiptDate: payment.paymentDate,
    paymentId: payment.paymentId,
    flatId: payment.flatId,
    flatNumber: payment.flatNumber,
    ownerName: payment.ownerName,
    amountReceived: payment.amount,
    paymentMethod: payment.paymentMethod,
    bankReference: payment.bankReference,
    maintenancePeriod: periods,
    allocations: allocs.map((a) => ({
      billingMonth: a.billingMonth,
      allocatedAmount: a.allocatedAmount,
    })),
    status: 'Active',
    issuedBy: actorName,
    createdAt: new Date().toISOString(),
  };

  db.receipts.unshift(receipt);
  payment.receiptId = receipt.receiptId;
  payment.receiptNumber = receipt.receiptNumber;
  return receipt;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // =========================================================================
  // AREA A: PUBLIC COMMUNITY WEBSITE API (strictly non-financial, public only)
  // =========================================================================
  app.get('/api/public/home', (req, res) => {
    const db = loadDatabase();
    const session = getSession(req);
    const previewDraft =
      req.query.preview === 'draft' &&
      session &&
      (session.role === 'president' || session.role === 'treasurer');

    const today = new Date().toISOString().slice(0, 10);
    const content = previewDraft ? db.website.draft : db.website.published;

    const committee = [...db.committee]
      .filter((c) => c.published)
      .sort((a, b) => a.order - b.order);

    const gallery = [...db.gallery].sort((a, b) => a.order - b.order);

    const announcements = db.announcements
      .filter(
        (a) =>
          a.published &&
          a.audience === 'Public' &&
          (!a.expiryDate || a.expiryDate >= today)
      )
      .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

    const events = db.events
      .filter((e) => e.published)
      .sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      content,
      isPreviewDraft: Boolean(previewDraft),
      contact: {
        address: db.settings.address,
        email: db.settings.contactEmail,
        phone: db.settings.contactPhone,
        officeHours: db.settings.officeHours,
        registrationNumber: db.settings.registrationNumber,
      },
      committee,
      gallery,
      announcements,
      events,
    });
  });

  app.get('/api/public/info', (_req, res) => {
    const db = loadDatabase();
    res.json({
      societyName: db.settings.societyName,
      registrationNumber: db.settings.registrationNumber,
      address: db.settings.address,
      contactEmail: db.settings.contactEmail,
      contactPhone: db.settings.contactPhone,
      officeHours: db.settings.officeHours,
      standardMonthlyRate: db.settings.standardMonthlyRate,
      doorLockDiscountPercent: db.settings.doorLockDiscountPercent,
      pilotFlatsCount: db.flats.filter((f) => f.active).length,
    });
  });

  app.post('/api/contact', (req, res) => {
    const { name, email, phone, flatNumber, subject, message, honeypot } = req.body ?? {};
    if (honeypot) {
      res.status(400).json({ error: 'Spam verification failed.' });
      return;
    }
    if (!name || !email || !message) {
      res.status(400).json({ error: 'Name, email, and message are required.' });
      return;
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
    if (!emailValid) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    const db = loadDatabase();
    const submission = {
      contactId: `MSG-${String(db.contacts.length + 1).padStart(4, '0')}`,
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone ?? '').trim(),
      flatNumber: String(flatNumber ?? '').trim(),
      subject: String(subject ?? 'General Community Inquiry').trim(),
      message: String(message).trim(),
      submittedAt: new Date().toISOString(),
    };
    db.contacts.unshift(submission);
    saveDatabase(db);
    res.status(201).json({
      message: 'Thank you. Your message has been received by the Happy Homes Palace-B Association Office.',
      contactId: submission.contactId,
    });
  });

  // =========================================================================
  // AUTHENTICATION, ACCOUNT ACTIVATION & PASSWORD RECOVERY (v4.0)
  // =========================================================================
  app.post('/api/auth/login', (req, res) => {
    const rawIdentifier = String(req.body?.identifier ?? req.body?.email ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!rawIdentifier || !password) {
      res.status(400).json({ error: 'Mobile number (or email) and password are required.' });
      return;
    }

    const rateKey = `login:${req.ip}:${rawIdentifier.toLowerCase()}`;
    if (!checkRateLimit(rateKey)) {
      res.status(429).json({
        error: 'Too many failed sign-in attempts. Please wait 5 minutes before trying again.',
      });
      return;
    }

    const db = loadDatabase();
    const normMob = normalizeMobile(rawIdentifier);
    const isEmailInput = rawIdentifier.includes('@');
    const user = db.users.find((u) =>
      isEmailInput
        ? u.email.toLowerCase() === rawIdentifier.toLowerCase()
        : normalizeMobile(u.mobile) === normMob && normMob.length === 10
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials. Please verify your mobile/email and password.' });
      return;
    }
    if (user.status === 'Pending') {
      res.status(403).json({
        error: 'Account pending activation. Please tap "Activate Account" using the single-use code issued by your Association Secretary.',
      });
      return;
    }
    if (user.status === 'Suspended') {
      res.status(403).json({
        error: 'This account has been suspended by the Association Committee.',
      });
      return;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials. Please verify your mobile/email and password.' });
      return;
    }

    // Auto-upgrade legacy sha256 hashes to salted scrypt on sign-in
    if (!user.passwordHash.startsWith('scrypt$')) {
      user.passwordHash = hashPassword(password);
    }

    const session = buildUserSession(db, user);
    if (user.role === 'resident' && session.allowedFlats.length === 0) {
      res.status(403).json({
        error: 'Your flat access has been revoked or unassigned. Contact the Association Secretary.',
      });
      return;
    }

    clearRateLimit(rateKey);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      userId: user.userId,
      activeFlatId: session.activeFlatId,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    setSessionCookie(req, res, token);

    appendAudit(db, {
      actorName: user.name,
      actorRole: session.roleLabel,
      action: 'USER_LOGIN',
      entityType: 'Session',
      entityId: user.userId,
      summary: `${user.name} (${session.roleLabel}) signed in.`,
    });
    saveDatabase(db);
    res.json({ token, user: session });
  });

  app.post('/api/auth/activate', (req, res) => {
    const mobile = normalizeMobile(String(req.body?.mobile ?? ''));
    const activationCode = String(req.body?.activationCode ?? '').trim().toUpperCase();
    const newPassword = String(req.body?.newPassword ?? '');
    const email = String(req.body?.email ?? '').trim();

    if (mobile.length !== 10 || !activationCode || !newPassword) {
      res.status(400).json({
        error: 'Registered 10-digit mobile number, activation code, and new password are required.',
      });
      return;
    }

    const rateKey = `activate:${req.ip}:${mobile}`;
    if (!checkRateLimit(rateKey, 10)) {
      res.status(429).json({
        error: 'Too many activation attempts. Please wait a few minutes and try again.',
      });
      return;
    }

    const db = loadDatabase();
    const user = db.users.find((u) => normalizeMobile(u.mobile) === mobile);
    if (!user || user.status === 'Suspended') {
      res.status(404).json({
        error: 'No eligible resident registration found for this mobile number.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const codeHash = hashActivationCode(activationCode);
    const activation = db.accountActivations.find(
      (a) =>
        a.userId === user.userId &&
        a.codeHash === codeHash &&
        !a.usedAt &&
        a.expiresAt > nowIso
    );

    if (!activation) {
      res.status(400).json({
        error: 'Invalid or expired activation code. Request a fresh code from the Association Secretary.',
      });
      return;
    }

    const allowedFlats = getAllowedFlatsForUser(db, user);
    const pwdCheck = isStrongResidentPassword(
      newPassword,
      mobile,
      allowedFlats.map((f) => f.flatNumber)
    );
    if (!pwdCheck.valid) {
      res.status(400).json({ error: pwdCheck.reason });
      return;
    }

    activation.usedAt = nowIso;
    user.passwordHash = hashPassword(newPassword);
    user.status = 'Active';
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      user.email = email;
    }

    if (!db.notificationPreferences.some((p) => p.userId === user.userId)) {
      db.notificationPreferences.push({
        userId: user.userId,
        billReminders: true,
        paymentUpdates: true,
        complaintUpdates: true,
        announcements: true,
        events: true,
      });
    }

    clearRateLimit(rateKey);
    const session = buildUserSession(db, user);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, {
      userId: user.userId,
      activeFlatId: session.activeFlatId,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    setSessionCookie(req, res, token);

    appendAudit(db, {
      actorName: user.name,
      actorRole: session.roleLabel,
      action: 'RESIDENT_ACCOUNT_ACTIVATED',
      entityType: 'ResidentAccount',
      entityId: user.userId,
      summary: `${user.name} activated mobile access (${mobile}) with a private password.`,
    });
    saveDatabase(db);
    res.json({ token, user: session });
  });

  app.post('/api/auth/recover', (req, res) => {
    const mobile = normalizeMobile(String(req.body?.mobile ?? ''));
    const recoveryCode = String(req.body?.recoveryCode ?? '').trim().toUpperCase();
    const newPassword = String(req.body?.newPassword ?? '');

    if (mobile.length !== 10 || !recoveryCode || !newPassword) {
      res.status(400).json({
        error: 'Registered 10-digit mobile number, committee recovery code, and new password are required.',
      });
      return;
    }

    const rateKey = `recover:${req.ip}:${mobile}`;
    if (!checkRateLimit(rateKey, 10)) {
      res.status(429).json({
        error: 'Too many password recovery attempts. Please try again later.',
      });
      return;
    }

    const db = loadDatabase();
    const user = db.users.find((u) => normalizeMobile(u.mobile) === mobile);
    if (!user || user.status === 'Suspended') {
      res.status(404).json({ error: 'No eligible account found for this mobile number.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const codeHash = hashActivationCode(recoveryCode);
    const activation = db.accountActivations.find(
      (a) =>
        a.userId === user.userId &&
        a.codeHash === codeHash &&
        !a.usedAt &&
        a.expiresAt > nowIso
    );
    if (!activation) {
      res.status(400).json({
        error: 'Invalid or expired recovery code. Ask the Secretary/President to issue a fresh reset code.',
      });
      return;
    }

    const allowedFlats = getAllowedFlatsForUser(db, user);
    const pwdCheck = isStrongResidentPassword(
      newPassword,
      mobile,
      allowedFlats.map((f) => f.flatNumber)
    );
    if (!pwdCheck.valid) {
      res.status(400).json({ error: pwdCheck.reason });
      return;
    }

    activation.usedAt = nowIso;
    user.passwordHash = hashPassword(newPassword);
    user.status = 'Active';
    revokeUserSessions(user.userId);
    clearRateLimit(rateKey);

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'PASSWORD_RESET_COMPLETED',
      entityType: 'ResidentAccount',
      entityId: user.userId,
      summary: `${user.name} completed password recovery using single-use committee reset code.`,
    });
    saveDatabase(db);
    res.json({ ok: true, message: 'Password updated successfully. You may now sign in.' });
  });

  app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const sessionUser = (req as express.Request & { user: UserSession }).user;
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    const db = loadDatabase();
    const stored = db.users.find((u) => u.userId === sessionUser.userId);
    if (!stored || !verifyPassword(currentPassword, stored.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    const pwdCheck = isStrongResidentPassword(
      newPassword,
      stored.mobile,
      sessionUser.allowedFlats.map((f) => f.flatNumber)
    );
    if (!pwdCheck.valid) {
      res.status(400).json({ error: pwdCheck.reason });
      return;
    }
    stored.passwordHash = hashPassword(newPassword);
    appendAudit(db, {
      actorName: stored.name,
      actorRole: sessionUser.roleLabel,
      action: 'PASSWORD_CHANGED',
      entityType: 'ResidentAccount',
      entityId: stored.userId,
      summary: `${stored.name} updated their account password.`,
    });
    saveDatabase(db);
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  app.post('/api/auth/switch-flat', requireAuth, (req, res) => {
    const db = loadDatabase();
    const resolved = resolveSession(req, db);
    if (!resolved) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const requestedFlatId = String(req.body?.flatId ?? '').trim();
    const access = resolveAuthorizedFlatIds(db, resolved.session, requestedFlatId);
    if (!access.ok || !access.singleFlat) {
      res.status(access.ok ? 400 : access.status).json({
        error: access.ok ? 'Valid flatId is required.' : access.error,
      });
      return;
    }
    resolved.record.activeFlatId = access.singleFlat.flatId;
    const stored = db.users.find((u) => u.userId === resolved.session.userId)!;
    const updatedSession = buildUserSession(db, stored, access.singleFlat.flatId);
    res.json({ user: updatedSession });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = getTokenFromRequest(req);
    if (token) sessions.delete(token);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    res.json({ user });
  });

  // =========================================================================
  // ADMIN — RESIDENT ONBOARDING, ACTIVATION CODES & FLAT ACCESS CONTROL
  // =========================================================================
  app.get('/api/admin/residents', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    const nowIso = new Date().toISOString();
    const residents: ResidentAccountSummary[] = db.users
      .filter((u) => u.role === 'resident')
      .map((u) => {
        const grants = db.flatAccess.filter((fa) => fa.userId === u.userId);
        const pendingAct = db.accountActivations.find(
          (a) => a.userId === u.userId && !a.usedAt && a.expiresAt > nowIso
        );
        return {
          userId: u.userId,
          name: u.name,
          email: u.email,
          mobile: u.mobile,
          status: u.status,
          roleLabel: u.roleLabel,
          flatAccess: grants,
          pendingActivationExpiresAt: pendingAct?.expiresAt,
        };
      });
    res.json({ residents });
  });

  app.post('/api/admin/residents', requireAdmin, (req, res) => {
    const admin = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const name = String(req.body?.name ?? '').trim();
    const mobile = normalizeMobile(String(req.body?.mobile ?? ''));
    const email = String(req.body?.email ?? '').trim();
    const flatId = String(req.body?.flatId ?? '').trim();
    const relationship = (['Owner', 'Tenant', 'Family'].includes(req.body?.relationship)
      ? req.body.relationship
      : 'Owner') as 'Owner' | 'Tenant' | 'Family';

    if (!name || mobile.length !== 10 || !flatId) {
      res.status(400).json({ error: 'Resident name, 10-digit mobile number, and flat are required.' });
      return;
    }

    const flat = db.flats.find((f) => f.flatId === flatId || f.flatNumber === flatId);
    if (!flat) {
      res.status(404).json({ error: 'Selected flat was not found.' });
      return;
    }

    let user = db.users.find((u) => normalizeMobile(u.mobile) === mobile);
    if (user && user.role !== 'resident') {
      res.status(409).json({ error: 'This mobile number is already assigned to a committee officer account.' });
      return;
    }

    const nowIso = new Date().toISOString();
    let activationCode: string | null = null;
    let expiresAt: string | null = null;

    if (!user) {
      const userId = `USR-RES-${flat.flatNumber}-${Date.now().toString().slice(-4)}`;
      user = {
        userId,
        name,
        email: email || `flat${flat.flatNumber}.${mobile.slice(-4)}@smartsociety.demo`,
        mobile,
        passwordHash: '',
        role: 'resident',
        roleLabel: `Resident (Flat ${flat.flatNumber})`,
        status: 'Pending',
        flatId: flat.flatId,
      };
      db.users.push(user);

      // Generate single-use 8-char code expiring in 48 hours
      activationCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      db.accountActivations.push({
        activationId: `ACT-${Date.now().toString().slice(-6)}`,
        userId: user.userId,
        mobile,
        flatNumber: flat.flatNumber,
        codeHash: hashActivationCode(activationCode),
        expiresAt,
        createdBy: admin.name,
        createdAt: nowIso,
      });
    }

    const existingGrant = db.flatAccess.find(
      (fa) => fa.userId === user!.userId && fa.flatId === flat.flatId && fa.active
    );
    if (!existingGrant) {
      db.flatAccess.push({
        accessId: `FA-${String(db.flatAccess.length + 1).padStart(4, '0')}`,
        userId: user.userId,
        flatId: flat.flatId,
        flatNumber: flat.flatNumber,
        relationship,
        active: true,
        grantedBy: admin.name,
        grantedAt: nowIso,
      });
    }

    appendAudit(db, {
      actorName: admin.name,
      actorRole: admin.roleLabel,
      action: 'RESIDENT_REGISTERED',
      entityType: 'ResidentAccount',
      entityId: user.userId,
      summary: `Registered ${user.name} (${mobile}) with ${relationship} access to Flat ${flat.flatNumber}.`,
    });
    saveDatabase(db);
    res.status(201).json({
      resident: {
        userId: user.userId,
        name: user.name,
        mobile: user.mobile,
        status: user.status,
      },
      activationCode,
      expiresAt,
    });
  });

  app.post('/api/admin/residents/:id/activation-code', requireAdmin, (req, res) => {
    const admin = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const user = db.users.find((u) => u.userId === req.params.id && u.role === 'resident');
    if (!user) {
      res.status(404).json({ error: 'Resident account not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    // Invalidate any prior unused codes
    for (const act of db.accountActivations) {
      if (act.userId === user.userId && !act.usedAt) {
        act.usedAt = nowIso;
      }
    }

    const activeGrant = db.flatAccess.find((fa) => fa.userId === user.userId && fa.active);
    const activationCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    db.accountActivations.push({
      activationId: `ACT-${Date.now().toString().slice(-6)}`,
      userId: user.userId,
      mobile: user.mobile,
      flatNumber: activeGrant?.flatNumber ?? '',
      codeHash: hashActivationCode(activationCode),
      expiresAt,
      createdBy: admin.name,
      createdAt: nowIso,
    });

    appendAudit(db, {
      actorName: admin.name,
      actorRole: admin.roleLabel,
      action: 'ACTIVATION_CODE_ISSUED',
      entityType: 'ResidentAccount',
      entityId: user.userId,
      summary: `Issued single-use activation/reset code for ${user.name} (${user.mobile}), valid 48 hours.`,
    });
    saveDatabase(db);
    res.json({ activationCode, expiresAt, mobile: user.mobile });
  });

  app.post('/api/admin/residents/:id/flat-access', requireAdmin, (req, res) => {
    const admin = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const user = db.users.find((u) => u.userId === req.params.id && u.role === 'resident');
    if (!user) {
      res.status(404).json({ error: 'Resident account not found.' });
      return;
    }
    const action = req.body?.action === 'revoke' ? 'revoke' : 'grant';
    const flatId = String(req.body?.flatId ?? '').trim();
    const flat = db.flats.find((f) => f.flatId === flatId || f.flatNumber === flatId);
    if (!flat) {
      res.status(404).json({ error: 'Flat not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    if (action === 'revoke') {
      const grant = db.flatAccess.find(
        (fa) => fa.userId === user.userId && fa.flatId === flat.flatId && fa.active
      );
      if (!grant) {
        res.status(404).json({ error: 'Active flat access mapping not found.' });
        return;
      }
      grant.active = false;
      grant.revokedAt = nowIso;
      grant.revokedBy = admin.name;

      const remaining = db.flatAccess.filter((fa) => fa.userId === user.userId && fa.active);
      user.flatId = remaining[0]?.flatId;
      if (remaining.length === 0) {
        revokeUserSessions(user.userId);
      }

      appendAudit(db, {
        actorName: admin.name,
        actorRole: admin.roleLabel,
        action: 'FLAT_ACCESS_REVOKED',
        entityType: 'FlatAccess',
        entityId: grant.accessId,
        summary: `Revoked ${user.name}'s access to Flat ${flat.flatNumber}.`,
      });
    } else {
      const relationship = (['Owner', 'Tenant', 'Family'].includes(req.body?.relationship)
        ? req.body.relationship
        : 'Owner') as 'Owner' | 'Tenant' | 'Family';
      const existing = db.flatAccess.find(
        (fa) => fa.userId === user.userId && fa.flatId === flat.flatId && fa.active
      );
      if (existing) {
        res.status(409).json({ error: `User already has active access to Flat ${flat.flatNumber}.` });
        return;
      }
      const grant = {
        accessId: `FA-${String(db.flatAccess.length + 1).padStart(4, '0')}`,
        userId: user.userId,
        flatId: flat.flatId,
        flatNumber: flat.flatNumber,
        relationship,
        active: true,
        grantedBy: admin.name,
        grantedAt: nowIso,
      };
      db.flatAccess.push(grant);
      if (!user.flatId) user.flatId = flat.flatId;

      appendAudit(db, {
        actorName: admin.name,
        actorRole: admin.roleLabel,
        action: 'FLAT_ACCESS_GRANTED',
        entityType: 'FlatAccess',
        entityId: grant.accessId,
        summary: `Granted ${user.name} ${relationship} access to Flat ${flat.flatNumber}.`,
      });
    }

    saveDatabase(db);
    res.json({ ok: true });
  });

  app.put('/api/admin/residents/:id/status', requireAdmin, (req, res) => {
    const admin = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const user = db.users.find((u) => u.userId === req.params.id && u.role === 'resident');
    if (!user) {
      res.status(404).json({ error: 'Resident account not found.' });
      return;
    }
    const status = req.body?.status;
    if (status !== 'Active' && status !== 'Suspended') {
      res.status(400).json({ error: 'Status must be Active or Suspended.' });
      return;
    }
    user.status = status;
    if (status === 'Suspended') {
      revokeUserSessions(user.userId);
    }
    appendAudit(db, {
      actorName: admin.name,
      actorRole: admin.roleLabel,
      action: status === 'Suspended' ? 'RESIDENT_SUSPENDED' : 'RESIDENT_REACTIVATED',
      entityType: 'ResidentAccount',
      entityId: user.userId,
      summary: `${admin.name} marked ${user.name} (${user.mobile}) as ${status}.`,
    });
    saveDatabase(db);
    res.json({ ok: true, status: user.status });
  });

  // =========================================================================
  // AREA C — GROUP A: WEBSITE CONTENT, COMMITTEE, GALLERY, NOTICES, EVENTS
  // =========================================================================
  app.get('/api/cms/website', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({ website: db.website });
  });

  app.put('/api/cms/website', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const { draft, action } = req.body ?? {};
    if (!draft) {
      res.status(400).json({ error: 'Website content payload is required.' });
      return;
    }
    const updatedDraft = {
      ...db.website.draft,
      ...draft,
      updatedAt: new Date().toISOString(),
    };
    db.website.draft = updatedDraft;
    if (action === 'publish') {
      db.website.published = { ...updatedDraft };
      db.website.hasUnpublishedDraft = false;
      appendAudit(db, {
        actorName: user.name,
        actorRole: user.roleLabel,
        action: 'WEBSITE_CONTENT_PUBLISHED',
        entityType: 'WebsiteContent',
        entityId: 'PUBLIC-SITE',
        summary: 'Published updated community website introduction, hero, and statistics.',
      });
    } else {
      db.website.hasUnpublishedDraft = true;
      appendAudit(db, {
        actorName: user.name,
        actorRole: user.roleLabel,
        action: 'WEBSITE_DRAFT_SAVED',
        entityType: 'WebsiteContent',
        entityId: 'PUBLIC-SITE',
        summary: 'Saved draft changes to community website content.',
      });
    }
    saveDatabase(db);
    res.json({ website: db.website });
  });

  // Committee CRUD
  app.get('/api/cms/committee', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({ committee: [...db.committee].sort((a, b) => a.order - b.order) });
  });

  app.post('/api/cms/committee', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    if (!b.name || !b.designation) {
      res.status(400).json({ error: 'Member name and designation are required.' });
      return;
    }
    const member: CommitteeMember = {
      memberId: `COM-${String(db.committee.length + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
      name: String(b.name).trim(),
      designation: String(b.designation).trim(),
      intro: String(b.intro ?? '').trim(),
      term: String(b.term ?? '2025 – 2027').trim(),
      photoUrl: String(b.photoUrl ?? '').trim(),
      order: Number(b.order || db.committee.length + 1),
      published: b.published !== false,
    };
    db.committee.push(member);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'COMMITTEE_MEMBER_ADDED',
      entityType: 'Committee',
      entityId: member.memberId,
      summary: `Added ${member.name} (${member.designation}) to Association Committee.`,
    });
    saveDatabase(db);
    res.status(201).json({ member });
  });

  app.put('/api/cms/committee/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const member = db.committee.find((m) => m.memberId === req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Committee member not found.' });
      return;
    }
    Object.assign(member, {
      name: String(req.body.name ?? member.name).trim(),
      designation: String(req.body.designation ?? member.designation).trim(),
      intro: String(req.body.intro ?? member.intro).trim(),
      term: String(req.body.term ?? member.term).trim(),
      photoUrl: req.body.photoUrl !== undefined ? String(req.body.photoUrl).trim() : member.photoUrl,
      order: Number(req.body.order ?? member.order),
      published: req.body.published !== undefined ? Boolean(req.body.published) : member.published,
    });
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'COMMITTEE_MEMBER_UPDATED',
      entityType: 'Committee',
      entityId: member.memberId,
      summary: `Updated committee profile for ${member.name}.`,
    });
    saveDatabase(db);
    res.json({ member });
  });

  app.delete('/api/cms/committee/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const idx = db.committee.findIndex((m) => m.memberId === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Committee member not found.' });
      return;
    }
    const [removed] = db.committee.splice(idx, 1);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'COMMITTEE_MEMBER_REMOVED',
      entityType: 'Committee',
      entityId: removed.memberId,
      summary: `Removed ${removed.name} from Committee directory.`,
    });
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Gallery CRUD
  app.get('/api/cms/gallery', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({ gallery: [...db.gallery].sort((a, b) => a.order - b.order) });
  });

  app.post('/api/cms/gallery', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    if (!b.title || !b.imageUrl) {
      res.status(400).json({ error: 'Photo title and image upload or URL are required.' });
      return;
    }
    const item: GalleryItem = {
      photoId: `GAL-${Date.now().toString().slice(-5)}`,
      title: String(b.title).trim(),
      description: String(b.description ?? '').trim(),
      category: b.category || 'Our Apartment',
      date: String(b.date || new Date().toISOString().slice(0, 10)),
      order: Number(b.order || db.gallery.length + 1),
      featured: Boolean(b.featured ?? true),
      isPlaceholder: Boolean(b.isPlaceholder ?? false),
      imageUrl: String(b.imageUrl),
    };
    db.gallery.push(item);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'GALLERY_PHOTO_ADDED',
      entityType: 'Gallery',
      entityId: item.photoId,
      summary: `Uploaded gallery photo "${item.title}" in ${item.category}.`,
    });
    saveDatabase(db);
    res.status(201).json({ item });
  });

  app.delete('/api/cms/gallery/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const idx = db.gallery.findIndex((g) => g.photoId === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Gallery item not found.' });
      return;
    }
    const [removed] = db.gallery.splice(idx, 1);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'GALLERY_PHOTO_DELETED',
      entityType: 'Gallery',
      entityId: removed.photoId,
      summary: `Removed gallery item "${removed.title}".`,
    });
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Announcements & Events (Resident App + Admin)
  app.get('/api/announcements', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const isAdmin = user.role === 'president' || user.role === 'treasurer';
    const items = isAdmin
      ? db.announcements
      : db.announcements.filter((a) => a.published);
    res.json({ announcements: [...items].sort((a, b) => b.publishDate.localeCompare(a.publishDate)) });
  });

  app.get('/api/events', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const isAdmin = user.role === 'president' || user.role === 'treasurer';
    const events = isAdmin ? db.events : db.events.filter((e) => e.published);
    res.json({ events: [...events].sort((a, b) => b.date.localeCompare(a.date)) });
  });

  app.post('/api/cms/announcements', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    if (!b.title || !b.summary) {
      res.status(400).json({ error: 'Announcement title and summary are required.' });
      return;
    }
    const ann: Announcement = {
      announcementId: `ANN-${Date.now().toString().slice(-5)}`,
      title: String(b.title).trim(),
      category: String(b.category || 'Common area maintenance'),
      priority: b.priority || 'General',
      summary: String(b.summary).trim(),
      body: String(b.body || b.summary).trim(),
      publishDate: String(b.publishDate || new Date().toISOString().slice(0, 10)),
      expiryDate: String(b.expiryDate || '2027-12-31'),
      audience: b.audience === 'Residents Only' ? 'Residents Only' : 'Public',
      published: b.published !== false,
    };
    db.announcements.unshift(ann);
    if (ann.published) {
      pushNotification(db, {
        type: 'announcement',
        title: `${ann.priority === 'Urgent' ? 'Urgent Notice: ' : ''}${ann.title}`,
        body: ann.summary,
        linkScreen: 'notices',
      });
    }
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'ANNOUNCEMENT_PUBLISHED',
      entityType: 'Announcement',
      entityId: ann.announcementId,
      summary: `Published ${ann.priority} announcement "${ann.title}" (${ann.audience}).`,
    });
    saveDatabase(db);
    res.status(201).json({ announcement: ann });
  });

  app.delete('/api/cms/announcements/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const idx = db.announcements.findIndex((a) => a.announcementId === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }
    const [removed] = db.announcements.splice(idx, 1);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'ANNOUNCEMENT_DELETED',
      entityType: 'Announcement',
      entityId: removed.announcementId,
      summary: `Removed announcement "${removed.title}".`,
    });
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Events CRUD
  app.get('/api/cms/events', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({ events: [...db.events].sort((a, b) => b.date.localeCompare(a.date)) });
  });

  app.post('/api/cms/events', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    if (!b.title || !b.date || !b.location) {
      res.status(400).json({ error: 'Event title, date, and location are required.' });
      return;
    }
    const evt: CommunityEvent = {
      eventId: `EVT-${Date.now().toString().slice(-5)}`,
      title: String(b.title).trim(),
      date: String(b.date),
      time: String(b.time || '5:00 PM'),
      location: String(b.location).trim(),
      description: String(b.description ?? '').trim(),
      coverImage: String(b.coverImage || '/src/assets/images/community_courtyard_garden_1795426886061.jpg'),
      status: b.status === 'Completed' ? 'Completed' : 'Upcoming',
      featured: Boolean(b.featured ?? true),
      published: b.published !== false,
    };
    db.events.unshift(evt);
    if (evt.published) {
      pushNotification(db, {
        type: 'event',
        title: `Community Event: ${evt.title}`,
        body: `${evt.date} · ${evt.time} at ${evt.location}`,
        linkScreen: 'notices',
      });
    }
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'EVENT_CREATED',
      entityType: 'Event',
      entityId: evt.eventId,
      summary: `Created ${evt.status} community event "${evt.title}" on ${evt.date}.`,
    });
    saveDatabase(db);
    res.status(201).json({ event: evt });
  });

  app.delete('/api/cms/events/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const idx = db.events.findIndex((e) => e.eventId === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    const [removed] = db.events.splice(idx, 1);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'EVENT_DELETED',
      entityType: 'Event',
      entityId: removed.eventId,
      summary: `Removed event "${removed.title}".`,
    });
    saveDatabase(db);
    res.json({ ok: true });
  });

  // =========================================================================
  // COMPLAINTS (FULL STATUS WORKFLOW + PRIVATE PHOTOS) & DOCUMENTS
  // =========================================================================
  app.get('/api/complaints', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const allowedSet = new Set(
      user.role === 'resident'
        ? (requestedFlat ? scope.flatIds : user.allowedFlats.map((f) => f.flatId))
        : scope.flatIds
    );
    const list =
      user.role === 'resident' || requestedFlat
        ? db.complaints.filter((c) => allowedSet.has(c.flatId))
        : db.complaints;
    res.json({
      complaints: [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  });

  app.post('/api/complaints', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    const scope = resolveAuthorizedFlatIds(
      db,
      user,
      typeof b.flatId === 'string' ? b.flatId : undefined
    );
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const flat = scope.singleFlat;
    if (!flat) {
      res.status(400).json({ error: 'Authorized flat is required.' });
      return;
    }
    if (!b.subject || !b.description) {
      res.status(400).json({ error: 'Subject and description are required.' });
      return;
    }

    let photoMeta: { fileId: string; fileName: string } | undefined;
    if (b.photoBase64) {
      try {
        const saved = savePrivateEvidenceFile(
          String(b.photoBase64),
          String(b.photoFileName || 'complaint-photo.jpg')
        );
        photoMeta = { fileId: saved.fileId, fileName: saved.fileName };
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid complaint photo upload.',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const cmp: Complaint = {
      complaintId: `CMP-${String(db.complaints.length + 1).padStart(4, '0')}`,
      flatId: flat.flatId,
      flatNumber: flat.flatNumber,
      residentName: user.role === 'resident' ? user.name : flat.ownerName,
      category: String(b.category || 'Common Area & Housekeeping'),
      subject: String(b.subject).trim(),
      description: String(b.description).trim(),
      priority: b.priority === 'Urgent' ? 'Urgent' : 'Normal',
      status: 'Submitted',
      assignedTo: 'Pending Assignment',
      resolutionNotes: '',
      photoFileId: photoMeta?.fileId,
      photoFileName: photoMeta?.fileName,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          timestamp: now,
          actorName: user.name,
          actorRole: user.roleLabel,
          status: 'Submitted',
          note: 'Complaint logged via Smart Society Portal.',
        },
      ],
    };
    db.complaints.unshift(cmp);
    pushNotification(db, {
      roleTarget: 'president',
      type: 'complaint',
      title: `New Complaint ${cmp.complaintId} · Flat ${flat.flatNumber}`,
      body: `${cmp.category}: ${cmp.subject}`,
      linkScreen: 'complaints',
    });
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'COMPLAINT_REGISTERED',
      entityType: 'Complaint',
      entityId: cmp.complaintId,
      summary: `Flat ${flat.flatNumber} logged complaint "${cmp.subject}".`,
    });
    saveDatabase(db);
    res.status(201).json({ complaint: cmp });
  });

  app.get('/api/complaints/:id/photo', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const cmp = db.complaints.find((c) => c.complaintId === req.params.id);
    if (!cmp || !cmp.photoFileId) {
      res.status(404).json({ error: 'Complaint photo not found.' });
      return;
    }
    if (!isFlatAccessible(user, cmp.flatId)) {
      res.status(403).json({ error: 'Access denied to another flat’s complaint photo.' });
      return;
    }
    const file = readPrivateEvidenceFile(cmp.photoFileId);
    if (!file) {
      res.status(404).json({ error: 'Photo file missing.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  });

  app.post('/api/complaints/:id/resident-action', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const cmp = db.complaints.find((c) => c.complaintId === req.params.id);
    if (!cmp) {
      res.status(404).json({ error: 'Complaint ticket not found.' });
      return;
    }
    if (!isFlatAccessible(user, cmp.flatId)) {
      res.status(403).json({ error: 'Access denied to another flat’s complaint.' });
      return;
    }
    const action = req.body?.action;
    const note = String(req.body?.note ?? '').trim();
    const now = new Date().toISOString();

    if (action === 'close') {
      if (cmp.status !== 'Resolved') {
        res.status(400).json({ error: 'Only Resolved complaints can be confirmed closed by resident.' });
        return;
      }
      cmp.status = 'Closed';
      cmp.residentFeedback = note || 'Confirmed resolved by resident.';
      cmp.updatedAt = now;
      cmp.history.push({
        timestamp: now,
        actorName: user.name,
        actorRole: user.roleLabel,
        status: 'Closed',
        note: cmp.residentFeedback,
      });
    } else if (action === 'reopen') {
      if (cmp.status !== 'Resolved' && cmp.status !== 'Closed') {
        res.status(400).json({ error: 'Only Resolved or Closed complaints can be reopened.' });
        return;
      }
      if (!note) {
        res.status(400).json({ error: 'Please explain why the issue needs to be reopened.' });
        return;
      }
      cmp.status = 'Reopened';
      cmp.residentFeedback = note;
      cmp.updatedAt = now;
      cmp.history.push({
        timestamp: now,
        actorName: user.name,
        actorRole: user.roleLabel,
        status: 'Reopened',
        note,
      });
      pushNotification(db, {
        roleTarget: 'president',
        type: 'complaint',
        title: `Complaint ${cmp.complaintId} Reopened · Flat ${cmp.flatNumber}`,
        body: note,
        linkScreen: 'complaints',
      });
    } else {
      res.status(400).json({ error: 'Unsupported resident action.' });
      return;
    }

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: action === 'close' ? 'COMPLAINT_CLOSED_BY_RESIDENT' : 'COMPLAINT_REOPENED_BY_RESIDENT',
      entityType: 'Complaint',
      entityId: cmp.complaintId,
      summary: `Flat ${cmp.flatNumber} marked ${cmp.complaintId} as ${cmp.status}.`,
    });
    saveDatabase(db);
    res.json({ complaint: cmp });
  });

  app.put('/api/complaints/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const cmp = db.complaints.find((c) => c.complaintId === req.params.id);
    if (!cmp) {
      res.status(404).json({ error: 'Complaint ticket not found.' });
      return;
    }
    const validStatuses: ComplaintStatus[] = [
      'Submitted',
      'Acknowledged',
      'Assigned',
      'In Progress',
      'Resolved',
      'Closed',
      'Reopened',
    ];
    const nextStatus = validStatuses.includes(req.body?.status)
      ? (req.body.status as ComplaintStatus)
      : cmp.status;
    const note = String(req.body?.note ?? req.body?.resolutionNotes ?? '').trim();

    cmp.status = nextStatus;
    cmp.assignedTo = String(req.body?.assignedTo ?? cmp.assignedTo).trim();
    cmp.resolutionNotes = String(req.body?.resolutionNotes ?? cmp.resolutionNotes).trim();
    cmp.updatedAt = new Date().toISOString();
    cmp.history.push({
      timestamp: cmp.updatedAt,
      actorName: user.name,
      actorRole: user.roleLabel,
      status: nextStatus,
      note: note || `Status updated to ${nextStatus}${cmp.assignedTo ? ` (${cmp.assignedTo})` : ''}.`,
    });

    pushNotification(db, {
      flatId: cmp.flatId,
      type: 'complaint',
      title: `Complaint ${cmp.complaintId}: ${cmp.status}`,
      body: cmp.resolutionNotes || `Your complaint "${cmp.subject}" is now ${cmp.status}.`,
      linkScreen: 'complaints',
    });

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'COMPLAINT_UPDATED',
      entityType: 'Complaint',
      entityId: cmp.complaintId,
      summary: `Updated complaint ${cmp.complaintId} (Flat ${cmp.flatNumber}) to ${cmp.status}.`,
    });
    saveDatabase(db);
    res.json({ complaint: cmp });
  });

  app.get('/api/documents', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({ documents: db.documents });
  });

  // =========================================================================
  // NOTIFICATIONS & PREFERENCES (v4.0)
  // =========================================================================
  app.get('/api/notifications', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const allowedFlatIds = new Set(user.allowedFlats.map((f) => f.flatId));
    const list = db.notifications.filter((n) => {
      if (n.userId) return n.userId === user.userId;
      if (n.flatId) {
        return user.role === 'resident' ? allowedFlatIds.has(n.flatId) : false;
      }
      if (n.roleTarget) {
        if (user.role === 'president' || user.role === 'treasurer') {
          return n.roleTarget === user.role || n.roleTarget === 'president' || n.roleTarget === 'treasurer';
        }
        return n.roleTarget === user.role;
      }
      return true;
    });
    res.json({
      notifications: list.slice(0, 60),
      unreadCount: list.filter((n) => !n.read).length,
    });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const item = db.notifications.find((n) => n.notificationId === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    if (item.flatId && user.role === 'resident' && !isFlatAccessible(user, item.flatId)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    item.read = true;
    saveDatabase(db);
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const allowedFlatIds = new Set(user.allowedFlats.map((f) => f.flatId));
    for (const n of db.notifications) {
      const visible =
        (n.userId && n.userId === user.userId) ||
        (n.flatId && user.role === 'resident' && allowedFlatIds.has(n.flatId)) ||
        (!n.userId && !n.flatId && !n.roleTarget) ||
        (n.roleTarget &&
          (user.role === 'resident'
            ? n.roleTarget === 'resident'
            : n.roleTarget === 'president' || n.roleTarget === 'treasurer'));
      if (visible) {
        n.read = true;
      }
    }
    saveDatabase(db);
    res.json({ ok: true });
  });

  app.get('/api/notifications/preferences', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const pref: NotificationPreferences = db.notificationPreferences.find(
      (p) => p.userId === user.userId
    ) ?? {
      userId: user.userId,
      billReminders: true,
      paymentUpdates: true,
      complaintUpdates: true,
      announcements: true,
      events: true,
    };
    res.json({ preferences: pref });
  });

  app.put('/api/notifications/preferences', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    let pref = db.notificationPreferences.find((p) => p.userId === user.userId);
    if (!pref) {
      pref = {
        userId: user.userId,
        billReminders: true,
        paymentUpdates: true,
        complaintUpdates: true,
        announcements: true,
        events: true,
      };
      db.notificationPreferences.push(pref);
    }
    pref.billReminders = req.body?.billReminders !== undefined ? Boolean(req.body.billReminders) : pref.billReminders;
    pref.paymentUpdates = req.body?.paymentUpdates !== undefined ? Boolean(req.body.paymentUpdates) : pref.paymentUpdates;
    pref.complaintUpdates = req.body?.complaintUpdates !== undefined ? Boolean(req.body.complaintUpdates) : pref.complaintUpdates;
    pref.announcements = req.body?.announcements !== undefined ? Boolean(req.body.announcements) : pref.announcements;
    pref.events = req.body?.events !== undefined ? Boolean(req.body.events) : pref.events;
    saveDatabase(db);
    res.json({ preferences: pref });
  });

  // =========================================================================
  // PAYMENT SUBMISSIONS & TREASURER APPROVAL QUEUE (v4.0)
  // Unapproved submissions NEVER modify bills, balances, payments, or receipts.
  // =========================================================================
  app.get('/api/payment-submissions', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const stateFilter = typeof req.query.state === 'string' ? req.query.state : '';

    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const allowedSet = new Set(
      user.role === 'resident'
        ? (requestedFlat ? scope.flatIds : user.allowedFlats.map((f) => f.flatId))
        : scope.flatIds
    );

    const submissions = db.paymentSubmissions
      .filter((s) => {
        if (user.role === 'resident' || requestedFlat) {
          if (!allowedSet.has(s.flatId)) return false;
        }
        if (stateFilter && s.state !== stateFilter) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.json({ submissions });
  });

  app.post('/api/payment-submissions', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const b = req.body ?? {};
    const scope = resolveAuthorizedFlatIds(
      db,
      user,
      typeof b.flatId === 'string' ? b.flatId : undefined
    );
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const flat = scope.singleFlat;
    if (!flat) {
      res.status(400).json({ error: 'Authorized flat is required.' });
      return;
    }

    const mode = b.mode === 'draft' ? 'draft' : 'submit';
    const numericAmount = Number(b.amount);
    if (!numericAmount || numericAmount <= 0 || Number.isNaN(numericAmount)) {
      res.status(400).json({ error: 'Payment amount must be greater than ₹0.' });
      return;
    }
    const paymentDate = String(b.paymentDate || '').trim();
    if (!paymentDate) {
      res.status(400).json({ error: 'Payment date is required.' });
      return;
    }
    const paymentMethod = (b.paymentMethod as PaymentMethod) || 'UPI';
    const bankReference = String(b.bankReference || '').trim();
    if (mode === 'submit' && paymentMethod !== 'Cash' && !bankReference) {
      res.status(400).json({ error: 'UTR / Bank transaction reference number is required to submit for verification.' });
      return;
    }

    if (bankReference && paymentMethod !== 'Cash') {
      const refLower = bankReference.toLowerCase();
      const dupPayment = db.payments.some(
        (p) => p.status !== 'Reversed' && p.bankReference.toLowerCase() === refLower
      );
      const dupSubmission = db.paymentSubmissions.some(
        (s) =>
          s.state !== 'REJECTED' &&
          s.bankReference &&
          s.bankReference.toLowerCase() === refLower
      );
      if (dupPayment || dupSubmission) {
        res.status(409).json({
          error: `Duplicate transaction blocked: Reference "${bankReference}" is already submitted or posted.`,
        });
        return;
      }
    }

    let evidenceMeta: { fileId: string; fileName: string; mimeType: string } | undefined;
    if (b.evidenceBase64) {
      try {
        evidenceMeta = savePrivateEvidenceFile(
          String(b.evidenceBase64),
          String(b.evidenceFileName || 'payment-proof.jpg')
        );
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid payment proof file.',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const seq = String(db.paymentSubmissions.length + 1).padStart(4, '0');
    const submission: PaymentSubmission = {
      submissionId: `SUB-2026-${seq}`,
      flatId: flat.flatId,
      flatNumber: flat.flatNumber,
      ownerName: flat.ownerName,
      submittedByUserId: user.userId,
      submittedByName: user.name,
      paymentDate,
      amount: numericAmount,
      paymentMethod,
      bankReference,
      targetMonths: Array.isArray(b.targetMonths) ? b.targetMonths.map(String) : [],
      remarks: String(b.remarks || '').trim(),
      evidenceFileId: evidenceMeta?.fileId,
      evidenceFileName: evidenceMeta?.fileName,
      evidenceMimeType: evidenceMeta?.mimeType,
      state: mode === 'draft' ? 'DRAFT' : 'PENDING_REVIEW',
      createdAt: now,
      updatedAt: now,
      history: [
        {
          timestamp: now,
          actorName: user.name,
          actorRole: user.roleLabel,
          action: mode === 'draft' ? 'SAVED_DRAFT' : 'SUBMITTED',
          note:
            mode === 'draft'
              ? `Saved draft payment submission of ₹${numericAmount}.`
              : `Submitted ${paymentMethod} reference ${bankReference || 'N/A'} for Treasurer verification.`,
        },
      ],
    };

    db.paymentSubmissions.unshift(submission);
    if (submission.state === 'PENDING_REVIEW') {
      pushNotification(db, {
        roleTarget: 'treasurer',
        type: 'payment',
        title: `Payment Proof Submitted · Flat ${flat.flatNumber}`,
        body: `₹${numericAmount.toLocaleString('en-IN')} (${paymentMethod} ${bankReference}) awaiting review.`,
        linkScreen: 'approvals',
      });
    }
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: mode === 'draft' ? 'PAYMENT_SUBMISSION_DRAFT' : 'PAYMENT_SUBMISSION_CREATED',
      entityType: 'PaymentSubmission',
      entityId: submission.submissionId,
      summary: `Flat ${flat.flatNumber} ${mode === 'draft' ? 'saved draft' : 'submitted'} ₹${numericAmount} (${bankReference || 'no ref'}). Dues remain unchanged until Treasurer approval.`,
    });
    saveDatabase(db);
    res.status(201).json({ submission });
  });

  app.put('/api/payment-submissions/:id', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const sub = db.paymentSubmissions.find((s) => s.submissionId === req.params.id);
    if (!sub) {
      res.status(404).json({ error: 'Payment submission not found.' });
      return;
    }
    if (!isFlatAccessible(user, sub.flatId)) {
      res.status(403).json({ error: 'Access denied to another flat’s payment submission.' });
      return;
    }
    if (sub.state !== 'DRAFT' && sub.state !== 'CLARIFICATION_REQUIRED') {
      res.status(400).json({
        error: `Submissions in ${sub.state} state cannot be edited directly.`,
      });
      return;
    }

    const b = req.body ?? {};
    if (b.amount !== undefined) {
      const amt = Number(b.amount);
      if (!amt || amt <= 0) {
        res.status(400).json({ error: 'Amount must be greater than ₹0.' });
        return;
      }
      sub.amount = amt;
    }
    if (b.paymentDate) sub.paymentDate = String(b.paymentDate);
    if (b.paymentMethod) sub.paymentMethod = b.paymentMethod as PaymentMethod;
    if (b.bankReference !== undefined) {
      const nextRef = String(b.bankReference).trim();
      if (nextRef && sub.paymentMethod !== 'Cash') {
        const refLower = nextRef.toLowerCase();
        const dupPay = db.payments.some(
          (p) => p.status !== 'Reversed' && p.bankReference.toLowerCase() === refLower
        );
        const dupSub = db.paymentSubmissions.some(
          (s) =>
            s.submissionId !== sub.submissionId &&
            s.state !== 'REJECTED' &&
            s.bankReference.toLowerCase() === refLower
        );
        if (dupPay || dupSub) {
          res.status(409).json({
            error: `Duplicate transaction blocked: Reference "${nextRef}" is already used.`,
          });
          return;
        }
      }
      sub.bankReference = nextRef;
    }
    if (Array.isArray(b.targetMonths)) sub.targetMonths = b.targetMonths.map(String);
    if (b.remarks !== undefined) sub.remarks = String(b.remarks).trim();

    if (b.evidenceBase64) {
      try {
        const saved = savePrivateEvidenceFile(
          String(b.evidenceBase64),
          String(b.evidenceFileName || 'updated-proof.jpg')
        );
        sub.evidenceFileId = saved.fileId;
        sub.evidenceFileName = saved.fileName;
        sub.evidenceMimeType = saved.mimeType;
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Invalid payment proof file.',
        });
        return;
      }
    }

    const submitNow = b.mode !== 'draft';
    if (submitNow && sub.paymentMethod !== 'Cash' && !sub.bankReference) {
      res.status(400).json({ error: 'Transaction reference is required before submitting.' });
      return;
    }

    const now = new Date().toISOString();
    sub.state = submitNow ? 'PENDING_REVIEW' : 'DRAFT';
    sub.updatedAt = now;
    sub.history.push({
      timestamp: now,
      actorName: user.name,
      actorRole: user.roleLabel,
      action: submitNow ? 'RESUBMITTED' : 'UPDATED_DRAFT',
      note: String(b.responseNote || b.remarks || 'Updated payment details and submitted for review.').trim(),
    });

    if (submitNow) {
      pushNotification(db, {
        roleTarget: 'treasurer',
        type: 'payment',
        title: `Submission Updated · Flat ${sub.flatNumber}`,
        body: `₹${sub.amount.toLocaleString('en-IN')} (${sub.bankReference}) is ready for Treasurer review.`,
        linkScreen: 'approvals',
      });
    }

    saveDatabase(db);
    res.json({ submission: sub });
  });

  app.get('/api/payment-submissions/:id/evidence', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const sub = db.paymentSubmissions.find((s) => s.submissionId === req.params.id);
    if (!sub || !sub.evidenceFileId) {
      res.status(404).json({ error: 'Payment evidence file not found.' });
      return;
    }
    if (!isFlatAccessible(user, sub.flatId)) {
      res.status(403).json({ error: 'Access denied to another flat’s payment evidence.' });
      return;
    }
    const file = readPrivateEvidenceFile(sub.evidenceFileId);
    if (!file) {
      res.status(404).json({ error: 'Stored evidence file is missing.' });
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sub.evidenceFileName || 'evidence'}"`
    );
    res.send(file.buffer);
  });

  app.post('/api/treasurer/submissions/:id/decision', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const subId = req.params.id;
    if (approvalInFlight.has(subId)) {
      res.status(409).json({
        error: 'Duplicate approval blocked: This submission is already being processed.',
      });
      return;
    }
    approvalInFlight.add(subId);

    try {
      const db = loadDatabase();
      const sub = db.paymentSubmissions.find((s) => s.submissionId === subId);
      if (!sub) {
        res.status(404).json({ error: 'Payment submission not found.' });
        return;
      }
      if (sub.state === 'APPROVED' || sub.state === 'REJECTED') {
        res.status(409).json({
          error: `This submission has already been ${sub.state.toLowerCase()} (${sub.approvedReceiptNumber || sub.reviewedByName || ''}).`,
        });
        return;
      }

      const action = req.body?.action;
      const note = String(req.body?.note ?? '').trim();
      const now = new Date().toISOString();

      if (action === 'clarify') {
        if (!note) {
          res.status(400).json({ error: 'Clarification note is required.' });
          return;
        }
        sub.state = 'CLARIFICATION_REQUIRED';
        sub.clarificationNote = note;
        sub.reviewedByUserId = user.userId;
        sub.reviewedByName = user.name;
        sub.reviewedAt = now;
        sub.updatedAt = now;
        sub.history.push({
          timestamp: now,
          actorName: user.name,
          actorRole: user.roleLabel,
          action: 'CLARIFICATION_REQUESTED',
          note,
        });
        pushNotification(db, {
          flatId: sub.flatId,
          type: 'payment',
          title: `Clarification Needed · ${sub.submissionId}`,
          body: note,
          linkScreen: 'maintenance',
        });
        appendAudit(db, {
          actorName: user.name,
          actorRole: user.roleLabel,
          action: 'PAYMENT_CLARIFICATION_REQUESTED',
          entityType: 'PaymentSubmission',
          entityId: sub.submissionId,
          summary: `Requested clarification on Flat ${sub.flatNumber} submission (${sub.bankReference}): ${note}`,
        });
        saveDatabase(db);
        res.json({ submission: sub });
        return;
      }

      if (action === 'reject') {
        if (!note) {
          res.status(400).json({ error: 'A rejection reason is required.' });
          return;
        }
        sub.state = 'REJECTED';
        sub.rejectionReason = note;
        sub.reviewedByUserId = user.userId;
        sub.reviewedByName = user.name;
        sub.reviewedAt = now;
        sub.updatedAt = now;
        sub.history.push({
          timestamp: now,
          actorName: user.name,
          actorRole: user.roleLabel,
          action: 'REJECTED',
          note,
        });
        pushNotification(db, {
          flatId: sub.flatId,
          type: 'payment',
          title: `Payment Proof Rejected · ${sub.submissionId}`,
          body: note,
          linkScreen: 'maintenance',
        });
        appendAudit(db, {
          actorName: user.name,
          actorRole: user.roleLabel,
          action: 'PAYMENT_SUBMISSION_REJECTED',
          entityType: 'PaymentSubmission',
          entityId: sub.submissionId,
          summary: `Rejected Flat ${sub.flatNumber} submission (${sub.bankReference}). Reason: ${note}`,
        });
        saveDatabase(db);
        res.json({ submission: sub });
        return;
      }

      if (action !== 'approve') {
        res.status(400).json({ error: 'Decision action must be approve, clarify, or reject.' });
        return;
      }

      // Separation-of-duties self-approval guard
      if (sub.submittedByUserId === user.userId) {
        res.status(403).json({
          error:
            'Separation of duties: You cannot approve a payment submission that you created yourself. Another authorized committee officer must verify it.',
        });
        return;
      }

      if (sub.state !== 'PENDING_REVIEW' && sub.state !== 'CLARIFICATION_REQUIRED') {
        res.status(400).json({ error: `Cannot approve submission in ${sub.state} state.` });
        return;
      }

      // Duplicate bank reference protection against confirmed payments
      if (
        sub.bankReference &&
        sub.paymentMethod !== 'Cash' &&
        db.payments.some(
          (p) =>
            p.status !== 'Reversed' &&
            p.bankReference.toLowerCase() === sub.bankReference.toLowerCase()
        )
      ) {
        res.status(409).json({
          error: `Duplicate transaction blocked: Bank reference "${sub.bankReference}" is already posted in Payments.`,
        });
        return;
      }

      const seq = String(db.payments.length + 1).padStart(4, '0');
      const payment: PaymentRecord = {
        paymentId: `PAY-2026-${seq}`,
        flatId: sub.flatId,
        flatNumber: sub.flatNumber,
        ownerName: sub.ownerName,
        paymentDate: sub.paymentDate,
        entryDate: now,
        amount: sub.amount,
        paymentMethod: sub.paymentMethod,
        bankReference: sub.bankReference || `SUB-${sub.submissionId}`,
        bankDate: sub.paymentDate,
        targetMonths: [...sub.targetMonths],
        remarks: sub.remarks || `Approved from submission ${sub.submissionId}`,
        status: 'Confirmed',
        verifiedBy: user.name,
        verifiedAt: now,
        idempotencyKey: `SUB-${sub.submissionId}`,
      };

      const { allocations, coveredMonths } = allocatePaymentToBills(
        db,
        payment,
        sub.targetMonths
      );
      if (coveredMonths.length > 0) {
        payment.targetMonths = coveredMonths;
      }
      db.allocations.push(...allocations);
      const receipt = createReceiptForPayment(db, payment, allocations, user.name);
      db.payments.unshift(payment);

      sub.state = 'APPROVED';
      sub.approvedPaymentId = payment.paymentId;
      sub.approvedReceiptId = receipt.receiptId;
      sub.approvedReceiptNumber = receipt.receiptNumber;
      sub.reviewedByUserId = user.userId;
      sub.reviewedByName = user.name;
      sub.reviewedAt = now;
      sub.updatedAt = now;
      sub.history.push({
        timestamp: now,
        actorName: user.name,
        actorRole: user.roleLabel,
        action: 'APPROVED_AND_POSTED',
        note: note || `Verified & posted ${payment.paymentId}; issued ${receipt.receiptNumber}.`,
      });

      pushNotification(db, {
        flatId: sub.flatId,
        type: 'payment',
        title: `Payment Approved · Receipt ${receipt.receiptNumber}`,
        body: `₹${payment.amount.toLocaleString('en-IN')} for Flat ${sub.flatNumber} is verified. Download your PDF receipt anytime.`,
        linkScreen: 'receipts',
      });

      appendAudit(db, {
        actorName: user.name,
        actorRole: user.roleLabel,
        action: 'PAYMENT_SUBMISSION_APPROVED',
        entityType: 'PaymentSubmission',
        entityId: sub.submissionId,
        summary: `Approved ${sub.submissionId} for Flat ${sub.flatNumber} (₹${payment.amount}, ${payment.bankReference}); created ${payment.paymentId} & ${receipt.receiptNumber}.`,
      });

      saveDatabase(db);
      res.json({ submission: sub, payment, receipt });
    } finally {
      approvalInFlight.delete(subId);
    }
  });

  // =========================================================================
  // AREA B & AREA C — GROUP B: FINANCIAL & MAINTENANCE MANAGEMENT
  // (All resident-facing endpoints strictly enforce FlatAccess -> 403)
  // =========================================================================
  app.get('/api/dashboard', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const monthsSet = new Set(db.maintenance.map((b) => b.billingMonth));
    const availableMonths = Array.from(monthsSet).sort();
    const requestedMonth =
      typeof req.query.month === 'string' && req.query.month
        ? req.query.month
        : availableMonths[availableMonths.length - 1] || '2026-11';

    const scopedFlatIds = new Set(scope.flatIds);
    const scopedFlats = db.flats.filter((f) => scopedFlatIds.has(f.flatId) && f.active);

    const monthBills = db.maintenance.filter(
      (b) => b.billingMonth === requestedMonth && scopedFlatIds.has(b.flatId)
    );

    const monthlyDemandGross = monthBills.reduce((s, b) => s + b.grossAmount, 0);
    const monthlyConcessions = monthBills.reduce(
      (s, b) => s + b.doorLockDiscount + b.specialDiscount,
      0
    );
    const monthlyDemandNet = monthBills.reduce((s, b) => s + b.netAmount, 0);

    const confirmedMonthAllocations = db.allocations.filter((a) => {
      if (a.billingMonth !== requestedMonth || !scopedFlatIds.has(a.flatId)) return false;
      const p = db.payments.find((pay) => pay.paymentId === a.paymentId);
      return p?.status === 'Confirmed';
    });
    const monthlyCollections = confirmedMonthAllocations.reduce(
      (s, a) => s + a.allocatedAmount,
      0
    );

    const currentMonthOutstanding = monthBills.reduce((s, b) => s + b.balanceDue, 0);
    const priorBills = db.maintenance.filter(
      (b) => b.billingMonth < requestedMonth && scopedFlatIds.has(b.flatId)
    );
    const historicalArrearsOutstanding = priorBills.reduce((s, b) => s + b.balanceDue, 0);

    const monthlySeries = availableMonths.map((m) => {
      const mBills = db.maintenance.filter(
        (b) => b.billingMonth === m && scopedFlatIds.has(b.flatId)
      );
      return {
        month: m,
        label: formatMonthLabel(m),
        demand: mBills.reduce((s, b) => s + b.netAmount, 0),
        collected: mBills.reduce((s, b) => s + b.allocatedAmount, 0),
      };
    });

    const recentPayments = db.payments
      .filter((p) => scopedFlatIds.has(p.flatId) && p.status === 'Confirmed')
      .slice(0, 8);

    const outstandingFlats = scopedFlats
      .map((flat) => {
        const flatBills = db.maintenance.filter((b) => b.flatId === flat.flatId);
        const currentDue = flatBills
          .filter((b) => b.billingMonth === requestedMonth)
          .reduce((s, b) => s + b.balanceDue, 0);
        const priorArrears = flatBills
          .filter((b) => b.billingMonth < requestedMonth)
          .reduce((s, b) => s + b.balanceDue, 0);
        const unpaidMonths = flatBills
          .filter((b) => b.balanceDue > 0)
          .map((b) => b.billingMonth)
          .sort();
        return {
          flatId: flat.flatId,
          flatNumber: flat.flatNumber,
          ownerName: flat.ownerName,
          occupancyStatus: flat.occupancyStatus,
          currentDue,
          priorArrears,
          totalDue: currentDue + priorArrears,
          unpaidMonths,
        };
      })
      .filter((item) => item.totalDue > 0)
      .sort((a, b) => b.totalDue - a.totalDue);

    const openComplaintsCount = db.complaints.filter(
      (c) =>
        scopedFlatIds.has(c.flatId) &&
        c.status !== 'Resolved' &&
        c.status !== 'Closed'
    ).length;

    const pendingSubmissionsCount = db.paymentSubmissions.filter(
      (s) =>
        (user.role === 'resident' ? scopedFlatIds.has(s.flatId) : true) &&
        (s.state === 'PENDING_REVIEW' || s.state === 'CLARIFICATION_REQUIRED')
    ).length;

    const summary: DashboardSummary = {
      selectedMonth: requestedMonth,
      availableMonths,
      totalFlats: scopedFlats.length,
      occupiedCount: scopedFlats.filter((f) => f.occupancyStatus === 'Occupied').length,
      vacantCount: scopedFlats.filter((f) => f.occupancyStatus === 'Vacant / Door-Lock').length,
      tenantCount: scopedFlats.filter((f) => f.occupancyStatus === 'Tenant').length,
      monthlyDemandGross,
      monthlyConcessions,
      monthlyDemandNet,
      monthlyCollections,
      currentMonthOutstanding,
      historicalArrearsOutstanding,
      totalOutstanding: currentMonthOutstanding + historicalArrearsOutstanding,
      openComplaintsCount,
      pendingSubmissionsCount,
      monthlySeries,
      recentPayments,
      outstandingFlats,
    };

    res.json(summary);
  });

  // Flats Register
  app.get('/api/flats', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const allowedIds = new Set(
      user.role === 'resident'
        ? (requestedFlat ? scope.flatIds : user.allowedFlats.map((f) => f.flatId))
        : requestedFlat
        ? scope.flatIds
        : db.flats.map((f) => f.flatId)
    );
    const flats = db.flats.filter((f) => allowedIds.has(f.flatId));

    const enriched = flats.map((flat) => {
      const flatBills = db.maintenance.filter((b) => b.flatId === flat.flatId);
      const totalBilled = flatBills.reduce((s, b) => s + b.netAmount, 0);
      const totalPaid = flatBills.reduce((s, b) => s + b.allocatedAmount, 0);
      const closingBalance = flatBills.reduce((s, b) => s + b.balanceDue, 0);
      return {
        ...flat,
        totalBilled,
        totalPaid,
        closingBalance,
      };
    });

    res.json({ flats: enriched });
  });

  app.post('/api/flats', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const body = req.body ?? {};
    const flatNumber = String(body.flatNumber ?? '').trim();
    const ownerName = String(body.ownerName ?? '').trim();
    const mobile = String(body.mobile ?? '').trim();

    if (!flatNumber || !ownerName || !mobile) {
      res.status(400).json({ error: 'Flat Number, Owner Name, and Mobile Number are required.' });
      return;
    }
    if (db.flats.some((f) => f.flatNumber.toLowerCase() === flatNumber.toLowerCase())) {
      res.status(409).json({ error: `Flat ${flatNumber} already exists in the Flat Register.` });
      return;
    }

    const doorLockActive = Boolean(body.doorLockActive) || body.occupancyStatus === 'Vacant / Door-Lock';
    const specialDiscountAmount = doorLockActive ? 0 : Math.max(0, Number(body.specialDiscountAmount || 0));
    const maintenanceCategory = doorLockActive
      ? 'Door-Lock (50%)'
      : specialDiscountAmount > 0
      ? 'Special Concession'
      : 'Standard';

    const newFlat: Flat = {
      flatId: `FLT-${flatNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`,
      flatNumber,
      floor: String(body.floor ?? '1st Floor').trim(),
      areaSqFt: Number(body.areaSqFt || 1250),
      ownerName,
      mobile,
      email: String(body.email ?? '').trim(),
      maintenanceCategory,
      occupancyStatus: body.occupancyStatus || (doorLockActive ? 'Vacant / Door-Lock' : 'Occupied'),
      doorLockActive,
      specialDiscountAmount,
      specialDiscountReason: String(body.specialDiscountReason ?? '').trim(),
      openingArrears: Number(body.openingArrears || 0),
      active: true,
      isSampleData: false,
      updatedAt: new Date().toISOString(),
    };

    db.flats.push(newFlat);
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'FLAT_CREATED',
      entityType: 'Flat',
      entityId: newFlat.flatId,
      summary: `Added Flat ${newFlat.flatNumber} (${newFlat.ownerName}) to register.`,
      afterValue: JSON.stringify(newFlat),
    });
    saveDatabase(db);
    res.status(201).json({ flat: newFlat });
  });

  app.put('/api/flats/:id', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const flat = db.flats.find((f) => f.flatId === req.params.id);
    if (!flat) {
      res.status(404).json({ error: 'Flat record not found.' });
      return;
    }

    const before = JSON.stringify(flat);
    const body = req.body ?? {};
    const doorLockActive =
      body.doorLockActive !== undefined
        ? Boolean(body.doorLockActive)
        : body.occupancyStatus === 'Vacant / Door-Lock';
    const specialDiscountAmount = doorLockActive
      ? 0
      : Math.max(0, Number(body.specialDiscountAmount ?? flat.specialDiscountAmount));

    flat.ownerName = String(body.ownerName ?? flat.ownerName).trim();
    flat.mobile = String(body.mobile ?? flat.mobile).trim();
    flat.email = String(body.email ?? flat.email).trim();
    flat.floor = String(body.floor ?? flat.floor).trim();
    flat.areaSqFt = Number(body.areaSqFt ?? flat.areaSqFt);
    flat.occupancyStatus = body.occupancyStatus ?? flat.occupancyStatus;
    flat.doorLockActive = doorLockActive;
    flat.specialDiscountAmount = specialDiscountAmount;
    flat.specialDiscountReason = String(
      body.specialDiscountReason ?? flat.specialDiscountReason
    ).trim();
    flat.maintenanceCategory = doorLockActive
      ? 'Door-Lock (50%)'
      : specialDiscountAmount > 0
      ? 'Special Concession'
      : 'Standard';
    flat.active = body.active !== undefined ? Boolean(body.active) : flat.active;
    flat.updatedAt = new Date().toISOString();

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'FLAT_UPDATED',
      entityType: 'Flat',
      entityId: flat.flatId,
      summary: `Updated Flat ${flat.flatNumber} (${flat.ownerName}).`,
      beforeValue: before,
      afterValue: JSON.stringify(flat),
    });
    saveDatabase(db);
    res.json({ flat });
  });

  // Maintenance Billing
  app.get('/api/maintenance', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;

    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }

    const allowedSet = new Set(scope.flatIds);
    let bills = db.maintenance;
    if (user.role === 'resident' || requestedFlat) {
      bills = bills.filter((b) => allowedSet.has(b.flatId));
    }
    if (month) {
      bills = bills.filter((b) => b.billingMonth === month);
    }

    const months = Array.from(new Set(db.maintenance.map((b) => b.billingMonth))).sort();
    const activeRate = month
      ? getRateForMonth(db.settings, month)
      : getRateForMonth(db.settings, months[months.length - 1] || '2026-11');

    res.json({
      bills,
      months,
      activeRate,
      rateHistory: db.settings.rateHistory,
    });
  });

  app.post('/api/maintenance/generate', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const { billingMonth } = req.body ?? {};
    if (!billingMonth || !/^\d{4}-\d{2}$/.test(String(billingMonth))) {
      res.status(400).json({ error: 'Valid billing month in YYYY-MM format is required.' });
      return;
    }

    const existing = db.maintenance.filter((b) => b.billingMonth === billingMonth);
    const existingFlatIds = new Set(existing.map((b) => b.flatId));
    const activeFlats = db.flats.filter((f) => f.active);

    const flatsToBill = activeFlats.filter((f) => !existingFlatIds.has(f.flatId));
    if (flatsToBill.length === 0) {
      res.status(409).json({
        error: `Duplicate bill protection: Maintenance bills for ${billingMonth} have already been generated for all ${activeFlats.length} active flats.`,
      });
      return;
    }

    const rate = getRateForMonth(db.settings, billingMonth);
    const createdBills: MaintenanceBill[] = [];

    for (const flat of flatsToBill) {
      const gross = rate.baseMonthlyCharge;
      const doorLock = flat.doorLockActive
        ? Math.round((gross * rate.doorLockDiscountPercent) / 100)
        : 0;
      const special = !flat.doorLockActive ? Math.min(gross, flat.specialDiscountAmount) : 0;
      const net = Math.max(0, gross - doorLock - special);

      const bill: MaintenanceBill = {
        billId: `BILL-${billingMonth.replace('-', '')}-${flat.flatNumber}`,
        flatId: flat.flatId,
        flatNumber: flat.flatNumber,
        ownerName: flat.ownerName,
        billingMonth,
        grossAmount: gross,
        doorLockDiscount: doorLock,
        specialDiscount: special,
        otherCharges: 0,
        netAmount: net,
        allocatedAmount: 0,
        balanceDue: net,
        status: 'Unpaid',
        generatedAt: new Date().toISOString(),
        generatedBy: user.name,
        notes:
          doorLock > 0
            ? `${rate.doorLockDiscountPercent}% Door-lock concession`
            : special > 0
            ? flat.specialDiscountReason || 'Approved special concession'
            : `Standard tariff (${rate.effectiveFrom})`,
      };
      db.maintenance.push(bill);
      createdBills.push(bill);

      pushNotification(db, {
        flatId: flat.flatId,
        type: 'bill',
        title: `${formatMonthLabel(billingMonth)} Maintenance Bill Generated`,
        body: `Net payable for Flat ${flat.flatNumber}: ₹${net.toLocaleString('en-IN')}.`,
        linkScreen: 'maintenance',
      });
    }

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'BILL_RUN_GENERATED',
      entityType: 'Maintenance',
      entityId: billingMonth,
      summary: `Generated ${createdBills.length} maintenance bills for ${billingMonth} at base rate ₹${rate.baseMonthlyCharge}.`,
    });

    saveDatabase(db);
    res.status(201).json({
      createdCount: createdBills.length,
      billingMonth,
      bills: createdBills,
    });
  });

  app.put('/api/maintenance/:id/discount', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const bill = db.maintenance.find((b) => b.billId === req.params.id);
    if (!bill) {
      res.status(404).json({ error: 'Maintenance bill not found.' });
      return;
    }

    const before = `DoorLock: ${bill.doorLockDiscount}, Special: ${bill.specialDiscount}, Other: ${bill.otherCharges}`;
    const rate = getRateForMonth(db.settings, bill.billingMonth);
    const doorLockEnabled = Boolean(req.body.doorLockEnabled);
    const specialDiscount = doorLockEnabled
      ? 0
      : Math.max(0, Math.min(bill.grossAmount, Number(req.body.specialDiscount || 0)));
    const otherCharges = Math.max(0, Number(req.body.otherCharges || 0));

    bill.doorLockDiscount = doorLockEnabled
      ? Math.round((bill.grossAmount * rate.doorLockDiscountPercent) / 100)
      : 0;
    bill.specialDiscount = specialDiscount;
    bill.otherCharges = otherCharges;
    bill.notes = String(req.body.notes ?? bill.notes).trim();

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'BILL_CONCESSION_UPDATED',
      entityType: 'Maintenance',
      entityId: bill.billId,
      summary: `Updated concessions/charges for Flat ${bill.flatNumber} (${bill.billingMonth}).`,
      beforeValue: before,
      afterValue: `DoorLock: ${bill.doorLockDiscount}, Special: ${bill.specialDiscount}, Other: ${bill.otherCharges}`,
    });

    saveDatabase(db);
    res.json({ bill });
  });

  app.post('/api/settings/rates', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const { effectiveFrom, baseMonthlyCharge, doorLockDiscountPercent, description } =
      req.body ?? {};
    if (!effectiveFrom || !/^\d{4}-\d{2}$/.test(String(effectiveFrom))) {
      res.status(400).json({ error: 'Effective month (YYYY-MM) is required.' });
      return;
    }
    const charge = Number(baseMonthlyCharge);
    const doorLockPct = Number(doorLockDiscountPercent ?? 50);
    if (!charge || charge <= 0) {
      res.status(400).json({ error: 'Base monthly charge must be greater than zero.' });
      return;
    }

    const existingIndex = db.settings.rateHistory.findIndex(
      (r) => r.effectiveFrom === effectiveFrom
    );
    const rule = {
      rateId: `RATE-${effectiveFrom}`,
      effectiveFrom: String(effectiveFrom),
      baseMonthlyCharge: charge,
      doorLockDiscountPercent: doorLockPct,
      description: String(description || `Effective ${effectiveFrom} maintenance tariff`).trim(),
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      db.settings.rateHistory[existingIndex] = rule;
    } else {
      db.settings.rateHistory.push(rule);
    }
    db.settings.standardMonthlyRate = charge;
    db.settings.doorLockDiscountPercent = doorLockPct;

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'RATE_RULE_SAVED',
      entityType: 'Settings',
      entityId: rule.rateId,
      summary: `Saved effective-dated rate ₹${charge}/mo (${doorLockPct}% door-lock) from ${effectiveFrom}. Historical bills remain unaltered.`,
    });

    saveDatabase(db);
    res.status(201).json({ rateRule: rule, rateHistory: db.settings.rateHistory });
  });

  // Payments & Allocations
  app.get('/api/payments', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const allowedSet = new Set(scope.flatIds);
    const payments =
      user.role === 'resident' || requestedFlat
        ? db.payments.filter((p) => allowedSet.has(p.flatId))
        : db.payments;
    res.json({ payments });
  });

  app.post('/api/payments', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const {
      flatId,
      paymentDate,
      amount,
      paymentMethod,
      bankReference,
      bankDate,
      targetMonths,
      remarks,
      mode,
    } = req.body ?? {};

    const flat = db.flats.find((f) => f.flatId === flatId || f.flatNumber === flatId);
    if (!flat) {
      res.status(404).json({ error: 'Selected flat was not found.' });
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than ₹0.' });
      return;
    }
    if (!paymentDate) {
      res.status(400).json({ error: 'Payment date is required.' });
      return;
    }

    const cleanBankRef = String(bankReference ?? '').trim();
    if (
      cleanBankRef &&
      paymentMethod !== 'Cash' &&
      db.payments.some(
        (p) =>
          p.status !== 'Reversed' &&
          p.bankReference.toLowerCase() === cleanBankRef.toLowerCase()
      )
    ) {
      res.status(409).json({
        error: `Duplicate transaction blocked: Bank reference "${cleanBankRef}" is already recorded.`,
      });
      return;
    }

    const monthsArr: string[] = Array.isArray(targetMonths)
      ? targetMonths.map(String)
      : [];

    const seq = String(db.payments.length + 1).padStart(4, '0');
    const paymentId = `PAY-2026-${seq}`;
    const isConfirm = mode === 'confirm' || mode === 'confirm_and_receipt';

    const payment: PaymentRecord = {
      paymentId,
      flatId: flat.flatId,
      flatNumber: flat.flatNumber,
      ownerName: flat.ownerName,
      paymentDate: String(paymentDate),
      entryDate: new Date().toISOString(),
      amount: numericAmount,
      paymentMethod: (paymentMethod as PaymentMethod) || 'UPI',
      bankReference: cleanBankRef || `REF-${seq}`,
      bankDate: String(bankDate || paymentDate),
      targetMonths: monthsArr,
      remarks: String(remarks ?? '').trim(),
      status: isConfirm ? 'Confirmed' : 'Draft',
      idempotencyKey: `${flat.flatId}-${paymentDate}-${numericAmount}-${cleanBankRef || seq}`,
    };

    let receipt: ReceiptRecord | undefined;

    if (isConfirm) {
      payment.verifiedBy = user.name;
      payment.verifiedAt = new Date().toISOString();
      const { allocations, coveredMonths } = allocatePaymentToBills(
        db,
        payment,
        monthsArr
      );
      if (coveredMonths.length > 0) {
        payment.targetMonths = coveredMonths;
      }
      db.allocations.push(...allocations);
      receipt = createReceiptForPayment(db, payment, allocations, user.name);

      pushNotification(db, {
        flatId: flat.flatId,
        type: 'payment',
        title: `Receipt ${receipt.receiptNumber} Issued`,
        body: `₹${payment.amount.toLocaleString('en-IN')} payment recorded for Flat ${flat.flatNumber}.`,
        linkScreen: 'receipts',
      });
    }

    db.payments.unshift(payment);

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: isConfirm ? 'PAYMENT_CONFIRMED' : 'PAYMENT_DRAFT_SAVED',
      entityType: 'Payment',
      entityId: payment.paymentId,
      summary: isConfirm
        ? `Confirmed ₹${payment.amount} for Flat ${payment.flatNumber} (${payment.targetMonths.join(', ')}) and issued ${receipt?.receiptNumber}.`
        : `Saved draft payment ₹${payment.amount} for Flat ${payment.flatNumber} (unverified; invoices unaffected).`,
    });

    saveDatabase(db);
    res.status(201).json({ payment, receipt });
  });

  app.post('/api/payments/:id/verify', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const payment = db.payments.find((p) => p.paymentId === req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    if (payment.status !== 'Draft') {
      res.status(400).json({ error: `Payment is already ${payment.status}.` });
      return;
    }

    payment.status = 'Confirmed';
    payment.verifiedBy = user.name;
    payment.verifiedAt = new Date().toISOString();

    const { allocations, coveredMonths } = allocatePaymentToBills(
      db,
      payment,
      payment.targetMonths
    );
    if (coveredMonths.length > 0) {
      payment.targetMonths = coveredMonths;
    }
    db.allocations.push(...allocations);
    const receipt = createReceiptForPayment(db, payment, allocations, user.name);

    pushNotification(db, {
      flatId: payment.flatId,
      type: 'payment',
      title: `Receipt ${receipt.receiptNumber} Issued`,
      body: `₹${payment.amount.toLocaleString('en-IN')} verified for Flat ${payment.flatNumber}.`,
      linkScreen: 'receipts',
    });

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'PAYMENT_VERIFIED_AND_POSTED',
      entityType: 'Payment',
      entityId: payment.paymentId,
      summary: `Verified bank reference ${payment.bankReference} for Flat ${payment.flatNumber} (₹${payment.amount}); issued ${receipt.receiptNumber}.`,
    });

    saveDatabase(db);
    res.json({ payment, receipt });
  });

  app.post('/api/payments/:id/reverse', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const payment = db.payments.find((p) => p.paymentId === req.params.id);
    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    if (payment.status === 'Reversed') {
      res.status(400).json({ error: 'Payment has already been reversed.' });
      return;
    }
    const reason = String(req.body?.reason ?? '').trim();
    if (!reason) {
      res.status(400).json({ error: 'A reversal reason is required for the audit trail.' });
      return;
    }

    payment.status = 'Reversed';
    payment.reversalReason = reason;
    payment.reversedBy = user.name;
    payment.reversedAt = new Date().toISOString();

    if (payment.receiptId) {
      const rec = db.receipts.find((r) => r.receiptId === payment.receiptId);
      if (rec) {
        rec.status = 'Cancelled / Reversed';
      }
    }

    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'PAYMENT_REVERSED',
      entityType: 'Payment',
      entityId: payment.paymentId,
      summary: `Reversed payment ${payment.paymentId} (₹${payment.amount}, Flat ${payment.flatNumber}). Reason: ${reason}. Original record preserved.`,
    });

    saveDatabase(db);
    res.json({ payment });
  });

  // Receipts
  app.get('/api/receipts', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlat = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const allowedSet = new Set(scope.flatIds);
    const receipts =
      user.role === 'resident' || requestedFlat
        ? db.receipts.filter((r) => allowedSet.has(r.flatId))
        : db.receipts;
    res.json({ receipts, society: db.settings });
  });

  app.get('/api/receipts/:id/pdf', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const receipt = db.receipts.find(
      (r) => r.receiptId === req.params.id || r.receiptNumber === req.params.id
    );
    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found.' });
      return;
    }
    if (!isFlatAccessible(user, receipt.flatId)) {
      res.status(403).json({ error: 'Access denied to another flat’s receipt.' });
      return;
    }
    const pdfBuffer = generateReceiptPdfBuffer(receipt, db.settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${receipt.receiptNumber}-Flat-${receipt.flatNumber}.pdf"`
    );
    res.send(pdfBuffer);
  });

  // Flat-wise Account Ledger
  app.get('/api/ledger', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const requestedFlatId = typeof req.query.flatId === 'string' ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlatId || (user.role === 'resident' ? undefined : 'FLT-101'));
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const flat = scope.singleFlat;
    if (!flat) {
      res.status(404).json({ error: 'Flat not found.' });
      return;
    }

    const entries: Omit<LedgerEntry, 'runningBalance'>[] = [];

    for (const bill of db.maintenance.filter((b) => b.flatId === flat.flatId)) {
      entries.push({
        date: `${bill.billingMonth}-01`,
        refNo: bill.billId,
        type: 'Bill',
        description: `Maintenance Bill (${formatMonthLabel(bill.billingMonth)}) — Gross ₹${bill.grossAmount}${
          bill.doorLockDiscount + bill.specialDiscount > 0
            ? `, Concession -₹${bill.doorLockDiscount + bill.specialDiscount}`
            : ''
        }`,
        debit: bill.netAmount,
        credit: 0,
        status: bill.status,
      });
    }

    for (const pay of db.payments.filter((p) => p.flatId === flat.flatId)) {
      if (pay.status === 'Confirmed' || pay.status === 'Reversed') {
        entries.push({
          date: pay.paymentDate,
          refNo: pay.receiptNumber || pay.paymentId,
          type: 'Payment',
          description: `${pay.paymentMethod} (${pay.bankReference}) — Months: ${pay.targetMonths.join(', ')}`,
          debit: 0,
          credit: pay.amount,
          status: pay.status,
        });
      }
      if (pay.status === 'Reversed') {
        entries.push({
          date: pay.reversedAt ? pay.reversedAt.slice(0, 10) : pay.paymentDate,
          refNo: `${pay.paymentId}-REV`,
          type: 'Reversal',
          description: `Reversal: ${pay.reversalReason || 'Cancelled'}`,
          debit: pay.amount,
          credit: 0,
          status: 'Reversed',
        });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = flat.openingArrears;
    const ledger: LedgerEntry[] = entries.map((e) => {
      running = running + e.debit - e.credit;
      return {
        ...e,
        runningBalance: running,
      };
    });

    res.json({
      flat,
      openingArrears: flat.openingArrears,
      closingBalance: running,
      ledger,
    });
  });

  // Financial Reports
  app.get('/api/reports', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const type = String(req.query.type || 'monthly_collection');
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    const requestedFlat = typeof req.query.flatId === 'string' && req.query.flatId ? req.query.flatId : undefined;
    const scope = resolveAuthorizedFlatIds(db, user, requestedFlat);
    if (!scope.ok) {
      res.status(scope.status).json({ error: scope.error });
      return;
    }
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';

    const flatIds = new Set(scope.flatIds);
    const flats = db.flats.filter((f) => flatIds.has(f.flatId));

    if (type === 'monthly_collection') {
      const bills = db.maintenance.filter(
        (b) => flatIds.has(b.flatId) && (!month || b.billingMonth === month)
      );
      const rows = bills.map((b) => ({
        billId: b.billId,
        month: b.billingMonth,
        flatNumber: b.flatNumber,
        ownerName: b.ownerName,
        grossAmount: b.grossAmount,
        discounts: b.doorLockDiscount + b.specialDiscount,
        netBilled: b.netAmount,
        collected: b.allocatedAmount,
        balanceDue: b.balanceDue,
        status: b.status,
      }));
      res.json({ type, rows });
      return;
    }

    if (type === 'flat_statement') {
      const rows = flats.map((f) => {
        const fBills = db.maintenance.filter(
          (b) => b.flatId === f.flatId && (!month || b.billingMonth === month)
        );
        return {
          flatNumber: f.flatNumber,
          ownerName: f.ownerName,
          category: f.maintenanceCategory,
          occupancy: f.occupancyStatus,
          gross: fBills.reduce((s, b) => s + b.grossAmount, 0),
          discounts: fBills.reduce((s, b) => s + b.doorLockDiscount + b.specialDiscount, 0),
          netBilled: fBills.reduce((s, b) => s + b.netAmount, 0),
          collected: fBills.reduce((s, b) => s + b.allocatedAmount, 0),
          balance: fBills.reduce((s, b) => s + b.balanceDue, 0),
        };
      });
      res.json({ type, rows });
      return;
    }

    if (type === 'receipt_register') {
      const rows = db.receipts
        .filter((r) => {
          if (!flatIds.has(r.flatId)) return false;
          if (from && r.receiptDate < from) return false;
          if (to && r.receiptDate > to) return false;
          if (month && !r.allocations.some((a) => a.billingMonth === month)) return false;
          return true;
        })
        .map((r) => ({
          receiptNumber: r.receiptNumber,
          receiptDate: r.receiptDate,
          flatNumber: r.flatNumber,
          ownerName: r.ownerName,
          paymentMethod: r.paymentMethod,
          bankReference: r.bankReference,
          maintenancePeriod: r.maintenancePeriod,
          amountReceived: r.amountReceived,
          status: r.status,
        }));
      res.json({ type, rows });
      return;
    }

    if (type === 'outstanding_dues') {
      const rows = flats
        .map((f) => {
          const unpaidBills = db.maintenance.filter(
            (b) =>
              b.flatId === f.flatId &&
              b.balanceDue > 0 &&
              (!month || b.billingMonth <= month)
          );
          const totalDue = unpaidBills.reduce((s, b) => s + b.balanceDue, 0);
          return {
            flatNumber: f.flatNumber,
            ownerName: f.ownerName,
            mobile: f.mobile,
            unpaidMonthsCount: unpaidBills.length,
            unpaidMonths: unpaidBills.map((b) => b.billingMonth).join(', '),
            totalDue,
          };
        })
        .filter((r) => r.totalDue > 0);
      res.json({ type, rows });
      return;
    }

    if (type === 'discount_report') {
      const rows = db.maintenance
        .filter(
          (b) =>
            flatIds.has(b.flatId) &&
            (!month || b.billingMonth === month) &&
            b.doorLockDiscount + b.specialDiscount > 0
        )
        .map((b) => ({
          month: b.billingMonth,
          flatNumber: b.flatNumber,
          ownerName: b.ownerName,
          grossAmount: b.grossAmount,
          doorLockDiscount: b.doorLockDiscount,
          specialDiscount: b.specialDiscount,
          netPayable: b.netAmount,
          reason: b.notes,
        }));
      res.json({ type, rows });
      return;
    }

    const months = Array.from(new Set(db.maintenance.map((b) => b.billingMonth))).sort();
    const rows = months.map((m) => {
      const mBills = db.maintenance.filter(
        (b) => b.billingMonth === m && flatIds.has(b.flatId)
      );
      const grossDemand = mBills.reduce((s, b) => s + b.grossAmount, 0);
      const concessions = mBills.reduce(
        (s, b) => s + b.doorLockDiscount + b.specialDiscount,
        0
      );
      const netDemand = mBills.reduce((s, b) => s + b.netAmount, 0);
      const collected = mBills.reduce((s, b) => s + b.allocatedAmount, 0);
      const outstanding = mBills.reduce((s, b) => s + b.balanceDue, 0);
      return {
        month: m,
        label: formatMonthLabel(m),
        flatsBilled: mBills.length,
        grossDemand,
        concessions,
        netDemand,
        collected,
        outstanding,
        collectionRatePct: netDemand > 0 ? Math.round((collected / netDemand) * 100) : 0,
      };
    });
    res.json({ type, rows });
  });

  // Audit Log & Settings
  app.get('/api/audit', requireAdmin, (_req, res) => {
    const db = loadDatabase();
    res.json({ auditLog: db.auditLog });
  });

  app.get('/api/settings', requireAuth, (_req, res) => {
    const db = loadDatabase();
    res.json({ settings: db.settings });
  });

  app.put('/api/settings', requireAdmin, (req, res) => {
    const user = (req as express.Request & { user: UserSession }).user;
    const db = loadDatabase();
    const body = req.body ?? {};
    db.settings = {
      ...db.settings,
      societyName: String(body.societyName ?? db.settings.societyName).trim(),
      address: String(body.address ?? db.settings.address).trim(),
      contactEmail: String(body.contactEmail ?? db.settings.contactEmail).trim(),
      contactPhone: String(body.contactPhone ?? db.settings.contactPhone).trim(),
      officeHours: String(body.officeHours ?? db.settings.officeHours).trim(),
      bankDetails: String(body.bankDetails ?? db.settings.bankDetails).trim(),
      upiId: String(body.upiId ?? db.settings.upiId).trim(),
    };
    appendAudit(db, {
      actorName: user.name,
      actorRole: user.roleLabel,
      action: 'SETTINGS_UPDATED',
      entityType: 'Settings',
      entityId: 'SOCIETY-CONFIG',
      summary: 'Updated society association profile and bank details.',
    });
    saveDatabase(db);
    res.json({ settings: db.settings });
  });

  // Google Apps Script project files reader
  app.get('/api/gas-files', requireAdmin, (_req, res) => {
    const gasDir = path.resolve(process.cwd(), 'gas-project', 'SmartSocietyWebsite');
    if (!fs.existsSync(gasDir)) {
      res.json({ files: [] });
      return;
    }
    const names = fs.readdirSync(gasDir).sort();
    const files = names
      .filter((name) => !fs.statSync(path.join(gasDir, name)).isDirectory())
      .map((name) => ({
        name,
        content: fs.readFileSync(path.join(gasDir, name), 'utf-8'),
      }));
    res.json({ files });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Society 4.0 server running on http://localhost:${PORT}`);
  });
}

startServer();
