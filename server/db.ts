import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  AccountActivation,
  Announcement,
  AuditLogEntry,
  CommitteeMember,
  CommunityEvent,
  Complaint,
  ComplaintStatus,
  ContactSubmission,
  Flat,
  FlatAccessGrant,
  GalleryItem,
  MaintenanceBill,
  NotificationItem,
  NotificationPreferences,
  PaymentAllocation,
  PaymentRecord,
  PaymentSubmission,
  ReceiptRecord,
  ResidentDocument,
  SocietySettings,
  UserRole,
  UserStatus,
  WebsiteContent,
  WebsiteState,
} from '../src/types/society.ts';

export interface StoredUser {
  userId: string;
  name: string;
  email: string;
  mobile: string;
  passwordHash: string;
  role: UserRole;
  roleLabel: string;
  status: UserStatus;
  flatId?: string;
}

export interface SocietyDatabase {
  settings: SocietySettings;
  website: WebsiteState;
  committee: CommitteeMember[];
  gallery: GalleryItem[];
  announcements: Announcement[];
  events: CommunityEvent[];
  complaints: Complaint[];
  documents: ResidentDocument[];
  users: StoredUser[];
  flatAccess: FlatAccessGrant[];
  accountActivations: AccountActivation[];
  flats: Flat[];
  maintenance: MaintenanceBill[];
  payments: PaymentRecord[];
  paymentSubmissions: PaymentSubmission[];
  allocations: PaymentAllocation[];
  receipts: ReceiptRecord[];
  notifications: NotificationItem[];
  notificationPreferences: NotificationPreferences[];
  auditLog: AuditLogEntry[];
  contacts: ContactSubmission[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'society-db.json');
const EVIDENCE_DIR = path.resolve(DATA_DIR, 'private-evidence');

export function normalizeMobile(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export function legacyHashPassword(password: string): string {
  return crypto.createHash('sha256').update(`smart-society-salt:${password}`).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hexKey] = parts;
    const keyBuf = Buffer.from(hexKey, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  }
  // Legacy sha256 fallback (auto-upgraded to scrypt on successful login)
  const legacy = Buffer.from(legacyHashPassword(password), 'utf-8');
  const stored = Buffer.from(storedHash, 'utf-8');
  if (legacy.length !== stored.length) return false;
  return crypto.timingSafeEqual(legacy, stored);
}

export function hashActivationCode(code: string): string {
  return crypto
    .createHash('sha256')
    .update(`ss-activation-v4:${String(code).trim().toUpperCase()}`)
    .digest('hex');
}

export function isStrongResidentPassword(
  password: string,
  mobile: string,
  flatNumbers: string[]
): { valid: boolean; reason?: string } {
  const pwd = String(password || '');
  if (pwd.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
    return {
      valid: false,
      reason: 'Password must contain both letters and at least one number.',
    };
  }
  const cleanPwd = pwd.trim().toLowerCase();
  const normMob = normalizeMobile(mobile);
  if (normMob && (cleanPwd === normMob || cleanPwd.includes(normMob))) {
    return { valid: false, reason: 'Password cannot be your mobile number.' };
  }
  for (const fn of flatNumbers) {
    const cleanFlat = fn.trim().toLowerCase();
    if (cleanFlat && (cleanPwd === cleanFlat || cleanPwd === `flat${cleanFlat}`)) {
      return { valid: false, reason: 'Password cannot be your flat number.' };
    }
  }
  return { valid: true };
}

const ALLOWED_EVIDENCE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

function detectBufferMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  // PDF: %PDF-
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }
  return null;
}

export function savePrivateEvidenceFile(
  dataUrlOrBase64: string,
  originalFileName: string
): { fileId: string; fileName: string; mimeType: string } {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  let base64Payload = dataUrlOrBase64;
  let declaredMime = '';
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrlOrBase64);
  if (match) {
    declaredMime = match[1].toLowerCase();
    base64Payload = match[2];
  }

  const buffer = Buffer.from(base64Payload, 'base64');
  if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) {
    throw new Error('Evidence file must be non-empty and up to 3 MB in size.');
  }

  const detectedMime = detectBufferMime(buffer);
  if (!detectedMime || !ALLOWED_EVIDENCE_MIME[detectedMime]) {
    throw new Error('Only valid JPG, PNG, or PDF files are permitted for payment proof or photos.');
  }
  if (declaredMime && declaredMime !== detectedMime && !(declaredMime === 'image/jpg' && detectedMime === 'image/jpeg')) {
    throw new Error('Uploaded file signature does not match declared file type.');
  }

  const ext = ALLOWED_EVIDENCE_MIME[detectedMime];
  const fileId = `EVD-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const safePath = path.resolve(EVIDENCE_DIR, fileId);
  if (!safePath.startsWith(EVIDENCE_DIR + path.sep)) {
    throw new Error('Invalid storage path.');
  }
  fs.writeFileSync(safePath, buffer);

  const sanitizedName =
    String(originalFileName || `evidence.${ext}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80) || `evidence.${ext}`;

  return { fileId, fileName: sanitizedName, mimeType: detectedMime };
}

export function readPrivateEvidenceFile(fileId: string): { buffer: Buffer; mimeType: string } | null {
  if (!fileId || !/^[a-zA-Z0-9._-]+$/.test(fileId)) {
    return null;
  }
  const safePath = path.resolve(EVIDENCE_DIR, fileId);
  if (!safePath.startsWith(EVIDENCE_DIR + path.sep) || !fs.existsSync(safePath)) {
    return null;
  }
  const buffer = fs.readFileSync(safePath);
  const mimeType = detectBufferMime(buffer) || 'application/octet-stream';
  return { buffer, mimeType };
}

export function getRateForMonth(settings: SocietySettings, billingMonth: string) {
  const sorted = [...settings.rateHistory].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom)
  );
  const match = sorted.find((r) => r.effectiveFrom <= billingMonth);
  return (
    match ?? {
      rateId: 'RATE-DEFAULT',
      effectiveFrom: '2026-01',
      baseMonthlyCharge: settings.standardMonthlyRate,
      doorLockDiscountPercent: settings.doorLockDiscountPercent,
      description: 'Standard monthly rate',
      createdBy: 'System',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
  );
}

// Financial integrity guarantee: ONLY Confirmed PaymentRecords count toward balances.
// Unapproved PaymentSubmissions (DRAFT, PENDING_REVIEW, CLARIFICATION_REQUIRED, REJECTED) NEVER reduce dues.
export function recalculateAllBalances(db: SocietyDatabase): void {
  const confirmedPaymentIds = new Set(
    db.payments.filter((p) => p.status === 'Confirmed').map((p) => p.paymentId)
  );

  for (const bill of db.maintenance) {
    const allocated = db.allocations
      .filter((a) => a.billId === bill.billId && confirmedPaymentIds.has(a.paymentId))
      .reduce((sum, a) => sum + a.allocatedAmount, 0);

    const net = Math.max(
      0,
      bill.grossAmount - bill.doorLockDiscount - bill.specialDiscount + bill.otherCharges
    );
    bill.netAmount = net;
    bill.allocatedAmount = Math.min(net, allocated);
    bill.balanceDue = Math.max(0, net - bill.allocatedAmount);

    if (bill.balanceDue === 0) {
      bill.status = 'Paid';
    } else if (bill.allocatedAmount > 0) {
      bill.status = 'Partial';
    } else {
      bill.status = 'Unpaid';
    }
  }
}

