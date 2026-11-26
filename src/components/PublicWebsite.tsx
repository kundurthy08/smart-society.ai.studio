import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Clock,
  Receipt,
  BookOpen,
  MessageSquareWarning,
  Megaphone,
  FileText,
  CreditCard,
  ArrowRight,
  Menu,
  X,
  CheckCircle2,
  Maximize2,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { PWAInstallButton } from './PWAComponents.tsx';
import type {
  Announcement,
  CommitteeMember,
  CommunityEvent,
  GalleryCategory,
  GalleryItem,
  UserSession,
  WebsiteContent,
} from '../types/society.ts';

export type PublicPage =
  | 'home'
  | 'community'
  | 'committee'
  | 'gallery'
  | 'events'
  | 'notices'
  | 'contact';

interface PublicHomePayload {
  content: WebsiteContent;
  isPreviewDraft: boolean;
  contact: {
    address: string;
    email: string;
    phone: string;
    officeHours: string;
    registrationNumber: string;
  };
  committee: CommitteeMember[];
  gallery: GalleryItem[];
  announcements: Announcement[];
  events: CommunityEvent[];
}

interface PublicWebsiteProps {
  user: UserSession | null;
  previewDraftMode?: boolean;
  onExitPreview?: () => void;
  onOpenLogin: () => void;
  onEnterPortal: () => void;
}

