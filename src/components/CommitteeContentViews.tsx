import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Plus,
  Trash2,
  Upload,
  Save,
  Send,
  Pencil,
  X,
} from 'lucide-react';
import { apiFetch, buildAuthenticatedAssetUrl } from '../lib/api.ts';
import type {
  Announcement,
  AnnouncementPriority,
  CommitteeMember,
  CommunityEvent,
  Complaint,
  ComplaintStatus,
  GalleryCategory,
  GalleryItem,
  WebsiteContent,
  WebsiteState,
} from '../types/society.ts';

// ============================================================================
// 1. WEBSITE CONTENT MANAGEMENT (DRAFT / PREVIEW / PUBLISH)
// ============================================================================
export const WebsiteContentManager: React.FC<{ onPreviewDraft: () => void }> = ({
  onPreviewDraft,
}) => {
  const [state, setState] = useState<WebsiteState | null>(null);
  const [draft, setDraft] = useState<WebsiteContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ website: WebsiteState }>('/api/cms/website').then((res) => {
      setState(res.website);
      setDraft(res.website.draft);
    });
  }, []);

  const handleSave = async (action: 'draft' | 'publish') => {
    if (!draft) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ website: WebsiteState }>('/api/cms/website', {
        method: 'PUT',
        body: JSON.stringify({ draft, action }),
      });
      setState(res.website);
      setDraft(res.website.draft);
      setMsg(
        action === 'publish'
          ? 'Website content published live to the public homepage.'
          : 'Draft saved. Use "Preview Draft" to inspect before publishing.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!draft) return <div className="text-sm text-[#52615B]">Loading website editor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Manage Community Website Content
          </h1>
          <p className="text-sm text-[#52615B] mt-0.5">
            Update association identity, hero banner, story, and community highlights without editing source code.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('draft')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#26332E] bg-white border border-[#D8D1C5] hover:bg-[#F8F6F1] rounded-lg cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            onClick={onPreviewDraft}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#234D3C] bg-[#EBF1EC] hover:bg-[#DCE7DE] rounded-lg cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Preview Draft</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave('publish')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] hover:bg-[#1B3D2F] rounded-lg cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Publish Live</span>
          </button>
        </div>
      </div>

      {state?.hasUnpublishedDraft && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
          You have unpublished draft changes saved. Click &ldquo;Publish Live&rdquo; when ready.
        </div>
      )}

      {msg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-4">
          <h2 className="font-display font-bold text-lg text-[#26332E]">
            Identity &amp; Hero Section
          </h2>
          <div>
            <label className="block text-xs font-semibold mb-1">Association Name</label>
            <input
              type="text"
              value={draft.associationName}
              onChange={(e) => setDraft({ ...draft, associationName: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Subtitle</label>
              <input
                type="text"
                value={draft.subtitle}
                onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Community Theme</label>
              <input
                type="text"
                value={draft.themeTagline}
                onChange={(e) => setDraft({ ...draft, themeTagline: e.target.value })}
                className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Hero Headline</label>
            <input
              type="text"
              value={draft.heroTitle}
              onChange={(e) => setDraft({ ...draft, heroTitle: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Hero Tagline</label>
            <input
              type="text"
              value={draft.heroTagline}
              onChange={(e) => setDraft({ ...draft, heroTagline: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Hero Description</label>
            <textarea
              rows={3}
              value={draft.heroDescription}
              onChange={(e) => setDraft({ ...draft, heroDescription: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
        </div>

        <div className="bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-4">
          <h2 className="font-display font-bold text-lg text-[#26332E]">
            Community Story &amp; Public Highlights
          </h2>
          <div>
            <label className="block text-xs font-semibold mb-1">Story Heading</label>
            <input
              type="text"
              value={draft.storyHeading}
              onChange={(e) => setDraft({ ...draft, storyHeading: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Introduction Paragraph</label>
            <textarea
              rows={3}
              value={draft.storyParagraph1}
              onChange={(e) => setDraft({ ...draft, storyParagraph1: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Association Stewardship</label>
            <textarea
              rows={3}
              value={draft.storyParagraph2}
              onChange={(e) => setDraft({ ...draft, storyParagraph2: e.target.value })}
              className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Residences Highlight</label>
              <input
                type="text"
                value={draft.statFlats}
                onChange={(e) => setDraft({ ...draft, statFlats: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Wing / Blocks</label>
              <input
                type="text"
                value={draft.statBlocks}
                onChange={(e) => setDraft({ ...draft, statBlocks: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Facilities</label>
              <input
                type="text"
                value={draft.statFacilities}
                onChange={(e) => setDraft({ ...draft, statFacilities: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Years / Established</label>
              <input
                type="text"
                value={draft.statYears}
                onChange={(e) => setDraft({ ...draft, statYears: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. COMMITTEE MEMBERS MANAGER
// ============================================================================
export const CommitteeManagerView: React.FC = () => {
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CommitteeMember | null>(null);
  const [form, setForm] = useState({
    name: '',
    designation: 'Executive Member',
    intro: '',
    term: '2025 – 2027',
    order: 7,
    photoUrl: '',
  });

  const load = async () => {
    const res = await apiFetch<{ committee: CommitteeMember[] }>('/api/cms/committee');
    setMembers(res.committee);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await apiFetch(`/api/cms/committee/${editing.memberId}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
    } else {
      await apiFetch('/api/cms/committee', {
        method: 'POST',
        body: JSON.stringify(form),
      });
    }
    setModalOpen(false);
    await load();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/cms/committee/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Manage Association Committee
          </h1>
          <p className="text-sm text-[#52615B]">
            Update office bearers when committee terms change. Neutral avatars are shown unless a member photo is provided.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setForm({
              name: '',
              designation: 'Executive Member',
              intro: '',
              term: '2025 – 2027',
              order: members.length + 1,
              photoUrl: '',
            });
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Committee Member</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {members.map((m) => (
          <div
            key={m.memberId}
            className="bg-white border border-[#E2DDD3] rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="text-xs font-semibold text-[#234D3C]">
                #{m.order} · {m.designation} · {m.term}
              </div>
              <h3 className="font-display font-bold text-lg text-[#26332E] mt-1">{m.name}</h3>
              <p className="text-sm text-[#52615B] mt-2">{m.intro}</p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#F0ECE3]">
              <button
                type="button"
                onClick={() => {
                  setEditing(m);
                  setForm({
                    name: m.name,
                    designation: m.designation,
                    intro: m.intro,
                    term: m.term,
                    order: m.order,
                    photoUrl: m.photoUrl,
                  });
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#234D3C] hover:underline cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(m.memberId)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">
                {editing ? 'Edit Committee Member' : 'Add Committee Member'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Designation *</label>
                  <input
                    type="text"
                    required
                    value={form.designation}
                    onChange={(e) => setForm({ ...form, designation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Term</label>
                  <input
                    type="text"
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Short Introduction</label>
                <textarea
                  rows={3}
                  value={form.intro}
                  onChange={(e) => setForm({ ...form, intro: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm border border-[#D8D1C5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. GALLERY MANAGER
// ============================================================================
const CATEGORIES: GalleryCategory[] = [
  'Our Apartment',
  'Building Entrance',
  'Common Areas',
  'Facilities',
  'Festivals and Celebrations',
  'Community Meetings',
  'Maintenance Improvements',
  'Special Moments',
];

export const GalleryManagerView: React.FC = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Our Apartment' as GalleryCategory,
    date: '2026-11-23',
    imageUrl: '',
    featured: true,
    isPlaceholder: false,
  });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const res = await apiFetch<{ gallery: GalleryItem[] }>('/api/cms/gallery');
    setItems(res.gallery);
  };

  useEffect(() => {
    load();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((f) => ({ ...f, imageUrl: reader.result as string, isPlaceholder: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.imageUrl) return;
    setUploading(true);
    try {
      await apiFetch('/api/cms/gallery', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({
        title: '',
        description: '',
        category: 'Our Apartment',
        date: '2026-11-23',
        imageUrl: '',
        featured: true,
        isPlaceholder: false,
      });
      await load();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/cms/gallery/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#26332E]">
          Manage Community Photo Gallery
        </h1>
        <p className="text-sm text-[#52615B]">
          Upload authorized apartment, common area, and celebration photographs across 8 categories.
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="bg-white border border-[#E2DDD3] rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <div>
          <label className="block text-xs font-semibold mb-1">Photo Title *</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Main Courtyard Entrance"
            className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as GalleryCategory })}
            className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Upload Image File *</label>
          <label className="flex items-center gap-2 px-3.5 py-2 text-sm border border-dashed border-[#234D3C]/40 rounded-lg cursor-pointer hover:bg-[#F8F6F1]">
            <Upload className="w-4 h-4 text-[#234D3C]" />
            <span>{form.imageUrl ? 'Photo selected (ready to save)' : 'Choose photo from device'}</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Short caption for gallery visitors"
            className="w-full px-3.5 py-2 text-sm border border-[#D8D1C5] rounded-lg"
          />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={uploading || !form.imageUrl}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#234D3C] disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {uploading ? 'Uploading...' : 'Add to Gallery'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((item) => (
          <div
            key={item.photoId}
            className="bg-white border border-[#E2DDD3] rounded-xl overflow-hidden flex flex-col justify-between"
          >
            <div>
              <img
                src={item.imageUrl}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="p-4">
                <div className="text-xs font-semibold text-[#234D3C]">{item.category}</div>
                <div className="font-display font-bold text-sm text-[#26332E] mt-0.5">
                  {item.title}
                </div>
              </div>
            </div>
            <div className="px-4 pb-3 flex justify-end">
              <button
                type="button"
                onClick={() => handleDelete(item.photoId)}
                className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 4. ANNOUNCEMENTS, EVENTS & COMPLAINT MANAGEMENT
// ============================================================================
export const NoticesEventsComplaintsView: React.FC<{
  initialSection?: 'notices' | 'events' | 'complaints';
}> = ({ initialSection = 'notices' }) => {
  const [section, setSection] = useState<'notices' | 'events' | 'complaints'>(initialSection);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const [annForm, setAnnForm] = useState({
    title: '',
    category: 'Common area maintenance',
    priority: 'General' as AnnouncementPriority,
    audience: 'Public' as 'Public' | 'Residents Only',
    summary: '',
    body: '',
    expiryDate: '2027-03-31',
  });

  const [evtForm, setEvtForm] = useState({
    title: '',
    date: '2026-12-25',
    time: '5:00 PM',
    location: 'Central Courtyard',
    description: '',
    status: 'Upcoming' as 'Upcoming' | 'Completed',
  });

  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null);
  const [cmpUpdate, setCmpUpdate] = useState({
    status: 'In Progress' as ComplaintStatus,
    assignedTo: '',
    resolutionNotes: '',
  });

  const loadAll = async () => {
    const [aRes, eRes, cRes] = await Promise.all([
      apiFetch<{ announcements: Announcement[] }>('/api/announcements'),
      apiFetch<{ events: CommunityEvent[] }>('/api/cms/events'),
      apiFetch<{ complaints: Complaint[] }>('/api/complaints'),
    ]);
    setAnnouncements(aRes.announcements);
    setEvents(eRes.events);
    setComplaints(cRes.complaints);
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const publishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/cms/announcements', {
      method: 'POST',
      body: JSON.stringify(annForm),
    });
    setAnnForm({
      title: '',
      category: 'Common area maintenance',
      priority: 'General',
      audience: 'Public',
      summary: '',
      body: '',
      expiryDate: '2027-03-31',
    });
    await loadAll();
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/cms/events', {
      method: 'POST',
      body: JSON.stringify(evtForm),
    });
    setEvtForm({
      title: '',
      date: '2026-12-25',
      time: '5:00 PM',
      location: 'Central Courtyard',
      description: '',
      status: 'Upcoming',
    });
    await loadAll();
  };

  const saveComplaintUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingComplaint) return;
    await apiFetch(`/api/complaints/${editingComplaint.complaintId}`, {
      method: 'PUT',
      body: JSON.stringify(cmpUpdate),
    });
    setEditingComplaint(null);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#26332E]">
            Announcements, Events &amp; Resident Complaints
          </h1>
          <p className="text-sm text-[#52615B]">
            Publish circulars, organize community gatherings, and track resident maintenance requests.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EDE9E0] rounded-lg self-start">
          {(
            [
              ['notices', 'Announcements'],
              ['events', 'Events'],
              ['complaints', 'Complaints'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                section === id ? 'bg-white text-[#234D3C] shadow-xs' : 'text-[#52615B]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {section === 'notices' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={publishAnnouncement}
            className="lg:col-span-5 bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-3.5 self-start"
          >
            <h2 className="font-display font-bold text-lg">Publish Announcement</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Title *</label>
              <input
                type="text"
                required
                value={annForm.title}
                onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Priority</label>
                <select
                  value={annForm.priority}
                  onChange={(e) =>
                    setAnnForm({ ...annForm, priority: e.target.value as AnnouncementPriority })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                >
                  <option value="General">General</option>
                  <option value="Important">Important</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Audience</label>
                <select
                  value={annForm.audience}
                  onChange={(e) =>
                    setAnnForm({
                      ...annForm,
                      audience: e.target.value as 'Public' | 'Residents Only',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                >
                  <option value="Public">Public Website</option>
                  <option value="Residents Only">Residents Only</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Summary *</label>
              <input
                type="text"
                required
                value={annForm.summary}
                onChange={(e) => setAnnForm({ ...annForm, summary: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Full Circular Text</label>
              <textarea
                rows={3}
                value={annForm.body}
                onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
            >
              Publish Circular
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {announcements.map((a) => (
              <div
                key={a.announcementId}
                className="bg-white border border-[#E2DDD3] rounded-xl p-5 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="text-xs font-semibold text-[#234D3C]">
                    {a.priority} · {a.audience} · {a.publishDate}
                  </div>
                  <h3 className="font-display font-bold text-base text-[#26332E] mt-0.5">
                    {a.title}
                  </h3>
                  <p className="text-sm text-[#52615B] mt-1">{a.summary}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/cms/announcements/${a.announcementId}`, {
                      method: 'DELETE',
                    });
                    await loadAll();
                  }}
                  className="text-xs font-semibold text-red-700 hover:underline cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'events' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={createEvent}
            className="lg:col-span-5 bg-white border border-[#E2DDD3] rounded-xl p-6 space-y-3.5 self-start"
          >
            <h2 className="font-display font-bold text-lg">Create Community Event</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Event Title *</label>
              <input
                type="text"
                required
                value={evtForm.title}
                onChange={(e) => setEvtForm({ ...evtForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={evtForm.date}
                  onChange={(e) => setEvtForm({ ...evtForm, date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Status</label>
                <select
                  value={evtForm.status}
                  onChange={(e) =>
                    setEvtForm({
                      ...evtForm,
                      status: e.target.value as 'Upcoming' | 'Completed',
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                >
                  <option value="Upcoming">Upcoming</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Location *</label>
              <input
                type="text"
                required
                value={evtForm.location}
                onChange={(e) => setEvtForm({ ...evtForm, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Description</label>
              <textarea
                rows={3}
                value={evtForm.description}
                onChange={(e) => setEvtForm({ ...evtForm, description: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
            >
              Add Event
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {events.map((evt) => (
              <div
                key={evt.eventId}
                className="bg-white border border-[#E2DDD3] rounded-xl p-5 flex items-start justify-between gap-4"
              >
                <div>
                  <div className="text-xs font-semibold text-[#234D3C]">
                    {evt.status} · {evt.date} · {evt.location}
                  </div>
                  <h3 className="font-display font-bold text-base text-[#26332E] mt-0.5">
                    {evt.title}
                  </h3>
                  <p className="text-sm text-[#52615B] mt-1">{evt.description}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/cms/events/${evt.eventId}`, { method: 'DELETE' });
                    await loadAll();
                  }}
                  className="text-xs font-semibold text-red-700 hover:underline cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'complaints' && (
        <div className="space-y-4">
          {complaints.map((c) => (
            <div
              key={c.complaintId}
              className="bg-white border border-[#E2DDD3] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="text-xs font-semibold text-[#234D3C]">
                  {c.complaintId} · Flat {c.flatNumber} ({c.residentName}) · {c.category} ·{' '}
                  {c.priority}
                </div>
                <h3 className="font-display font-bold text-base text-[#26332E]">{c.subject}</h3>
                <p className="text-sm text-[#52615B]">{c.description}</p>
                <div className="text-xs text-[#64736D] flex flex-wrap items-center gap-2">
                  <span>
                    Status: <strong>{c.status}</strong> · Assigned: {c.assignedTo}
                  </span>
                  {c.resolutionNotes && <span>· Note: {c.resolutionNotes}</span>}
                  {c.photoFileId && (
                    <a
                      href={buildAuthenticatedAssetUrl(`/api/complaints/${c.complaintId}/photo`)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#234D3C] font-semibold underline"
                    >
                      View Photo
                    </a>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingComplaint(c);
                  setCmpUpdate({
                    status: c.status,
                    assignedTo: c.assignedTo,
                    resolutionNotes: c.resolutionNotes,
                  });
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#234D3C] rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Update Ticket
              </button>
            </div>
          ))}
        </div>
      )}

      {editingComplaint && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E2DDD3] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Update {editingComplaint.complaintId}
              </h3>
              <button
                type="button"
                onClick={() => setEditingComplaint(null)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={saveComplaintUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Status</label>
                <select
                  value={cmpUpdate.status}
                  onChange={(e) =>
                    setCmpUpdate({ ...cmpUpdate, status: e.target.value as ComplaintStatus })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg bg-white"
                >
                  <option value="Submitted">Submitted</option>
                  <option value="Acknowledged">Acknowledged</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                  <option value="Reopened">Reopened</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Assigned Staff / Vendor</label>
                <input
                  type="text"
                  value={cmpUpdate.assignedTo}
                  onChange={(e) => setCmpUpdate({ ...cmpUpdate, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Resolution Notes</label>
                <textarea
                  rows={3}
                  value={cmpUpdate.resolutionNotes}
                  onChange={(e) =>
                    setCmpUpdate({ ...cmpUpdate, resolutionNotes: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-[#D8D1C5] rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingComplaint(null)}
                  className="px-4 py-2 text-sm border border-[#D8D1C5] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold text-white bg-[#234D3C] rounded-lg cursor-pointer"
                >
                  Save Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