function buildDefaultCommunityData() {
  const defaultContent: WebsiteContent = {
    associationName: 'HAPPY HOMES PALACE-B',
    subtitle: 'Owners Welfare Association',
    themeTagline: 'Our Home, Our Community',
    heroTitle: 'WELCOME TO HAPPY HOMES PALACE-B',
    heroTagline: 'More Than an Apartment. A Place to Belong.',
    heroDescription:
      'A welcoming community where neighbours connect, families thrive, and we work together to make every day better.',
    heroImageUrl: '/src/assets/images/hero_happy_homes_facade_1795426885098.jpg',
    heroImageLabel: 'Illustrative Preview Photograph — Replace with Authorized Building Photo',
    storyHeading: 'A Community Built on Togetherness.',
    storyParagraph1:
      'Happy Homes Palace-B is more than a residential complex. It is a community where residents share experiences, celebrate traditions, and work together to create a peaceful, safe and welcoming environment.',
    storyParagraph2:
      'Guided by our elected Owners Welfare Association, every shared facility—from landscaped courtyard gardens and rainwater harvesting to lift upkeep and transparent maintenance accounting—is stewarded with neighborly care.',
    storyImageUrl: '/src/assets/images/community_courtyard_garden_1795426886061.jpg',
    storyImageLabel: 'Illustrative Courtyard Preview — Replace via Admin Content Studio',
    statFlats: '10 Pilot Residences (101–110)',
    statBlocks: 'Block B Wing',
    statFacilities: '6 Shared Amenities',
    statYears: 'Established 2021',
    amenitiesList: [
      {
        title: 'Landscaped Courtyard & Walking Path',
        description: 'Shaded morning walkway bordered by frangipani trees and stone seating pergolas.',
      },
      {
        title: 'Residents Clubhouse & Reading Lounge',
        description: 'Sunlit multipurpose gathering hall for committee meetings, festivals, and indoor games.',
      },
      {
        title: '24×7 Security & Visitor Intercom',
        description: 'Manned main entrance gate, CCTV perimeter coverage, and intercom access to all flats.',
      },
      {
        title: 'Automatic Passenger Lift & Power Backup',
        description: 'Routine monthly preventive servicing with DG backup for common lighting and lifts.',
      },
      {
        title: 'Rainwater Harvesting & Solar Lighting',
        description: 'Recharge pits and solar courtyard pathway illumination supporting sustainable upkeep.',
      },
      {
        title: 'Covered Two-Wheeler & Car Parking',
        description: 'Clearly demarcated resident bays and segregated wet/dry waste collection zone.',
      },
    ],
    mapCoordinatesLabel: 'Plot 14, Palace-B Enclave, Indiranagar 2nd Stage, Bengaluru 560038',
    updatedAt: '2026-11-01T09:00:00.000Z',
  };

  const website: WebsiteState = {
    published: { ...defaultContent },
    draft: { ...defaultContent },
    hasUnpublishedDraft: false,
  };

  const committee: CommitteeMember[] = [
    {
      memberId: 'COM-01',
      name: 'Narasimha Murthy',
      designation: 'President',
      intro: 'Coordinates annual general body governance, civic liaison, and long-term capital improvements.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 1,
      published: true,
    },
    {
      memberId: 'COM-02',
      name: 'Meenakshi Sundaram',
      designation: 'Vice President',
      intro: 'Leads cultural celebrations, senior citizen outreach, and courtyard greenery initiatives.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 2,
      published: true,
    },
    {
      memberId: 'COM-03',
      name: 'Raghavendra Kulkarni',
      designation: 'Secretary',
      intro: 'Manages association communications, notices, vendor AMC contracts, and resident requests.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 3,
      published: true,
    },
    {
      memberId: 'COM-04',
      name: 'Priya Nair',
      designation: 'Joint Secretary',
      intro: 'Oversees clubhouse bookings, waste segregation drives, and resident onboarding.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 4,
      published: true,
    },
    {
      memberId: 'COM-05',
      name: 'Lakshmi Narayanan',
      designation: 'Treasurer',
      intro: 'Stewards monthly maintenance billing, bank reconciliation, numbered receipts, and annual audits.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 5,
      published: true,
    },
    {
      memberId: 'COM-06',
      name: 'Harishankar Menon',
      designation: 'Executive Member',
      intro: 'Supports electrical, plumbing, and lift preventive maintenance inspections.',
      term: '2025 – 2027',
      photoUrl: '',
      order: 6,
      published: true,
    },
  ];

  const gallery: GalleryItem[] = [
    {
      photoId: 'GAL-01',
      title: 'Happy Homes Palace-B Facade at Golden Hour',
      description: 'Illustrative preview visual of the main residential elevation and garden entrance.',
      category: 'Our Apartment',
      date: '2026-10-15',
      order: 1,
      featured: true,
      isPlaceholder: true,
      imageUrl: '/src/assets/images/hero_happy_homes_facade_1795426885098.jpg',
    },
    {
      photoId: 'GAL-02',
      title: 'Morning Courtyard & Frangipani Walkway',
      description: 'Illustrative preview visual of the central landscaped garden and shaded seating pergola.',
      category: 'Common Areas',
      date: '2026-10-20',
      order: 2,
      featured: true,
      isPlaceholder: true,
      imageUrl: '/src/assets/images/community_courtyard_garden_1795426886061.jpg',
    },
    {
      photoId: 'GAL-03',
      title: 'Residents Clubhouse & Community Lounge',
      description: 'Illustrative preview visual of our sunlit gathering lounge for association meetings and events.',
      category: 'Facilities',
      date: '2026-11-02',
      order: 3,
      featured: true,
      isPlaceholder: true,
      imageUrl: '/src/assets/images/gallery_clubhouse_amenities_1795426886552.jpg',
    },
    {
      photoId: 'GAL-04',
      title: 'Deepavali Courtyard Lamp Lighting',
      description: 'Illustrative preview visual of annual festive celebrations hosted by families in the courtyard.',
      category: 'Festivals and Celebrations',
      date: '2026-11-08',
      order: 4,
      featured: true,
      isPlaceholder: true,
      imageUrl: '/src/assets/images/gallery_festival_celebration_1795426886541.jpg',
    },
  ];

  const announcements: Announcement[] = [
    {
      announcementId: 'ANN-01',
      title: 'Overhead Water Tank Cleaning & Brief Supply Pause',
      category: 'Water supply',
      priority: 'Urgent',
      summary: 'Routine quarterly sanitization of Block B overhead tanks scheduled for Sunday, 29 Nov (10:00 AM – 1:00 PM).',
      body: 'Dear Residents, quarterly chlorination and cleaning of the Block B overhead and sump tanks will take place on Sunday, 29 November 2026 between 10:00 AM and 1:00 PM. Please store sufficient water in advance. Normal supply will resume promptly by 1:15 PM.',
      publishDate: '2026-11-22',
      expiryDate: '2026-12-05',
      audience: 'Public',
      published: true,
    },
    {
      announcementId: 'ANN-02',
      title: 'Monthly General Committee Meeting — December Agenda',
      category: 'Committee meeting',
      priority: 'Important',
      summary: 'Association members will meet on Saturday, 5 Dec at 5:30 PM in the Clubhouse Lounge.',
      body: 'Agenda items include review of solar pathway lighting quotes, rainwater pit desilting before summer, and Q4 security roster updates. Residents are welcome to submit agenda suggestions to the Secretary by Wednesday.',
      publishDate: '2026-11-20',
      expiryDate: '2026-12-10',
      audience: 'Public',
      published: true,
    },
    {
      announcementId: 'ANN-03',
      title: 'Passenger Lift Annual Preventive Servicing',
      category: 'Lift maintenance',
      priority: 'General',
      summary: 'Scheduled technician inspection on Tuesday, 2 Dec between 11:00 AM and 12:30 PM.',
      body: 'Our AMC engineering team will inspect safety interlocks, cabin alignment, and emergency alarm battery backup on Tuesday morning. Kindly use the staircase during the 90-minute servicing window.',
      publishDate: '2026-11-18',
      expiryDate: '2026-12-15',
      audience: 'Public',
      published: true,
    },
    {
      announcementId: 'ANN-04',
      title: 'Segregated Wet & Dry Waste Pickup Timings',
      category: 'Waste disposal',
      priority: 'General',
      summary: 'Morning collection begins at 8:15 AM daily; please keep green and blue bins ready.',
      body: 'To maintain hygiene in corridors and assist our housekeeping staff, kindly place separated wet waste (green bin) and dry recyclables (blue bin) outside before 8:15 AM.',
      publishDate: '2026-11-12',
      expiryDate: '2027-03-31',
      audience: 'Public',
      published: true,
    },
    {
      announcementId: 'ANN-05',
      title: 'November Maintenance Dues & Payment Submission Guide',
      category: 'Maintenance collection',
      priority: 'Important',
      summary: 'Residents can pay via Association UPI/Bank Transfer and submit reference proof right from the Resident App.',
      body: 'Please verify your November maintenance statement inside the Resident App. Once you transfer via UPI/NEFT, tap "Submit Payment", enter your UTR/reference, and attach a screenshot for Treasurer approval.',
      publishDate: '2026-11-15',
      expiryDate: '2026-12-20',
      audience: 'Residents Only',
      published: true,
    },
  ];

  const events: CommunityEvent[] = [
    {
      eventId: 'EVT-01',
      title: 'Winter Courtyard High Tea & New Neighbor Welcome',
      date: '2026-12-06',
      time: '4:30 PM – 6:30 PM',
      location: 'Central Courtyard Pergola',
      description: 'An informal Saturday evening gathering to welcome newly moved-in families and enjoy filter coffee and snacks together.',
      coverImage: '/src/assets/images/community_courtyard_garden_1795426886061.jpg',
      status: 'Upcoming',
      featured: true,
      published: true,
    },
    {
      eventId: 'EVT-02',
      title: 'Annual General Body Meeting (AGM) & Community Dinner',
      date: '2026-12-20',
      time: '5:00 PM – 8:30 PM',
      location: 'Clubhouse Multipurpose Hall',
      description: 'Presentation of annual community initiatives, facility maintenance roadmap, and shared neighborhood dinner.',
      coverImage: '/src/assets/images/gallery_clubhouse_amenities_1795426886552.jpg',
      status: 'Upcoming',
      featured: true,
      published: true,
    },
    {
      eventId: 'EVT-03',
      title: 'Deepavali Courtyard Cultural Evening',
      date: '2026-11-08',
      time: '6:00 PM – 9:00 PM',
      location: 'Palace-B Courtyard',
      description: 'Families lit traditional brass lamps, organized children’s rangoli art, and shared festive sweets.',
      coverImage: '/src/assets/images/gallery_festival_celebration_1795426886541.jpg',
      status: 'Completed',
      featured: true,
      published: true,
    },
  ];

  const complaints: Complaint[] = [
    {
      complaintId: 'CMP-0001',
      flatId: 'FLT-101',
      flatNumber: '101',
      residentName: 'Raghavendra Kulkarni',
      category: 'Electrical & Lighting',
      subject: '1st Floor staircase landing sensor light flickering',
      description: 'The motion-sensor LED tube near the 1st floor east landing flickers intermittently after 7 PM.',
      priority: 'Normal',
      status: 'In Progress',
      assignedTo: 'Ramesh (Association Electrician)',
      resolutionNotes: 'Replacement ballast driver ordered; scheduled for evening check.',
      createdAt: '2026-11-19T14:30:00.000Z',
      updatedAt: '2026-11-20T10:15:00.000Z',
      history: [
        {
          timestamp: '2026-11-19T14:30:00.000Z',
          actorName: 'Raghavendra Kulkarni',
          actorRole: 'Resident (Flat 101)',
          status: 'Submitted',
          note: 'Complaint logged via Resident App.',
        },
        {
          timestamp: '2026-11-19T16:10:00.000Z',
          actorName: 'Narasimha Murthy',
          actorRole: 'President / Secretary',
          status: 'Acknowledged',
          note: 'Logged for electrical check.',
        },
        {
          timestamp: '2026-11-20T10:15:00.000Z',
          actorName: 'Narasimha Murthy',
          actorRole: 'President / Secretary',
          status: 'In Progress',
          note: 'Assigned to Ramesh (Association Electrician); driver replacement scheduled.',
        },
      ],
    },
    {
      complaintId: 'CMP-0002',
      flatId: 'FLT-105',
      flatNumber: '105',
      residentName: 'Suresh Babu Rao',
      category: 'Plumbing & Water',
      subject: 'Low water pressure in kitchen utility line',
      description: 'Water flow drops between 7:30 AM and 8:30 AM on the 2nd floor west wing.',
      priority: 'Urgent',
      status: 'Submitted',
      assignedTo: 'Pending Assignment',
      resolutionNotes: '',
      createdAt: '2026-11-21T08:45:00.000Z',
      updatedAt: '2026-11-21T08:45:00.000Z',
      history: [
        {
          timestamp: '2026-11-21T08:45:00.000Z',
          actorName: 'Suresh Babu Rao',
          actorRole: 'Resident (Flat 105)',
          status: 'Submitted',
          note: 'Urgent plumbing ticket created.',
        },
      ],
    },
    {
      complaintId: 'CMP-0003',
      flatId: 'FLT-102',
      flatNumber: '102',
      residentName: 'Meenakshi Sundaram',
      category: 'Common Area & Housekeeping',
      subject: 'Courtyard pergola bench wooden slat loose',
      description: 'One teak slat on the north pergola bench has a loose bolt.',
      priority: 'Normal',
      status: 'Resolved',
      assignedTo: 'Srinivas (Carpenter)',
      resolutionNotes: 'Bolt tightened and wood sealed with weather coat.',
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-14T16:00:00.000Z',
      history: [
        {
          timestamp: '2026-11-12T10:00:00.000Z',
          actorName: 'Meenakshi Sundaram',
          actorRole: 'Resident (Flat 102)',
          status: 'Submitted',
          note: 'Reported loose bench bolt.',
        },
        {
          timestamp: '2026-11-14T16:00:00.000Z',
          actorName: 'Narasimha Murthy',
          actorRole: 'President / Secretary',
          status: 'Resolved',
          note: 'Fixed by carpenter; awaiting resident confirmation.',
        },
      ],
    },
  ];

  const documents: ResidentDocument[] = [
    {
      docId: 'DOC-01',
      title: 'Happy Homes Palace-B OWA Bye-Laws & House Rules',
      category: 'Governance',
      publishedDate: '2026-01-15',
      summary: 'Approved association governance bye-laws, parking etiquette, renovation timings, and pet guidelines.',
      content: '1. Quiet hours: 10:30 PM to 6:30 AM. 2. Interior renovation work permitted Mon–Sat 9:30 AM to 5:30 PM only. 3. Door-lock maintenance concession requires prior written intimation to the Secretary.',
    },
    {
      docId: 'DOC-02',
      title: 'FY 2026 Maintenance Tariff & Concession Policy',
      category: 'Financial Policy',
      publishedDate: '2026-01-01',
      summary: 'AGM-approved standard monthly maintenance of ₹1,200 per flat and 50% door-lock concession rules.',
      content: 'Standard Monthly Maintenance: ₹1,200/month effective Jan 2026. Vacant / Door-Lock flats certified by the committee receive a 50% concession (₹600/month). Official numbered PDF receipts are issued upon Treasurer verification.',
    },
    {
      docId: 'DOC-03',
      title: 'Emergency Contacts & Vendor Directory',
      category: 'Safety & Support',
      publishedDate: '2026-10-01',
      summary: '24×7 security desk, lift technician helpline, plumber, and electrician contacts for residents.',
      content: 'Security Gate Desk: Ext. 100 · Association Electrician: +91 98450 22101 · Association Plumber: +91 98450 22102 · Lift Emergency Helpline: 1800-102-5438.',
    },
  ];

  return {
    website,
    committee,
    gallery,
    announcements,
    events,
    complaints,
    documents,
  };
}