const GALLERY_CATEGORIES: ('All' | GalleryCategory)[] = [
  'All',
  'Our Apartment',
  'Building Entrance',
  'Common Areas',
  'Facilities',
  'Festivals and Celebrations',
  'Community Meetings',
  'Maintenance Improvements',
  'Special Moments',
];

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export const PublicWebsite: React.FC<PublicWebsiteProps> = ({
  user,
  previewDraftMode = false,
  onExitPreview,
  onOpenLogin,
  onEnterPortal,
}) => {
  const [page, setPage] = useState<PublicPage>('home');
  const [data, setData] = useState<PublicHomePayload | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [galleryCategory, setGalleryCategory] = useState<'All' | GalleryCategory>('All');
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Contact form with spam protection
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    flatNumber: '',
    subject: 'Community Inquiry',
    message: '',
    honeypot: '',
    spamAnswer: '',
  });
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const query = previewDraftMode ? '?preview=draft' : '';
    apiFetch<PublicHomePayload>(`/api/public/home${query}`)
      .then(setData)
      .catch(() => {});
  }, [previewDraftMode]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navigatePage = (next: PublicPage) => {
    setPage(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePortalAction = () => {
    if (user) {
      onEnterPortal();
    } else {
      onOpenLogin();
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactMsg(null);
    if (contactForm.spamAnswer.trim() !== '7') {
      setContactMsg({
        type: 'err',
        text: 'Please answer the anti-spam verification question (4 + 3 = 7).',
      });
      return;
    }
    setContactBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactMsg({ type: 'ok', text: res.message });
      setContactForm({
        name: '',
        email: '',
        phone: '',
        flatNumber: '',
        subject: 'Community Inquiry',
        message: '',
        honeypot: '',
        spamAnswer: '',
      });
    } catch (err) {
      setContactMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to submit message.',
      });
    } finally {
      setContactBusy(false);
    }
  };

  const filteredGallery = useMemo(() => {
    if (!data) return [];
    if (galleryCategory === 'All') return data.gallery;
    return data.gallery.filter((g) => g.category === galleryCategory);
  }, [data, galleryCategory]);

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center text-[#26332E]">
        <div className="text-center space-y-2">
          <div className="font-display text-2xl font-semibold text-[#234D3C]">
            HAPPY HOMES PALACE-B
          </div>
          <p className="text-sm text-[#52615B]">Loading community website...</p>
        </div>
      </div>
    );
  }

  const { content, contact, committee, gallery, announcements, events } = data;
  const featuredNotices = announcements.slice(0, 3);
  const featuredEvents = events.slice(0, 3);

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F6F1] text-[#26332E]">
      {/* Draft Preview Banner if Committee Admin is previewing unpublished changes */}
      {data.isPreviewDraft && (
        <div className="bg-[#C5A46D] text-[#1A2621] px-6 py-2 text-xs font-semibold flex items-center justify-between">
          <span>Draft Preview Mode — Viewing unpublished website edits</span>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="underline cursor-pointer"
            >
              Return to Committee Admin
            </button>
          )}
        </div>
      )}

      {/* SECTION 1 — ELEGANT HEADER (3-zone contract) */}
      <header
        className={`sticky top-0 z-40 transition-colors border-b ${
          scrolled
            ? 'bg-[#F8F6F1]/95 backdrop-blur border-[#E2DDD3] shadow-xs'
            : 'bg-[#F8F6F1] border-[#E2DDD3]/70'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigatePage('home')}
            className="flex items-center gap-2.5 font-display font-bold text-lg tracking-tight text-[#234D3C] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="w-8 h-8 rounded-lg bg-[#234D3C] text-[#F8F6F1] flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" aria-hidden="true" />
            </span>
            <span>{content.associationName}</span>
          </button>

          {/* Zone 2: Clean single-line navigation links */}
          <nav
            aria-label="Community Website Navigation"
            className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#52615B]"
          >
            {(
              [
                ['home', 'Home'],
                ['community', 'Our Community'],
                ['committee', 'Association'],
                ['gallery', 'Gallery'],
                ['notices', 'Notices'],
                ['contact', 'Contact'],
              ] as [PublicPage, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => navigatePage(id)}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                  page === id
                    ? 'text-[#234D3C] font-semibold underline underline-offset-8 decoration-[#C5A46D] decoration-2'
                    : 'hover:text-[#234D3C]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Install App + Primary CTA + Mobile Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden xl:block">
              <PWAInstallButton variant="compact" />
            </div>
            <button
              type="button"
              onClick={handlePortalAction}
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-[#F8F6F1] bg-[#234D3C] hover:bg-[#1B3D2F] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user
                ? user.role === 'resident'
                  ? 'My Community App'
                  : 'Committee Portal'
                : 'Resident App Login'}
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2.5 rounded-lg border border-[#D8D1C5] text-[#26332E] hover:bg-white cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-[#E2DDD3] bg-[#F8F6F1] px-6 py-4 space-y-2">
            {(
              [
                ['home', 'Home'],
                ['community', 'Our Community'],
                ['committee', 'Association Committee'],
                ['gallery', 'Photo Gallery'],
                ['events', 'Community Events'],
                ['notices', 'Announcements'],
                ['contact', 'Contact'],
              ] as [PublicPage, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => navigatePage(id)}
                className="block w-full text-left py-2.5 text-sm font-medium text-[#26332E]"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                handlePortalAction();
              }}
              className="w-full mt-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#234D3C] rounded-lg"
            >
              {user ? 'Enter Portal' : 'Resident Login'}
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">
        {page === 'home' && (
          <>
            {/* SECTION 2 — CINEMATIC HERO */}
            <section className="relative bg-[#1B3D2F] text-[#F8F6F1] overflow-hidden">
              <div className="relative min-h-[540px] lg:min-h-[620px] flex items-center">
                <img
                  src={content.heroImageUrl}
                  alt="Happy Homes Palace-B apartment facade and garden courtyard"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#162B22]/90 via-[#162B22]/70 to-[#162B22]/30" />

                <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 w-full">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#AFC5B5] mb-3">
                      {content.subtitle} · {content.themeTagline}
                    </p>
                    <h1
                      className="font-display font-bold tracking-tight text-white mb-4"
                      style={{
                        fontSize: 'clamp(2.25rem, 4vw, 3.6rem)',
                        lineHeight: 1.1,
                        textWrap: 'balance',
                      }}
                    >
                      {content.heroTitle}
                    </h1>
                    <p className="font-display italic text-xl sm:text-2xl text-[#E8DFCE] mb-4">
                      &ldquo;{content.heroTagline}&rdquo;
                    </p>
                    <p className="text-base sm:text-lg text-[#E6ECE8] leading-relaxed mb-8 max-w-xl">
                      {content.heroDescription}
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <a
                        href="#our-community"
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#162B22] bg-[#F8F6F1] hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Explore Our Community</span>
                        <ArrowRight className="w-4 h-4" />
                      </a>
                      <a
                        href="#resident-services"
                        className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white border border-white/50 hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        Resident Services
                      </a>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-3 right-6 z-10 text-[11px] text-white/75">
                  {content.heroImageLabel}
                </div>
              </div>
            </section>

            {/* SECTION 3 — WELCOME TO OUR COMMUNITY */}
            <section id="our-community" className="py-16 lg:py-24 bg-[#F8F6F1] border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
                  <div className="lg:col-span-6 flex flex-col justify-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-3">
                      Welcome to Our Community
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-[#26332E] mb-6 leading-tight">
                      {content.storyHeading}
                    </h2>
                    <p className="text-base text-[#46554F] leading-relaxed mb-4 first-letter:text-4xl first-letter:font-display first-letter:font-bold first-letter:text-[#234D3C] first-letter:float-left first-letter:mr-2.5 first-letter:leading-none">
                      {content.storyParagraph1}
                    </p>
                    <p className="text-base text-[#46554F] leading-relaxed mb-8">
                      {content.storyParagraph2}
                    </p>
                    <div>
                      <button
                        type="button"
                        onClick={() => navigatePage('community')}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-[#234D3C] hover:underline underline-offset-4 cursor-pointer"
                      >
                        <span>Read Our Story &amp; Explore Amenities</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-6">
                    <div className="h-full min-h-[320px] rounded-2xl overflow-hidden border border-[#DDD7CB] bg-white shadow-sm flex flex-col">
                      <img
                        src={content.storyImageUrl}
                        alt="Happy Homes Palace-B courtyard garden and seating pergola"
                        referrerPolicy="no-referrer"
                        className="w-full h-full min-h-[280px] object-cover flex-1"
                      />
                      <div className="px-4 py-2.5 bg-white border-t border-[#ECE7DC] text-xs text-[#64736D] italic font-display">
                        {content.storyImageLabel}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 4 — COMMUNITY AT A GLANCE (Non-financial highlights only) */}
            <section className="py-12 bg-white border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    ['Residences', content.statFlats],
                    ['Residential Wing', content.statBlocks],
                    ['Shared Spaces', content.statFacilities],
                    ['Community Heritage', content.statYears],
                  ].map(([label, val]) => (
                    <div key={label} className="p-5 rounded-xl bg-[#F8F6F1] border border-[#E5E0D5]">
                      <div className="text-xs font-medium text-[#5B6B64]">{label}</div>
                      <div className="mt-1.5 text-xl font-display font-bold text-[#234D3C]">
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 5 — COMMUNITY TODAY */}
            <section className="py-16 lg:py-20 bg-[#F8F6F1] border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                      Living Information Centre
                    </p>
                    <h2 className="text-3xl font-display font-bold text-[#26332E]">
                      Community Today
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigatePage('notices')}
                    className="text-sm font-semibold text-[#234D3C] hover:underline cursor-pointer self-start sm:self-auto"
                  >
                    View All Public Notices
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {featuredNotices.map((notice) => (
                    <article
                      key={notice.announcementId}
                      className="bg-white border border-[#E2DDD3] rounded-xl p-6 flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-[#5B6B64] mb-3">
                          <span className="font-semibold text-[#234D3C]">
                            {notice.priority} · {notice.category}
                          </span>
                          <span className="tabular-nums">{notice.publishDate}</span>
                        </div>
                        <h3 className="text-lg font-display font-semibold text-[#26332E] mb-2">
                          {notice.title}
                        </h3>
                        <p className="text-sm text-[#52615B] leading-relaxed">{notice.summary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveAnnouncement(notice)}
                        className="mt-5 text-xs font-semibold text-[#234D3C] hover:underline self-start cursor-pointer"
                      >
                        Read Full Circular
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 6 — MEET OUR ASSOCIATION COMMITTEE */}
            <section className="py-16 lg:py-20 bg-white border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                      Owners Welfare Association
                    </p>
                    <h2 className="text-3xl font-display font-bold text-[#26332E]">
                      The People Behind Our Community.
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigatePage('committee')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#234D3C] border border-[#234D3C]/30 hover:bg-[#F8F6F1] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <span>Meet the Full Committee</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {committee.slice(0, 6).map((member) => (
                    <article
                      key={member.memberId}
                      className="bg-[#F8F6F1] border border-[#E2DDD3] rounded-xl p-6 flex items-start gap-4"
                    >
                      {member.photoUrl ? (
                        <img
                          src={member.photoUrl}
                          alt={member.name}
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 rounded-full object-cover border border-[#C5A46D] shrink-0"
                        />
                      ) : (
                        <div
                          aria-label={`Neutral portrait placeholder for ${member.name}`}
                          className="w-16 h-16 rounded-full bg-[#234D3C] text-[#F8F6F1] font-display font-semibold text-lg flex items-center justify-center border-2 border-[#C5A46D]/60 shrink-0"
                        >
                          {getInitials(member.name)}
                        </div>
                      )}
                      <div>
                        <h3 className="font-display font-bold text-lg text-[#26332E]">
                          {member.name}
                        </h3>
                        <p className="text-xs font-semibold text-[#234D3C] mb-2">
                          {member.designation} · Term {member.term}
                        </p>
                        <p className="text-sm text-[#52615B] leading-relaxed">{member.intro}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 7 — LIFE IN OUR COMMUNITY (PHOTO GALLERY) */}
            <section className="py-16 lg:py-20 bg-[#F8F6F1] border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                      Photo Gallery
                    </p>
                    <h2 className="text-3xl font-display font-bold text-[#26332E]">
                      Life in Our Community
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigatePage('gallery')}
                    className="text-sm font-semibold text-[#234D3C] hover:underline cursor-pointer self-start md:self-auto"
                  >
                    Open Full Gallery ({gallery.length} Photos)
                  </button>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6">
                  {GALLERY_CATEGORIES.slice(0, 6).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGalleryCategory(cat)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        galleryCategory === cat
                          ? 'bg-[#234D3C] text-white border-[#234D3C]'
                          : 'bg-white text-[#52615B] border-[#DFD9CD] hover:border-[#234D3C]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {filteredGallery.slice(0, 4).map((item) => (
                    <figure
                      key={item.photoId}
                      onClick={() => setLightboxItem(item)}
                      className="group bg-white border border-[#E2DDD3] rounded-xl overflow-hidden cursor-pointer hover:border-[#234D3C] transition-colors"
                    >
                      <div className="aspect-[4/3] overflow-hidden relative bg-[#EAE5DA]">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        />
                        <span className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <figcaption className="p-4">
                        <div className="text-[11px] font-medium text-[#234D3C] mb-1">
                          {item.category} · {item.date}
                        </div>
                        <div className="font-display font-semibold text-sm text-[#26332E]">
                          {item.title}
                        </div>
                        {item.isPlaceholder && (
                          <div className="text-[11px] text-[#708079] italic mt-1">
                            Preview placeholder image
                          </div>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 8 — EVENTS AND CELEBRATIONS */}
            <section className="py-16 lg:py-20 bg-white border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                      Gatherings &amp; Traditions
                    </p>
                    <h2 className="text-3xl font-display font-bold text-[#26332E]">
                      Events and Celebrations
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigatePage('events')}
                    className="text-sm font-semibold text-[#234D3C] hover:underline cursor-pointer self-start sm:self-auto"
                  >
                    View All Community Events
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {featuredEvents.map((evt) => (
                    <article
                      key={evt.eventId}
                      className="bg-[#F8F6F1] border border-[#E2DDD3] rounded-xl overflow-hidden flex flex-col"
                    >
                      <div className="aspect-[16/10] bg-[#EAE5DA]">
                        <img
                          src={evt.coverImage}
                          alt={evt.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs text-[#52615B] mb-2">
                            <span className="font-semibold text-[#234D3C]">{evt.status}</span>
                            <span className="tabular-nums">{evt.date}</span>
                          </div>
                          <h3 className="font-display font-bold text-lg text-[#26332E] mb-2">
                            {evt.title}
                          </h3>
                          <p className="text-sm text-[#52615B] leading-relaxed mb-3">
                            {evt.description}
                          </p>
                        </div>
                        <div className="text-xs text-[#64736D] pt-3 border-t border-[#E2DDD3] flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#234D3C]" />
                          <span>
                            {evt.location} · {evt.time}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 9 — RESIDENT SERVICES */}
            <section
              id="resident-services"
              className="py-16 lg:py-20 bg-[#234D3C] text-[#F8F6F1]"
            >
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
                  <div className="max-w-2xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#AFC5B5] mb-2">
                      Secure Resident Corner
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
                      Everything You Need, Right at Home.
                    </h2>
                    <p className="text-[#D4E2D9] text-sm sm:text-base mt-3 leading-relaxed">
                      Sign in with your authorized resident account to view flat-wise maintenance
                      dues, download numbered PDF receipts, and submit maintenance requests.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
                    <PWAInstallButton variant="compact" />
                    <button
                      type="button"
                      onClick={handlePortalAction}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#1B3D2F] bg-[#F8F6F1] hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Open Resident App</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[
                    {
                      icon: CreditCard,
                      title: 'Maintenance Dues',
                      desc: 'View monthly maintenance dues, approved concessions, and outstanding balances.',
                    },
                    {
                      icon: Receipt,
                      title: 'Digital Receipts',
                      desc: 'Access and download official numbered PDF maintenance receipts anytime.',
                    },
                    {
                      icon: BookOpen,
                      title: 'My Account',
                      desc: 'View flat-wise financial statements with chronological ledger balances.',
                    },
                    {
                      icon: MessageSquareWarning,
                      title: 'Complaints',
                      desc: 'Register maintenance tickets and track real-time repair progress.',
                    },
                    {
                      icon: Megaphone,
                      title: 'Announcements',
                      desc: 'Read important resident communications and committee circulars.',
                    },
                    {
                      icon: FileText,
                      title: 'Documents',
                      desc: 'Access association bye-laws, tariff rules, and emergency vendor contacts.',
                    },
                  ].map((svc) => {
                    const Icon = svc.icon;
                    return (
                      <div
                        key={svc.title}
                        className="p-6 rounded-xl bg-[#1B3D2F] border border-white/15 space-y-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-[#2C5E4A] text-[#E6DFC8] flex items-center justify-center">
                          <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="font-display font-semibold text-lg text-white">
                          {svc.title}
                        </h3>
                        <p className="text-sm text-[#D0DFD6] leading-relaxed">{svc.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* SECTION 10 — IMPORTANT ANNOUNCEMENTS */}
            <section className="py-16 lg:py-20 bg-[#F8F6F1] border-b border-[#E2DDD3]">
              <div className="max-w-7xl mx-auto px-6">
                <div className="max-w-2xl mb-10">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                    Circulars &amp; Advisories
                  </p>
                  <h2 className="text-3xl font-display font-bold text-[#26332E]">
                    Important Announcements
                  </h2>
                </div>

                <div className="divide-y divide-[#DFD9CD] bg-white border border-[#E2DDD3] rounded-xl overflow-hidden">
                  {announcements.map((ann) => (
                    <div
                      key={ann.announcementId}
                      className="p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#FCFBF8]"
                    >
                      <div className="space-y-1 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`font-semibold ${
                              ann.priority === 'Urgent'
                                ? 'text-red-700'
                                : ann.priority === 'Important'
                                ? 'text-[#8B6B35]'
                                : 'text-[#234D3C]'
                            }`}
                          >
                            {ann.priority}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[#52615B]">{ann.category}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-[#64736D] tabular-nums">{ann.publishDate}</span>
                        </div>
                        <h3 className="font-display font-semibold text-lg text-[#26332E]">
                          {ann.title}
                        </h3>
                        <p className="text-sm text-[#52615B]">{ann.summary}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveAnnouncement(ann)}
                        className="px-4 py-2 text-xs font-semibold text-[#234D3C] border border-[#234D3C]/30 hover:bg-[#F8F6F1] rounded-lg whitespace-nowrap shrink-0 cursor-pointer self-start md:self-center"
                      >
                        Read More
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* SECTION 11 — CONTACT AND LOCATION */}
            <section id="contact" className="py-16 lg:py-20 bg-white">
              <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  <div className="lg:col-span-5 space-y-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C] mb-2">
                        Association Office
                      </p>
                      <h2 className="text-3xl font-display font-bold text-[#26332E] mb-3">
                        Contact &amp; Location
                      </h2>
                      <p className="text-sm text-[#52615B] leading-relaxed">
                        Reach out to the Owners Welfare Association office for community matters,
                        clubhouse bookings, or visitor guidance.
                      </p>
                    </div>

                    <div className="p-6 rounded-xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-4 text-sm">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-[#234D3C] mt-1 shrink-0" />
                        <div>
                          <div className="font-semibold text-[#26332E]">
                            {content.associationName} {content.subtitle}
                          </div>
                          <div className="text-[#52615B]">{contact.address}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[#26332E]">
                        <Phone className="w-4 h-4 text-[#234D3C] shrink-0" />
                        <span className="tabular-nums">{contact.phone}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[#26332E]">
                        <Mail className="w-4 h-4 text-[#234D3C] shrink-0" />
                        <span>{contact.email}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[#26332E]">
                        <Clock className="w-4 h-4 text-[#234D3C] shrink-0" />
                        <span>{contact.officeHours}</span>
                      </div>
                    </div>

                    <div className="p-5 rounded-xl border border-[#E2DDD3] bg-[#FCFBF8] text-xs text-[#52615B]">
                      <div className="font-semibold text-[#234D3C] mb-1">Verified Location</div>
                      <p>{content.mapCoordinatesLabel}</p>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <form
                      onSubmit={handleContactSubmit}
                      className="p-6 sm:p-8 rounded-2xl bg-[#F8F6F1] border border-[#E2DDD3] space-y-4"
                    >
                      <h3 className="text-xl font-display font-bold text-[#26332E]">
                        Write to the Association Office
                      </h3>

                      {contactMsg && (
                        <div
                          className={`p-3.5 rounded-lg border text-sm flex items-start gap-2 ${
                            contactMsg.type === 'ok'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-red-50 border-red-200 text-red-800'
                          }`}
                        >
                          {contactMsg.type === 'ok' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                          )}
                          <span>{contactMsg.text}</span>
                        </div>
                      )}

                      {/* Honeypot field hidden from human visitors */}
                      <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={contactForm.honeypot}
                        onChange={(e) =>
                          setContactForm((f) => ({ ...f, honeypot: e.target.value }))
                        }
                        className="hidden"
                        aria-hidden="true"
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={contactForm.name}
                            onChange={(e) =>
                              setContactForm((f) => ({ ...f, name: e.target.value }))
                            }
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            required
                            value={contactForm.email}
                            onChange={(e) =>
                              setContactForm((f) => ({ ...f, email: e.target.value }))
                            }
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            value={contactForm.phone}
                            onChange={(e) =>
                              setContactForm((f) => ({ ...f, phone: e.target.value }))
                            }
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                            Flat Number (if resident)
                          </label>
                          <input
                            type="text"
                            value={contactForm.flatNumber}
                            onChange={(e) =>
                              setContactForm((f) => ({ ...f, flatNumber: e.target.value }))
                            }
                            className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                          Message *
                        </label>
                        <textarea
                          required
                          rows={4}
                          value={contactForm.message}
                          onChange={(e) =>
                            setContactForm((f) => ({ ...f, message: e.target.value }))
                          }
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        <div className="max-w-xs">
                          <label className="block text-xs font-semibold text-[#26332E] mb-1.5">
                            Anti-Spam Verification: What is 4 + 3? *
                          </label>
                          <input
                            type="text"
                            required
                            value={contactForm.spamAnswer}
                            onChange={(e) =>
                              setContactForm((f) => ({ ...f, spamAnswer: e.target.value }))
                            }
                            placeholder="Enter answer"
                            className="w-full px-3.5 py-2 text-sm bg-white border border-[#D8D1C5] rounded-lg focus:outline-none focus:border-[#234D3C]"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={contactBusy}
                          className="px-6 py-2.5 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] disabled:opacity-60 rounded-lg cursor-pointer"
                        >
                          {contactBusy ? 'Sending...' : 'Send Message'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {/* DEDICATED PUBLIC SUB-PAGES */}
        {page === 'community' && (
          <section className="max-w-7xl mx-auto px-6 py-12 space-y-12">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#234D3C]">
                  About Our Community
                </p>
                <h1 className="text-4xl font-display font-bold text-[#26332E]">
                  {content.storyHeading}
                </h1>
                <p className="text-base text-[#46554F] leading-relaxed">
                  {content.storyParagraph1}
                </p>
                <p className="text-base text-[#46554F] leading-relaxed">
                  {content.storyParagraph2}
                </p>
              </div>
              <div className="lg:col-span-6">
                <img
                  src={content.storyImageUrl}
                  alt="Courtyard garden"
                  referrerPolicy="no-referrer"
                  className="w-full rounded-2xl border border-[#DFD9CD] object-cover aspect-[4/3]"
                />
              </div>
            </div>

            <div className="pt-8 border-t border-[#E2DDD3]">
              <h2 className="text-2xl font-display font-bold text-[#26332E] mb-6">
                Facilities &amp; Amenities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {content.amenitiesList.map((am) => (
                  <div key={am.title} className="bg-white border border-[#E2DDD3] rounded-xl p-6">
                    <h3 className="font-display font-semibold text-lg text-[#234D3C] mb-2">
                      {am.title}
                    </h3>
                    <p className="text-sm text-[#52615B] leading-relaxed">{am.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === 'committee' && (
          <section className="max-w-7xl mx-auto px-6 py-12 space-y-8">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <div>
              <h1 className="text-4xl font-display font-bold text-[#26332E] mb-2">
                Association Committee Directory
              </h1>
              <p className="text-sm text-[#52615B]">
                Elected office bearers serving {content.associationName} {content.subtitle}.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {committee.map((m) => (
                <article
                  key={m.memberId}
                  className="bg-white border border-[#E2DDD3] rounded-xl p-6 flex items-start gap-4"
                >
                  {m.photoUrl ? (
                    <img
                      src={m.photoUrl}
                      alt={m.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded-full object-cover border border-[#C5A46D] shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-[#234D3C] text-[#F8F6F1] font-display font-semibold text-lg flex items-center justify-center border-2 border-[#C5A46D]/60 shrink-0">
                      {getInitials(m.name)}
                    </div>
                  )}
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#26332E]">{m.name}</h2>
                    <p className="text-xs font-semibold text-[#234D3C] mb-2">
                      {m.designation} · Term {m.term}
                    </p>
                    <p className="text-sm text-[#52615B] leading-relaxed">{m.intro}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'gallery' && (
          <section className="max-w-7xl mx-auto px-6 py-12 space-y-8">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <div>
              <h1 className="text-4xl font-display font-bold text-[#26332E] mb-2">
                Community Photo Gallery
              </h1>
              <p className="text-sm text-[#52615B]">
                Moments across our apartment buildings, gardens, festivals, and shared spaces.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {GALLERY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGalleryCategory(cat)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    galleryCategory === cat
                      ? 'bg-[#234D3C] text-white border-[#234D3C]'
                      : 'bg-white text-[#52615B] border-[#DFD9CD]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {filteredGallery.length === 0 ? (
              <div className="p-10 text-center bg-white border border-[#E2DDD3] rounded-xl text-sm text-[#52615B]">
                No photos uploaded in the &ldquo;{galleryCategory}&rdquo; category yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGallery.map((item) => (
                  <figure
                    key={item.photoId}
                    onClick={() => setLightboxItem(item)}
                    className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden cursor-pointer hover:border-[#234D3C]"
                  >
                    <div className="aspect-[4/3] bg-[#EAE5DA]">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <figcaption className="p-5">
                      <div className="text-xs text-[#234D3C] font-semibold mb-1">
                        {item.category} · {item.date}
                      </div>
                      <div className="font-display font-bold text-base text-[#26332E]">
                        {item.title}
                      </div>
                      <p className="text-xs text-[#52615B] mt-1">{item.description}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'events' && (
          <section className="max-w-7xl mx-auto px-6 py-12 space-y-8">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <h1 className="text-4xl font-display font-bold text-[#26332E]">
              Community Events &amp; Gatherings
            </h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {events.map((evt) => (
                <article
                  key={evt.eventId}
                  className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden flex flex-col"
                >
                  <img
                    src={evt.coverImage}
                    alt={evt.title}
                    referrerPolicy="no-referrer"
                    className="w-full aspect-[16/10] object-cover"
                  />
                  <div className="p-5 space-y-2">
                    <div className="text-xs font-semibold text-[#234D3C]">
                      {evt.status} · {evt.date}
                    </div>
                    <h2 className="font-display font-bold text-lg text-[#26332E]">{evt.title}</h2>
                    <p className="text-sm text-[#52615B]">{evt.description}</p>
                    <p className="text-xs text-[#64736D] pt-2">
                      {evt.location} · {evt.time}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'notices' && (
          <section className="max-w-5xl mx-auto px-6 py-12 space-y-8">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <h1 className="text-4xl font-display font-bold text-[#26332E]">
              Public Announcements &amp; Circulars
            </h1>
            <div className="space-y-4">
              {announcements.map((ann) => (
                <article
                  key={ann.announcementId}
                  className="bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-2"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[#234D3C]">{ann.priority}</span>
                    <span>·</span>
                    <span>{ann.category}</span>
                    <span>·</span>
                    <span className="tabular-nums">{ann.publishDate}</span>
                  </div>
                  <h2 className="font-display font-bold text-xl text-[#26332E]">{ann.title}</h2>
                  <p className="text-sm text-[#46554F] leading-relaxed">{ann.body}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === 'contact' && (
          <section className="max-w-4xl mx-auto px-6 py-12 space-y-6">
            <button
              type="button"
              onClick={() => navigatePage('home')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
            <h1 className="text-4xl font-display font-bold text-[#26332E]">
              Association Office Contact
            </h1>
            <div className="bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-3 text-sm">
              <div>
                <strong>{content.associationName} {content.subtitle}</strong>
              </div>
              <div>{contact.address}</div>
              <div>Phone: {contact.phone} · Email: {contact.email}</div>
              <div>Office Hours: {contact.officeHours}</div>
            </div>
          </section>
        )}
      </main>

      {/* SECTION 12 — DARK FOREST-GREEN FOOTER */}
      <footer className="bg-[#234D3C] text-[#F8F6F1] py-14">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5 font-display font-bold text-xl text-white">
              <Building2 className="w-5 h-5 text-[#C5A46D]" />
              <span>{content.associationName}</span>
            </div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#AFC5B5]">
              {content.subtitle} · {content.themeTagline}
            </p>
            <p className="text-sm text-[#D6E3DC] leading-relaxed max-w-md">
              Fostering neighborly harmony, well-maintained shared spaces, and transparent
              residential administration for every family in our community.
            </p>
          </div>

          <div className="md:col-span-4 space-y-2 text-sm">
            <div className="font-display font-semibold text-white mb-2">Community Links</div>
            <div className="grid grid-cols-2 gap-y-2 text-[#D6E3DC]">
              <button type="button" onClick={() => navigatePage('community')} className="text-left hover:text-white cursor-pointer">Our Community</button>
              <button type="button" onClick={() => navigatePage('committee')} className="text-left hover:text-white cursor-pointer">Committee</button>
              <button type="button" onClick={() => navigatePage('gallery')} className="text-left hover:text-white cursor-pointer">Photo Gallery</button>
              <button type="button" onClick={() => navigatePage('events')} className="text-left hover:text-white cursor-pointer">Events</button>
              <button type="button" onClick={() => navigatePage('notices')} className="text-left hover:text-white cursor-pointer">Announcements</button>
              <button type="button" onClick={handlePortalAction} className="text-left hover:text-white cursor-pointer">Resident Login</button>
            </div>
          </div>

          <div className="md:col-span-3 space-y-2 text-sm text-[#D6E3DC]">
            <div className="font-display font-semibold text-white mb-2">Office Contact</div>
            <p>{contact.address}</p>
            <p>{contact.email}</p>
            <p className="tabular-nums">{contact.phone}</p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#AFC5B5]">
          <span>
            © 2026 {content.associationName} {content.subtitle} · Reg. {contact.registrationNumber}
          </span>
          <button
            type="button"
            onClick={() => setPrivacyOpen(true)}
            className="hover:text-white underline underline-offset-4 cursor-pointer"
          >
            Privacy Policy &amp; Resident Data Protection
          </button>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-black">
              <img
                src={lightboxItem.imageUrl}
                alt={lightboxItem.title}
                referrerPolicy="no-referrer"
                className="w-full max-h-[70vh] object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer"
                aria-label="Close image preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="text-xs font-semibold text-[#234D3C]">
                {lightboxItem.category} · {lightboxItem.date}
              </div>
              <h3 className="font-display font-bold text-lg text-[#26332E] mt-1">
                {lightboxItem.title}
              </h3>
              <p className="text-sm text-[#52615B] mt-1">{lightboxItem.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Reader Modal */}
      {activeAnnouncement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-[#234D3C]">
                  {activeAnnouncement.priority} · {activeAnnouncement.category} ·{' '}
                  {activeAnnouncement.publishDate}
                </div>
                <h3 className="font-display font-bold text-xl text-[#26332E] mt-1">
                  {activeAnnouncement.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveAnnouncement(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#46554F] leading-relaxed">{activeAnnouncement.body}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setActiveAnnouncement(null)}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {privacyOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#234D3C]">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="font-display font-bold text-lg text-[#26332E]">
                  Privacy &amp; Resident Data Protection
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#46554F] leading-relaxed">
              Public community pages never display private resident contact numbers, personal
              flat ledgers, or maintenance balances. Financial records, numbered PDF receipts,
              and flat statements are accessible solely to verified flat owners and authorized
              association committee officers.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
