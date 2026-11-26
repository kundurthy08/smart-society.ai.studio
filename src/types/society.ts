export type UserRole = 'president' | 'treasurer' | 'resident';
export type UserStatus = 'Active' | 'Pending' | 'Suspended';

export interface FlatAccessSummary {
  flatId: string;
  flatNumber: string;
  relationship: 'Owner' | 'Tenant' | 'Family';
}

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  roleLabel: string;
  status: UserStatus;
  flatId?: string;
  allowedFlats: FlatAccessSummary[];
  activeFlatId?: string;
}

export interface FlatAccessGrant {
  accessId: string;
  userId: string;
  flatId: string;
  flatNumber: string;
  relationship: 'Owner' | 'Tenant' | 'Family';
  active: boolean;
  grantedBy: string;
  grantedAt: string;
  revokedAt?: string;
  revokedBy?: string;
}

export interface AccountActivation {
  activationId: string;
  userId: string;
  mobile: string;
  flatNumber: string;
  codeHash: string;
  expiresAt: string;
  usedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface ResidentAccountSummary {
  userId: string;
  name: string;
  email: string;
  mobile: string;
  status: UserStatus;
  roleLabel: string;
  flatAccess: FlatAccessGrant[];
  pendingActivationExpiresAt?: string;
}

export type MaintenanceCategory = 'Standard' | 'Door-Lock (50%)' | 'Special Concession';
export type OccupancyStatus = 'Occupied' | 'Vacant / Door-Lock' | 'Tenant';

export interface Flat {
  flatId: string;
  flatNumber: string;
  floor: string;
  areaSqFt: number;
  ownerName: string;
  mobile: string;
  email: string;
  maintenanceCategory: MaintenanceCategory;
  occupancyStatus: OccupancyStatus;
  doorLockActive: boolean;
  specialDiscountAmount: number;
  specialDiscountReason: string;
  openingArrears: number;
  active: boolean;
  isSampleData: boolean;
  updatedAt: string;
}

export type BillStatus = 'Unpaid' | 'Partial' | 'Paid';

export interface MaintenanceBill {
  billId: string;
  flatId: string;
  flatNumber: string;
  ownerName: string;
  billingMonth: string; // YYYY-MM
  grossAmount: number;
  doorLockDiscount: number;
  specialDiscount: number;
  otherCharges: number;
  netAmount: number;
  allocatedAmount: number;
  balanceDue: number;
  status: BillStatus;
  generatedAt: string;
  generatedBy: string;
  notes: string;
}

export type PaymentMethod = 'UPI' | 'NEFT / IMPS' | 'Cheque' | 'Cash';
export type PaymentStatus = 'Draft' | 'Confirmed' | 'Reversed';

export interface PaymentAllocation {
  allocationId: string;
  paymentId: string;
  billId: string;
  flatId: string;
  billingMonth: string;
  allocatedAmount: number;
}

export interface PaymentRecord {
  paymentId: string;
  flatId: string;
  flatNumber: string;
  ownerName: string;
  paymentDate: string;
  entryDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  bankReference: string;
  bankDate: string;
  targetMonths: string[];
  remarks: string;
  status: PaymentStatus;
  receiptId?: string;
  receiptNumber?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  reversalReason?: string;
  reversedBy?: string;
  reversedAt?: string;
  idempotencyKey: string;
}

export type SubmissionState =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'CLARIFICATION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED';

export interface ApprovalHistoryEntry {
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  note: string;
}

export interface PaymentSubmission {
  submissionId: string;
  flatId: string;
  flatNumber: string;
  ownerName: string;
  submittedByUserId: string;
  submittedByName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: PaymentMethod;
  bankReference: string;
  targetMonths: string[];
  remarks: string;
  evidenceFileId?: string;
  evidenceFileName?: string;
  evidenceMimeType?: string;
  state: SubmissionState;
  clarificationNote?: string;
  rejectionReason?: string;
  approvedPaymentId?: string;
  approvedReceiptId?: string;
  approvedReceiptNumber?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  history: ApprovalHistoryEntry[];
}

export interface ReceiptRecord {
  receiptId: string;
  receiptNumber: string;
  receiptDate: string;
  paymentId: string;
  flatId: string;
  flatNumber: string;
  ownerName: string;
  amountReceived: number;
  paymentMethod: PaymentMethod;
  bankReference: string;
  maintenancePeriod: string;
  allocations: { billingMonth: string; allocatedAmount: number }[];
  status: 'Active' | 'Cancelled / Reversed';
  issuedBy: string;
  createdAt: string;
}

export interface RateRule {
  rateId: string;
  effectiveFrom: string;
  baseMonthlyCharge: number;
  doorLockDiscountPercent: number;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface SocietySettings {
  societyName: string;
  registrationNumber: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  officeHours: string;
  bankAccountName: string;
  bankDetails: string;
  upiId: string;
  standardMonthlyRate: number;
  doorLockDiscountPercent: number;
  receiptPrefix: string;
  rateHistory: RateRule[];
}

export interface WebsiteContent {
  associationName: string;
  subtitle: string;
  themeTagline: string;
  heroTitle: string;
  heroTagline: string;
  heroDescription: string;
  heroImageUrl: string;
  heroImageLabel: string;
  storyHeading: string;
  storyParagraph1: string;
  storyParagraph2: string;
  storyImageUrl: string;
  storyImageLabel: string;
  statFlats: string;
  statBlocks: string;
  statFacilities: string;
  statYears: string;
  amenitiesList: { title: string; description: string }[];
  mapCoordinatesLabel: string;
  updatedAt: string;
}

export interface WebsiteState {
  published: WebsiteContent;
  draft: WebsiteContent;
  hasUnpublishedDraft: boolean;
}

export interface CommitteeMember {
  memberId: string;
  name: string;
  designation: string;
  intro: string;
  term: string;
  photoUrl: string;
  order: number;
  published: boolean;
}

export type GalleryCategory =
  | 'Our Apartment'
  | 'Building Entrance'
  | 'Common Areas'
  | 'Facilities'
  | 'Festivals and Celebrations'
  | 'Community Meetings'
  | 'Maintenance Improvements'
  | 'Special Moments';

export interface GalleryItem {
  photoId: string;
  title: string;
  description: string;
  category: GalleryCategory;
  date: string;
  order: number;
  featured: boolean;
  isPlaceholder: boolean;
  imageUrl: string;
}

export type AnnouncementPriority = 'General' | 'Important' | 'Urgent';

export interface Announcement {
  announcementId: string;
  title: string;
  category: string;
  priority: AnnouncementPriority;
  summary: string;
  body: string;
  publishDate: string;
  expiryDate: string;
  audience: 'Public' | 'Residents Only';
  published: boolean;
}

export interface CommunityEvent {
  eventId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  coverImage: string;
  status: 'Upcoming' | 'Completed';
  featured: boolean;
  published: boolean;
}

export type ComplaintStatus =
  | 'Submitted'
  | 'Acknowledged'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'
  | 'Reopened';

export interface ComplaintHistoryEntry {
  timestamp: string;
  actorName: string;
  actorRole: string;
  status: ComplaintStatus;
  note: string;
}

export interface Complaint {
  complaintId: string;
  flatId: string;
  flatNumber: string;
  residentName: string;
  category: string;
  subject: string;
  description: string;
  priority: 'Normal' | 'Urgent';
  status: ComplaintStatus;
  assignedTo: string;
  resolutionNotes: string;
  photoFileId?: string;
  photoFileName?: string;
  residentFeedback?: string;
  createdAt: string;
  updatedAt: string;
  history: ComplaintHistoryEntry[];
}

export interface NotificationItem {
  notificationId: string;
  userId?: string;
  flatId?: string;
  roleTarget?: UserRole;
  type: 'bill' | 'payment' | 'complaint' | 'announcement' | 'event' | 'security';
  title: string;
  body: string;
  linkScreen?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  billReminders: boolean;
  paymentUpdates: boolean;
  complaintUpdates: boolean;
  announcements: boolean;
  events: boolean;
}

export interface ResidentDocument {
  docId: string;
  title: string;
  category: string;
  publishedDate: string;
  summary: string;
  content: string;
}

export interface AuditLogEntry {
  auditId: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  beforeValue?: string;
  afterValue?: string;
}

export interface ContactSubmission {
  contactId: string;
  name: string;
  email: string;
  phone: string;
  flatNumber: string;
  subject: string;
  message: string;
  submittedAt: string;
}

export interface DashboardSummary {
  selectedMonth: string;
  availableMonths: string[];
  totalFlats: number;
  occupiedCount: number;
  vacantCount: number;
  tenantCount: number;
  monthlyDemandGross: number;
  monthlyConcessions: number;
  monthlyDemandNet: number;
  monthlyCollections: number;
  currentMonthOutstanding: number;
  historicalArrearsOutstanding: number;
  totalOutstanding: number;
  openComplaintsCount: number;
  pendingSubmissionsCount?: number;
  monthlySeries: {
    month: string;
    label: string;
    demand: number;
    collected: number;
  }[];
  recentPayments: PaymentRecord[];
  outstandingFlats: {
    flatId: string;
    flatNumber: string;
    ownerName: string;
    occupancyStatus: OccupancyStatus;
    currentDue: number;
    priorArrears: number;
    totalDue: number;
    unpaidMonths: string[];
  }[];
}

export interface LedgerEntry {
  date: string;
  refNo: string;
  type: 'Bill' | 'Payment' | 'Reversal';
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}