function buildSeedDatabase(): SocietyDatabase {
  const settings: SocietySettings = {
    societyName: 'HAPPY HOMES PALACE-B Owners Welfare Association',
    registrationNumber: 'RWA/BLR/2021/0419',
    address: 'Plot 14, Palace-B Enclave, Indiranagar 2nd Stage, Bengaluru 560038',
    contactEmail: 'office@happyhomespalaceb.example.in',
    contactPhone: '+91 80 4120 8890',
    officeHours: 'Mon – Sat, 9:30 AM to 6:00 PM IST',
    bankAccountName: 'Happy Homes Palace-B OWA Maintenance A/c',
    bankDetails: 'State Bank of India · Indiranagar Branch · IFSC: SBIN0003492 · A/c: 40928172635',
    upiId: 'happyhomespalaceb@sbi',
    standardMonthlyRate: 1200,
    doorLockDiscountPercent: 50,
    receiptPrefix: 'RCP-2026',
    rateHistory: [
      {
        rateId: 'RATE-2025-01',
        effectiveFrom: '2025-01',
        baseMonthlyCharge: 1000,
        doorLockDiscountPercent: 50,
        description: 'FY 2025 base maintenance tariff',
        createdBy: 'Committee Resolution #04',
        createdAt: '2025-01-01T09:00:00.000Z',
      },
      {
        rateId: 'RATE-2026-01',
        effectiveFrom: '2026-01',
        baseMonthlyCharge: 1200,
        doorLockDiscountPercent: 50,
        description: 'FY 2026 approved AGM maintenance revision',
        createdBy: 'AGM Resolution #12',
        createdAt: '2026-01-01T09:00:00.000Z',
      },
    ],
  };

  const users: StoredUser[] = [
    {
      userId: 'USR-ADMIN-01',
      name: 'Narasimha Murthy',
      email: 'secretary@smartsociety.demo',
      mobile: '9845011001',
      passwordHash: hashPassword('Admin@2026'),
      role: 'president',
      roleLabel: 'President / Secretary',
      status: 'Active',
    },
    {
      userId: 'USR-TREAS-01',
      name: 'Lakshmi Narayanan',
      email: 'treasurer@smartsociety.demo',
      mobile: '9845011002',
      passwordHash: hashPassword('Treasurer@2026'),
      role: 'treasurer',
      roleLabel: 'Treasurer / Accountant',
      status: 'Active',
    },
    {
      userId: 'USR-RES-101',
      name: 'Raghavendra Kulkarni',
      email: 'flat101@smartsociety.demo',
      mobile: '9845011201',
      passwordHash: hashPassword('Resident@101'),
      role: 'resident',
      roleLabel: 'Resident (Flat 101)',
      status: 'Active',
      flatId: 'FLT-101',
    },
    {
      userId: 'USR-RES-102',
      name: 'Meenakshi Sundaram',
      email: 'flat102@smartsociety.demo',
      mobile: '9845011202',
      passwordHash: hashPassword('Resident@102'),
      role: 'resident',
      roleLabel: 'Resident (Flat 102)',
      status: 'Active',
      flatId: 'FLT-102',
    },
  ];

  const flatAccess: FlatAccessGrant[] = [
    {
      accessId: 'FA-0001',
      userId: 'USR-RES-101',
      flatId: 'FLT-101',
      flatNumber: '101',
      relationship: 'Owner',
      active: true,
      grantedBy: 'Narasimha Murthy',
      grantedAt: '2026-09-01T09:00:00.000Z',
    },
    {
      accessId: 'FA-0002',
      userId: 'USR-RES-102',
      flatId: 'FLT-102',
      flatNumber: '102',
      relationship: 'Owner',
      active: true,
      grantedBy: 'Narasimha Murthy',
      grantedAt: '2026-09-01T09:00:00.000Z',
    },
  ];

  const accountActivations: AccountActivation[] = [];

  const flats: Flat[] = [
    { flatId: 'FLT-101', flatNumber: '101', floor: '1st Floor', areaSqFt: 1250, ownerName: 'Raghavendra Kulkarni', mobile: '+91 98450 11201', email: 'raghav.kulkarni@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-102', flatNumber: '102', floor: '1st Floor', areaSqFt: 1250, ownerName: 'Meenakshi Sundaram', mobile: '+91 98450 11202', email: 'meenakshi.s@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-103', flatNumber: '103', floor: '1st Floor', areaSqFt: 1180, ownerName: 'Arvind Deshmukh', mobile: '+91 98450 11203', email: 'arvind.deshmukh@example.in', maintenanceCategory: 'Door-Lock (50%)', occupancyStatus: 'Vacant / Door-Lock', doorLockActive: true, specialDiscountAmount: 0, specialDiscountReason: 'Approved 50% vacant door-lock concession', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-104', flatNumber: '104', floor: '1st Floor', areaSqFt: 1250, ownerName: 'Priya Nair', mobile: '+91 98450 11204', email: 'priya.nair@example.in', maintenanceCategory: 'Special Concession', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 200, specialDiscountReason: 'Senior citizen committee concession (₹200/mo)', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-105', flatNumber: '105', floor: '2nd Floor', areaSqFt: 1320, ownerName: 'Suresh Babu Rao', mobile: '+91 98450 11205', email: 'suresh.rao@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-106', flatNumber: '106', floor: '2nd Floor', areaSqFt: 1250, ownerName: 'Ananya Chatterjee', mobile: '+91 98450 11206', email: 'ananya.c@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-107', flatNumber: '107', floor: '2nd Floor', areaSqFt: 1250, ownerName: 'Vikramaditya Joshi', mobile: '+91 98450 11207', email: 'vikram.joshi@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Tenant', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-108', flatNumber: '108', floor: '2nd Floor', areaSqFt: 1180, ownerName: 'Kavitha Reddy', mobile: '+91 98450 11208', email: 'kavitha.reddy@example.in', maintenanceCategory: 'Door-Lock (50%)', occupancyStatus: 'Vacant / Door-Lock', doorLockActive: true, specialDiscountAmount: 0, specialDiscountReason: 'Owner relocated; 50% door-lock active', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-109', flatNumber: '109', floor: '3rd Floor', areaSqFt: 1320, ownerName: 'Harishankar Menon', mobile: '+91 98450 11209', email: 'hari.menon@example.in', maintenanceCategory: 'Special Concession', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 100, specialDiscountReason: 'Ground water meter maintenance credit (₹100/mo)', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
    { flatId: 'FLT-110', flatNumber: '110', floor: '3rd Floor', areaSqFt: 1250, ownerName: 'Deepika Sharma', mobile: '+91 98450 11210', email: 'deepika.sharma@example.in', maintenanceCategory: 'Standard', occupancyStatus: 'Occupied', doorLockActive: false, specialDiscountAmount: 0, specialDiscountReason: '', openingArrears: 0, active: true, isSampleData: true, updatedAt: '2026-09-01T09:00:00.000Z' },
  ];

  const months = ['2026-09', '2026-10', '2026-11'];
  const maintenance: MaintenanceBill[] = [];
  for (const month of months) {
    for (const flat of flats) {
      const gross = 1200;
      const doorLock = flat.doorLockActive ? 600 : 0;
      const special = !flat.doorLockActive ? flat.specialDiscountAmount : 0;
      const net = gross - doorLock - special;
      maintenance.push({
        billId: `BILL-${month.replace('-', '')}-${flat.flatNumber}`,
        flatId: flat.flatId,
        flatNumber: flat.flatNumber,
        ownerName: flat.ownerName,
        billingMonth: month,
        grossAmount: gross,
        doorLockDiscount: doorLock,
        specialDiscount: special,
        otherCharges: 0,
        netAmount: net,
        allocatedAmount: 0,
        balanceDue: net,
        status: 'Unpaid',
        generatedAt: `${month}-01T08:00:00.000Z`,
        generatedBy: 'Lakshmi Narayanan',
        notes: doorLock > 0 ? '50% Door-lock concession applied' : special > 0 ? flat.specialDiscountReason : 'Standard monthly maintenance',
      });
    }
  }

  const payments: PaymentRecord[] = [
    { paymentId: 'PAY-2026-0001', flatId: 'FLT-101', flatNumber: '101', ownerName: 'Raghavendra Kulkarni', paymentDate: '2026-09-05', entryDate: '2026-09-05T10:15:00.000Z', amount: 1200, paymentMethod: 'UPI', bankReference: 'UPI6248190011', bankDate: '2026-09-05', targetMonths: ['2026-09'], remarks: 'September maintenance settled in full', status: 'Confirmed', receiptId: 'REC-2026-0001', receiptNumber: 'RCP-2026-0001', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-09-05T10:15:00.000Z', idempotencyKey: 'SEED-101-202609' },
    { paymentId: 'PAY-2026-0002', flatId: 'FLT-101', flatNumber: '101', ownerName: 'Raghavendra Kulkarni', paymentDate: '2026-10-04', entryDate: '2026-10-04T11:20:00.000Z', amount: 1200, paymentMethod: 'UPI', bankReference: 'UPI6279110422', bankDate: '2026-10-04', targetMonths: ['2026-10'], remarks: 'October maintenance settled in full', status: 'Confirmed', receiptId: 'REC-2026-0002', receiptNumber: 'RCP-2026-0002', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-10-04T11:20:00.000Z', idempotencyKey: 'SEED-101-202610' },
    { paymentId: 'PAY-2026-0003', flatId: 'FLT-101', flatNumber: '101', ownerName: 'Raghavendra Kulkarni', paymentDate: '2026-11-05', entryDate: '2026-11-05T09:40:00.000Z', amount: 1200, paymentMethod: 'UPI', bankReference: 'UPI6309887123', bankDate: '2026-11-05', targetMonths: ['2026-11'], remarks: 'November maintenance settled in full', status: 'Confirmed', receiptId: 'REC-2026-0003', receiptNumber: 'RCP-2026-0003', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-11-05T09:40:00.000Z', idempotencyKey: 'SEED-101-202611' },
    { paymentId: 'PAY-2026-0004', flatId: 'FLT-102', flatNumber: '102', ownerName: 'Meenakshi Sundaram', paymentDate: '2026-10-08', entryDate: '2026-10-08T14:10:00.000Z', amount: 2400, paymentMethod: 'NEFT / IMPS', bankReference: 'NEFT9912045581', bankDate: '2026-10-08', targetMonths: ['2026-09', '2026-10'], remarks: 'Combined settlement for Sep & Oct 2026 (single receipt)', status: 'Confirmed', receiptId: 'REC-2026-0004', receiptNumber: 'RCP-2026-0004', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-10-08T14:10:00.000Z', idempotencyKey: 'SEED-102-202609-10' },
    { paymentId: 'PAY-2026-0005', flatId: 'FLT-103', flatNumber: '103', ownerName: 'Arvind Deshmukh', paymentDate: '2026-11-06', entryDate: '2026-11-06T12:00:00.000Z', amount: 1800, paymentMethod: 'NEFT / IMPS', bankReference: 'IMPS7741209934', bankDate: '2026-11-06', targetMonths: ['2026-09', '2026-10', '2026-11'], remarks: '3 months @ ₹600/mo (50% Door-lock concession)', status: 'Confirmed', receiptId: 'REC-2026-0005', receiptNumber: 'RCP-2026-0005', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-11-06T12:00:00.000Z', idempotencyKey: 'SEED-103-202609-11' },
    { paymentId: 'PAY-2026-0006', flatId: 'FLT-104', flatNumber: '104', ownerName: 'Priya Nair', paymentDate: '2026-10-12', entryDate: '2026-10-12T16:30:00.000Z', amount: 1500, paymentMethod: 'Cash', bankReference: 'CASH-REG-104', bankDate: '2026-10-12', targetMonths: ['2026-09', '2026-10'], remarks: 'Sep full (₹1,000) + Oct partial (₹500)', status: 'Confirmed', receiptId: 'REC-2026-0006', receiptNumber: 'RCP-2026-0006', verifiedBy: 'Narasimha Murthy', verifiedAt: '2026-10-12T16:30:00.000Z', idempotencyKey: 'SEED-104-PARTIAL' },
    { paymentId: 'PAY-2026-0007', flatId: 'FLT-106', flatNumber: '106', ownerName: 'Ananya Chatterjee', paymentDate: '2026-10-07', entryDate: '2026-10-07T15:00:00.000Z', amount: 2400, paymentMethod: 'UPI', bankReference: 'UPI6281994410', bankDate: '2026-10-07', targetMonths: ['2026-09', '2026-10'], remarks: 'Sep & Oct maintenance settled', status: 'Confirmed', receiptId: 'REC-2026-0007', receiptNumber: 'RCP-2026-0007', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-10-07T15:00:00.000Z', idempotencyKey: 'SEED-106-202609-10' },
    { paymentId: 'PAY-2026-0008', flatId: 'FLT-106', flatNumber: '106', ownerName: 'Ananya Chatterjee', paymentDate: '2026-11-18', entryDate: '2026-11-18T11:10:00.000Z', amount: 1200, paymentMethod: 'NEFT / IMPS', bankReference: 'NEFT-UNVERIFIED-106', bankDate: '2026-11-18', targetMonths: ['2026-11'], remarks: 'Submitted by resident — awaiting bank statement verification', status: 'Draft', idempotencyKey: 'SEED-106-202611-DRAFT' },
    { paymentId: 'PAY-2026-0009', flatId: 'FLT-107', flatNumber: '107', ownerName: 'Vikramaditya Joshi', paymentDate: '2026-11-03', entryDate: '2026-11-03T10:05:00.000Z', amount: 3600, paymentMethod: 'Cheque', bankReference: 'CHQ-HDFC-441892', bankDate: '2026-11-04', targetMonths: ['2026-09', '2026-10', '2026-11'], remarks: 'Quarterly cheque cleared on 04 Nov', status: 'Confirmed', receiptId: 'REC-2026-0008', receiptNumber: 'RCP-2026-0008', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-11-04T17:00:00.000Z', idempotencyKey: 'SEED-107-QTR' },
    { paymentId: 'PAY-2026-0010', flatId: 'FLT-108', flatNumber: '108', ownerName: 'Kavitha Reddy', paymentDate: '2026-09-10', entryDate: '2026-09-10T11:45:00.000Z', amount: 600, paymentMethod: 'UPI', bankReference: 'UPI6253119820', bankDate: '2026-09-10', targetMonths: ['2026-09'], remarks: 'Sep 50% door-lock paid; Oct & Nov pending', status: 'Confirmed', receiptId: 'REC-2026-0009', receiptNumber: 'RCP-2026-0009', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-09-10T11:45:00.000Z', idempotencyKey: 'SEED-108-202609' },
    { paymentId: 'PAY-2026-0011', flatId: 'FLT-109', flatNumber: '109', ownerName: 'Harishankar Menon', paymentDate: '2026-11-09', entryDate: '2026-11-09T13:20:00.000Z', amount: 3300, paymentMethod: 'NEFT / IMPS', bankReference: 'NEFT8821004519', bankDate: '2026-11-09', targetMonths: ['2026-09', '2026-10', '2026-11'], remarks: 'Combined 3-month payment @ ₹1,100/mo after ₹100 special concession', status: 'Confirmed', receiptId: 'REC-2026-0010', receiptNumber: 'RCP-2026-0010', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-11-09T13:20:00.000Z', idempotencyKey: 'SEED-109-202609-11' },
    { paymentId: 'PAY-2026-0012', flatId: 'FLT-110', flatNumber: '110', ownerName: 'Deepika Sharma', paymentDate: '2026-11-11', entryDate: '2026-11-11T15:50:00.000Z', amount: 3100, paymentMethod: 'UPI', bankReference: 'UPI6315002291', bankDate: '2026-11-11', targetMonths: ['2026-09', '2026-10', '2026-11'], remarks: 'Sep & Oct settled in full (₹2,400) + ₹700 partial towards Nov', status: 'Confirmed', receiptId: 'REC-2026-0011', receiptNumber: 'RCP-2026-0011', verifiedBy: 'Lakshmi Narayanan', verifiedAt: '2026-11-11T15:50:00.000Z', idempotencyKey: 'SEED-110-PARTIAL' },
  ];

  const paymentSubmissions: PaymentSubmission[] = [
    {
      submissionId: 'SUB-2026-0001',
      flatId: 'FLT-106',
      flatNumber: '106',
      ownerName: 'Ananya Chatterjee',
      submittedByUserId: 'USR-ADMIN-01',
      submittedByName: 'Ananya Chatterjee (On Behalf)',
      paymentDate: '2026-11-22',
      amount: 1200,
      paymentMethod: 'UPI',
      bankReference: 'UPI6324198004',
      targetMonths: ['2026-11'],
      remarks: 'Paid November maintenance via Google Pay to happyhomespalaceb@sbi.',
      state: 'PENDING_REVIEW',
      createdAt: '2026-11-22T10:15:00.000Z',
      updatedAt: '2026-11-22T10:15:00.000Z',
      history: [
        {
          timestamp: '2026-11-22T10:15:00.000Z',
          actorName: 'Ananya Chatterjee',
          actorRole: 'Resident (Flat 106)',
          action: 'SUBMITTED',
          note: 'Submitted UPI reference UPI6324198004 for Treasurer verification.',
        },
      ],
    },
  ];

  const allocations: PaymentAllocation[] = [
    { allocationId: 'ALC-0001', paymentId: 'PAY-2026-0001', billId: 'BILL-202609-101', flatId: 'FLT-101', billingMonth: '2026-09', allocatedAmount: 1200 },
    { allocationId: 'ALC-0002', paymentId: 'PAY-2026-0002', billId: 'BILL-202610-101', flatId: 'FLT-101', billingMonth: '2026-10', allocatedAmount: 1200 },
    { allocationId: 'ALC-0003', paymentId: 'PAY-2026-0003', billId: 'BILL-202611-101', flatId: 'FLT-101', billingMonth: '2026-11', allocatedAmount: 1200 },
    { allocationId: 'ALC-0004', paymentId: 'PAY-2026-0004', billId: 'BILL-202609-102', flatId: 'FLT-102', billingMonth: '2026-09', allocatedAmount: 1200 },
    { allocationId: 'ALC-0005', paymentId: 'PAY-2026-0004', billId: 'BILL-202610-102', flatId: 'FLT-102', billingMonth: '2026-10', allocatedAmount: 1200 },
    { allocationId: 'ALC-0006', paymentId: 'PAY-2026-0005', billId: 'BILL-202609-103', flatId: 'FLT-103', billingMonth: '2026-09', allocatedAmount: 600 },
    { allocationId: 'ALC-0007', paymentId: 'PAY-2026-0005', billId: 'BILL-202610-103', flatId: 'FLT-103', billingMonth: '2026-10', allocatedAmount: 600 },
    { allocationId: 'ALC-0008', paymentId: 'PAY-2026-0005', billId: 'BILL-202611-103', flatId: 'FLT-103', billingMonth: '2026-11', allocatedAmount: 600 },
    { allocationId: 'ALC-0009', paymentId: 'PAY-2026-0006', billId: 'BILL-202609-104', flatId: 'FLT-104', billingMonth: '2026-09', allocatedAmount: 1000 },
    { allocationId: 'ALC-0010', paymentId: 'PAY-2026-0006', billId: 'BILL-202610-104', flatId: 'FLT-104', billingMonth: '2026-10', allocatedAmount: 500 },
    { allocationId: 'ALC-0011', paymentId: 'PAY-2026-0007', billId: 'BILL-202609-106', flatId: 'FLT-106', billingMonth: '2026-09', allocatedAmount: 1200 },
    { allocationId: 'ALC-0012', paymentId: 'PAY-2026-0007', billId: 'BILL-202610-106', flatId: 'FLT-106', billingMonth: '2026-10', allocatedAmount: 1200 },
    { allocationId: 'ALC-0013', paymentId: 'PAY-2026-0009', billId: 'BILL-202609-107', flatId: 'FLT-107', billingMonth: '2026-09', allocatedAmount: 1200 },
    { allocationId: 'ALC-0014', paymentId: 'PAY-2026-0009', billId: 'BILL-202610-107', flatId: 'FLT-107', billingMonth: '2026-10', allocatedAmount: 1200 },
    { allocationId: 'ALC-0015', paymentId: 'PAY-2026-0009', billId: 'BILL-202611-107', flatId: 'FLT-107', billingMonth: '2026-11', allocatedAmount: 1200 },
    { allocationId: 'ALC-0016', paymentId: 'PAY-2026-0010', billId: 'BILL-202609-108', flatId: 'FLT-108', billingMonth: '2026-09', allocatedAmount: 600 },
    { allocationId: 'ALC-0017', paymentId: 'PAY-2026-0011', billId: 'BILL-202609-109', flatId: 'FLT-109', billingMonth: '2026-09', allocatedAmount: 1100 },
    { allocationId: 'ALC-0018', paymentId: 'PAY-2026-0011', billId: 'BILL-202610-109', flatId: 'FLT-109', billingMonth: '2026-10', allocatedAmount: 1100 },
    { allocationId: 'ALC-0019', paymentId: 'PAY-2026-0011', billId: 'BILL-202611-109', flatId: 'FLT-109', billingMonth: '2026-11', allocatedAmount: 1100 },
    { allocationId: 'ALC-0020', paymentId: 'PAY-2026-0012', billId: 'BILL-202609-110', flatId: 'FLT-110', billingMonth: '2026-09', allocatedAmount: 1200 },
    { allocationId: 'ALC-0021', paymentId: 'PAY-2026-0012', billId: 'BILL-202610-110', flatId: 'FLT-110', billingMonth: '2026-10', allocatedAmount: 1200 },
    { allocationId: 'ALC-0022', paymentId: 'PAY-2026-0012', billId: 'BILL-202611-110', flatId: 'FLT-110', billingMonth: '2026-11', allocatedAmount: 700 },
  ];

  const receipts: ReceiptRecord[] = payments
    .filter((p) => p.status === 'Confirmed' && p.receiptId && p.receiptNumber)
    .map((p) => {
      const pAllocs = allocations
        .filter((a) => a.paymentId === p.paymentId)
        .map((a) => ({ billingMonth: a.billingMonth, allocatedAmount: a.allocatedAmount }));
      return {
        receiptId: p.receiptId!,
        receiptNumber: p.receiptNumber!,
        receiptDate: p.paymentDate,
        paymentId: p.paymentId,
        flatId: p.flatId,
        flatNumber: p.flatNumber,
        ownerName: p.ownerName,
        amountReceived: p.amount,
        paymentMethod: p.paymentMethod,
        bankReference: p.bankReference,
        maintenancePeriod: p.targetMonths.join(', '),
        allocations: pAllocs,
        status: 'Active',
        issuedBy: p.verifiedBy ?? 'Lakshmi Narayanan',
        createdAt: p.verifiedAt ?? p.entryDate,
      };
    });

  const notifications: NotificationItem[] = [
    {
      notificationId: 'NTF-0001',
      flatId: 'FLT-101',
      type: 'payment',
      title: 'Receipt RCP-2026-0003 Issued',
      body: 'Your ₹1,200 payment for November 2026 maintenance (Flat 101) has been verified.',
      linkScreen: 'receipts',
      read: false,
      createdAt: '2026-11-05T09:42:00.000Z',
    },
    {
      notificationId: 'NTF-0002',
      flatId: 'FLT-101',
      type: 'complaint',
      title: 'Complaint CMP-0001 In Progress',
      body: 'Ramesh (Association Electrician) has been assigned to your staircase sensor light ticket.',
      linkScreen: 'complaints',
      read: false,
      createdAt: '2026-11-20T10:15:00.000Z',
    },
    {
      notificationId: 'NTF-0003',
      flatId: 'FLT-102',
      type: 'bill',
      title: 'November 2026 Maintenance Bill Due',
      body: 'Monthly maintenance of ₹1,200 for Flat 102 is open. Pay via UPI/NEFT and upload proof in Maintenance.',
      linkScreen: 'maintenance',
      read: false,
      createdAt: '2026-11-01T08:05:00.000Z',
    },
    {
      notificationId: 'NTF-0004',
      flatId: 'FLT-102',
      type: 'complaint',
      title: 'Complaint CMP-0003 Resolved — Confirm Closure',
      body: 'The courtyard pergola bench repair has been marked Resolved. Please confirm closure or reopen if needed.',
      linkScreen: 'complaints',
      read: false,
      createdAt: '2026-11-14T16:05:00.000Z',
    },
    {
      notificationId: 'NTF-0005',
      type: 'announcement',
      title: 'Urgent Notice: Overhead Tank Cleaning',
      body: 'Scheduled for Sunday, 29 Nov (10:00 AM – 1:00 PM). Please store water in advance.',
      linkScreen: 'notices',
      read: false,
      createdAt: '2026-11-22T09:00:00.000Z',
    },
    {
      notificationId: 'NTF-0006',
      roleTarget: 'treasurer',
      type: 'payment',
      title: 'New Payment Proof Pending Review',
      body: 'Flat 106 submitted ₹1,200 UPI proof (UPI6324198004) awaiting Treasurer verification.',
      linkScreen: 'approvals',
      read: false,
      createdAt: '2026-11-22T10:16:00.000Z',
    },
  ];

  const notificationPreferences: NotificationPreferences[] = [
    {
      userId: 'USR-RES-101',
      billReminders: true,
      paymentUpdates: true,
      complaintUpdates: true,
      announcements: true,
      events: true,
    },
    {
      userId: 'USR-RES-102',
      billReminders: true,
      paymentUpdates: true,
      complaintUpdates: true,
      announcements: true,
      events: true,
    },
  ];

  const auditLog: AuditLogEntry[] = [
    { auditId: 'AUD-0001', timestamp: '2026-09-01T08:00:00.000Z', actorName: 'Lakshmi Narayanan', actorRole: 'Treasurer / Accountant', action: 'BILL_RUN_GENERATED', entityType: 'Maintenance', entityId: '2026-09', summary: 'Generated September 2026 monthly maintenance bills for 10 pilot flats (101–110).' },
    { auditId: 'AUD-0002', timestamp: '2026-10-08T14:10:00.000Z', actorName: 'Lakshmi Narayanan', actorRole: 'Treasurer / Accountant', action: 'PAYMENT_CONFIRMED', entityType: 'Payment', entityId: 'PAY-2026-0004', summary: 'Confirmed combined payment ₹2,400 for Flat 102 covering 2026-09 & 2026-10; issued Receipt RCP-2026-0004.' },
    { auditId: 'AUD-0003', timestamp: '2026-11-01T08:00:00.000Z', actorName: 'Lakshmi Narayanan', actorRole: 'Treasurer / Accountant', action: 'BILL_RUN_GENERATED', entityType: 'Maintenance', entityId: '2026-11', summary: 'Generated November 2026 monthly maintenance bills for 10 pilot flats (101–110).' },
    { auditId: 'AUD-0004', timestamp: '2026-11-18T11:10:00.000Z', actorName: 'Narasimha Murthy', actorRole: 'President / Secretary', action: 'PAYMENT_DRAFT_LOGGED', entityType: 'Payment', entityId: 'PAY-2026-0008', summary: 'Logged unverified NEFT reference for Flat 106 (₹1,200). Pending bank verification; invoice remains unpaid.' },
  ];

  const community = buildDefaultCommunityData();

  const db: SocietyDatabase = {
    settings,
    ...community,
    users,
    flatAccess,
    accountActivations,
    flats,
    maintenance,
    payments,
    paymentSubmissions,
    allocations,
    receipts,
    notifications,
    notificationPreferences,
    auditLog,
    contacts: [],
  };

  recalculateAllBalances(db);
  return db;
}

export function loadDatabase(): SocietyDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SocietyDatabase>;
    const seed = buildSeedDatabase();
    const community = buildDefaultCommunityData();

    let dirty = false;
    const migrated: SocietyDatabase = {
      ...seed,
      ...parsed,
      website: parsed.website ?? community.website,
      committee: parsed.committee ?? community.committee,
      gallery: parsed.gallery ?? community.gallery,
      announcements: parsed.announcements ?? community.announcements,
      events: parsed.events ?? community.events,
      complaints: parsed.complaints ?? community.complaints,
      documents: parsed.documents ?? community.documents,
      flatAccess: parsed.flatAccess ?? seed.flatAccess,
      accountActivations: parsed.accountActivations ?? seed.accountActivations,
      paymentSubmissions: parsed.paymentSubmissions ?? seed.paymentSubmissions,
      notifications: parsed.notifications ?? seed.notifications,
      notificationPreferences: parsed.notificationPreferences ?? seed.notificationPreferences,
    };

    // Backfill v4 user fields & demo Flat 102 resident if missing
    migrated.users = (migrated.users || []).map((u) => {
      if (!u.mobile || !u.status) dirty = true;
      const fallbackMob =
        u.userId === 'USR-ADMIN-01'
          ? '9845011001'
          : u.userId === 'USR-TREAS-01'
          ? '9845011002'
          : u.userId === 'USR-RES-101'
          ? '9845011201'
          : u.userId === 'USR-RES-102'
          ? '9845011202'
          : '9845000000';
      return {
        ...u,
        mobile: u.mobile || fallbackMob,
        status: u.status || 'Active',
      };
    });

    if (!migrated.users.some((u) => u.userId === 'USR-RES-102')) {
      const res102 = seed.users.find((u) => u.userId === 'USR-RES-102');
      if (res102) {
        migrated.users.push(res102);
        dirty = true;
      }
    }

    if (!migrated.flatAccess.some((fa) => fa.userId === 'USR-RES-102')) {
      const fa102 = seed.flatAccess.find((fa) => fa.userId === 'USR-RES-102');
      if (fa102) {
        migrated.flatAccess.push(fa102);
        dirty = true;
      }
    }

    // Backfill complaint v4 statuses and history
    migrated.complaints = migrated.complaints.map((c) => {
      const rawStatus = c.status as string;
      const mappedStatus: ComplaintStatus =
        rawStatus === 'Open' ? 'Submitted' : (c.status as ComplaintStatus);
      if (!c.history || c.history.length === 0 || rawStatus === 'Open') {
        dirty = true;
        return {
          ...c,
          status: mappedStatus,
          history: c.history && c.history.length > 0
            ? c.history
            : [
                {
                  timestamp: c.createdAt,
                  actorName: c.residentName,
                  actorRole: `Resident (Flat ${c.flatNumber})`,
                  status: mappedStatus,
                  note: 'Complaint recorded.',
                },
              ],
        };
      }
      return c;
    });

    recalculateAllBalances(migrated);
    if (dirty || !parsed.flatAccess || !parsed.paymentSubmissions || !parsed.notifications) {
      fs.writeFileSync(DB_PATH, JSON.stringify(migrated, null, 2), 'utf-8');
    }
    return migrated;
  } catch {
    const seed = buildSeedDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

export function saveDatabase(db: SocietyDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  recalculateAllBalances(db);
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export function appendAudit(
  db: SocietyDatabase,
  entry: Omit<AuditLogEntry, 'auditId' | 'timestamp'>
): void {
  const num = String(db.auditLog.length + 1).padStart(4, '0');
  db.auditLog.unshift({
    auditId: `AUD-${num}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

export function pushNotification(
  db: SocietyDatabase,
  item: Omit<NotificationItem, 'notificationId' | 'read' | 'createdAt'>
): NotificationItem {
  const ntf: NotificationItem = {
    notificationId: `NTF-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex')}`,
    read: false,
    createdAt: new Date().toISOString(),
    ...item,
  };
  db.notifications.unshift(ntf);
  if (db.notifications.length > 300) {
    db.notifications.length = 300;
  }
  return ntf;
}

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

export function generateReceiptPdfBuffer(
  receipt: ReceiptRecord,
  settings: SocietySettings
): Buffer {
  const lines: { text: string; size: number; bold?: boolean; y: number }[] = [
    { text: settings.societyName, size: 15, bold: true, y: 760 },
    { text: `Reg No: ${settings.registrationNumber} | ${settings.address}`, size: 9, y: 742 },
    { text: `Phone: ${settings.contactPhone} | Email: ${settings.contactEmail}`, size: 9, y: 729 },
    { text: 'OFFICIAL MAINTENANCE PAYMENT RECEIPT', size: 13, bold: true, y: 695 },
    { text: `Receipt No: ${receipt.receiptNumber}`, size: 10, bold: true, y: 668 },
    { text: `Receipt Date: ${receipt.receiptDate}`, size: 10, y: 652 },
    { text: `Status: ${receipt.status}`, size: 10, y: 636 },
    { text: `Flat Number: ${receipt.flatNumber}`, size: 10, bold: true, y: 608 },
    { text: `Owner / Resident Name: ${receipt.ownerName}`, size: 10, y: 592 },
    { text: `Payment Method: ${receipt.paymentMethod}`, size: 10, y: 576 },
    { text: `Bank / Reference No: ${receipt.bankReference || 'N/A'}`, size: 10, y: 560 },
    { text: `Total Amount Received: INR ${receipt.amountReceived.toLocaleString('en-IN')}.00`, size: 12, bold: true, y: 534 },
    { text: 'Month-wise Allocation Breakdown:', size: 10, bold: true, y: 504 },
  ];

  let currentY = 486;
  receipt.allocations.forEach((alloc, idx) => {
    lines.push({
      text: `${idx + 1}. Billing Month ${alloc.billingMonth}  -  Allocated: INR ${alloc.allocatedAmount.toLocaleString('en-IN')}.00`,
      size: 10,
      y: currentY,
    });
    currentY -= 18;
  });

  lines.push({
    text: `Issued By: ${receipt.issuedBy}`,
    size: 9,
    y: Math.min(currentY - 24, 340),
  });
  lines.push({
    text: 'This is a computer-generated receipt from Happy Homes Palace-B Owners Welfare Association.',
    size: 8,
    y: Math.min(currentY - 42, 320),
  });

  const streamOps: string[] = [
    '0.14 0.30 0.24 RG',
    '1.5 w',
    '48 712 m 564 712 l S',
    '0.82 0.86 0.84 RG',
    '0.75 w',
    '48 520 m 564 520 l S',
    '48 780 m 564 780 l S',
  ];

  for (const line of lines) {
    const fontKey = line.bold ? '/F2' : '/F1';
    streamOps.push('BT');
    streamOps.push(`${fontKey} ${line.size} Tf`);
    streamOps.push('0.15 0.20 0.18 rg');
    streamOps.push(`54 ${line.y} Td`);
    streamOps.push(`(${escapePdfText(line.text)}) Tj`);
    streamOps.push('ET');
  }

  const streamContent = streamOps.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf-8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf-8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf-8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf-8');
}
