import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import TipTapEditor from './TipTapEditor';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'tutors', label: 'Tutors' },
  { value: 'admins', label: 'Admins' },
  { value: 'franchisees', label: 'Franchisees' },
];

export default function SopEditorPage() {
  const { sopId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const isEditMode = !!sopId;

  // Form state
  const [title, setTitle] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [owner, setOwner] = useState('');
  const [version, setVersion] = useState('1.0');
  const [required, setRequired] = useState(false);
  const [audience, setAudience] = useState(['all']);
  const [overview, setOverview] = useState('');
  const [prerequisites, setPrerequisites] = useState('');
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [relatedLinks, setRelatedLinks] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [publishDate, setPublishDate] = useState(null);

  // UI state
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [showPrerequisites, setShowPrerequisites] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Load collections for category dropdown
  useEffect(() => {
    fetch('/api/knowledge/collections', {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => setCollections(data.collections || []))
      .catch(() => {});
  }, []);

  // Load existing SOP in edit mode
  useEffect(() => {
    if (!isEditMode) {
      // Set default owner from current user
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.name) setOwner(user.name);
        else if (user.first_name) setOwner(`${user.first_name} ${user.last_name || ''}`.trim());
      } catch {}
      return;
    }

    fetch(`/api/knowledge/articles/${sopId}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        const a = data.article;
        if (!a) return;
        setTitle(a.title || '');
        setCollectionId(a.collection_id || '');
        setOwner(a.sop_owner || '');
        setVersion(a.sop_version || '1.0');
        setRequired(a.sop_required || false);
        setAudience(a.sop_audience?.length ? a.sop_audience : ['all']);
        setIsPublished(a.is_published || false);
        setPublishDate(a.publish_date || null);

        // Parse structured content
        const content = typeof a.content === 'string' ? JSON.parse(a.content) : a.content;
        if (content?.overview) {
          // Structured format
          setOverview(JSON.stringify(content.overview));
          if (content.prerequisites) {
            setPrerequisites(JSON.stringify(content.prerequisites));
            setShowPrerequisites(true);
          }
          setSteps(JSON.stringify(content.steps || ''));
          if (content.notes) {
            setNotes(JSON.stringify(content.notes));
            setShowNotes(true);
          }
          setRelatedLinks(content.related_links || []);
        } else if (content?.type === 'doc') {
          // Legacy flat format — put it all in steps
          setSteps(JSON.stringify(content));
        }
      })
      .catch((err) => {
        console.error('Error loading SOP:', err);
        addToast('Failed to load SOP', 'error');
      })
      .finally(() => setLoading(false));
  }, [sopId, isEditMode]);

  const buildPayload = (publish) => {
    // Parse TipTap JSON strings back to objects
    const parseSection = (str) => {
      if (!str) return null;
      try { return JSON.parse(str); } catch { return null; }
    };

    const overviewJson = parseSection(overview);

    // Auto-generate summary from overview plain text
    let summary = '';
    if (overviewJson?.content) {
      summary = overviewJson.content
        .filter((n) => n.type === 'paragraph')
        .flatMap((n) => n.content?.map((c) => c.text) || [])
        .join(' ')
        .slice(0, 200);
    }

    return {
      title,
      collection_id: collectionId || null,
      article_type: 'sop',
      summary,
      content: {
        overview: overviewJson,
        prerequisites: parseSection(prerequisites),
        steps: parseSection(steps),
        notes: parseSection(notes),
        related_links: relatedLinks.filter((l) => l.label || l.url),
      },
      is_published: publish,
      sop_owner: owner,
      sop_version: version,
      sop_required: required,
      sop_audience: audience,
    };
  };

  const handleSave = async (publish) => {
    if (!title.trim()) {
      addToast('Title is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const url = isEditMode
        ? `/api/knowledge/articles/${sopId}`
        : '/api/knowledge/articles';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildPayload(publish)),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }

      const data = await res.json();
      const savedId = data.article?.id || sopId;
      addToast(publish ? 'SOP published' : 'Draft saved', 'success');
      navigate(`/sop/${savedId}`);
    } catch (err) {
      addToast(err.message || 'Failed to save SOP', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAudience = (value) => {
    if (value === 'all') {
      setAudience(['all']);
      return;
    }
    setAudience((prev) => {
      const without = prev.filter((v) => v !== 'all' && v !== value);
      if (prev.includes(value)) {
        return without.length ? without : ['all'];
      }
      return [...without, value];
    });
  };

  const addLink = () => setRelatedLinks((prev) => [...prev, { label: '', url: '' }]);
  const updateLink = (index, field, value) =>
    setRelatedLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  const removeLink = (index) => setRelatedLinks((prev) => prev.filter((_, i) => i !== index));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-neutral-200 rounded w-1/4" />
          <div className="h-10 bg-neutral-200 rounded w-1/2" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-48 bg-neutral-200 rounded-xl" />
              <div className="h-64 bg-neutral-200 rounded-xl" />
            </div>
            <div className="h-64 bg-neutral-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Link to="/sop" className="flex items-center gap-1 hover:text-brand-purple font-medium transition-colors">
            <ArrowLeftIcon className="h-4 w-4" />
            SOP Library
          </Link>
          <span className="text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">
            {isEditMode ? `Edit: ${title || 'Untitled'}` : 'Create New SOP'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-[10px] hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple/90 rounded-[10px] shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Publishing...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="SOP Title"
              className="w-full text-2xl font-semibold text-neutral-900 placeholder:text-neutral-300 border-0 border-b-2 border-neutral-200 focus:border-brand-purple focus:ring-0 focus:outline-none pb-3 bg-transparent transition-colors"
            />
          </div>

          {/* Overview */}
          <EditorSection label="Overview" required>
            <TipTapEditor
              content={overview}
              onChange={setOverview}
              placeholder="Brief description of what this SOP covers..."
            />
          </EditorSection>

          {/* Prerequisites (collapsible) */}
          <CollapsibleSection
            label="Prerequisites"
            subtitle="Optional"
            isOpen={showPrerequisites}
            onToggle={() => setShowPrerequisites(!showPrerequisites)}
          >
            <TipTapEditor
              content={prerequisites}
              onChange={setPrerequisites}
              placeholder="What's needed before starting this procedure..."
            />
          </CollapsibleSection>

          {/* Steps */}
          <EditorSection label="Steps" required>
            <TipTapEditor
              content={steps}
              onChange={setSteps}
              placeholder="Step-by-step procedure..."
            />
          </EditorSection>

          {/* Notes (collapsible) */}
          <CollapsibleSection
            label="Notes & Tips"
            subtitle="Optional"
            isOpen={showNotes}
            onToggle={() => setShowNotes(!showNotes)}
          >
            <TipTapEditor
              content={notes}
              onChange={setNotes}
              placeholder="Gotchas, edge cases, helpful tips..."
            />
          </CollapsibleSection>

          {/* Related Links */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-neutral-400" />
                <h3 className="text-sm font-semibold text-neutral-900">Related Links</h3>
                <span className="text-xs text-neutral-400">Optional</span>
              </div>
              <button
                onClick={addLink}
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
              >
                <PlusIcon className="h-4 w-4" />
                Add Link
              </button>
            </div>
            {relatedLinks.length === 0 ? (
              <p className="text-sm text-neutral-400">No related links added.</p>
            ) : (
              <div className="space-y-3">
                {relatedLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => updateLink(i, 'label', e.target.value)}
                      placeholder="Label"
                      className="flex-1 px-3 py-2 text-sm border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none transition-colors"
                    />
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => updateLink(i, 'url', e.target.value)}
                      placeholder="https://..."
                      className="flex-[2] px-3 py-2 text-sm border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={() => removeLink(i)}
                      type="button"
                      className="p-2 text-neutral-400 hover:text-[#DA2E72] hover:bg-[#FCE8F0] rounded-lg transition-colors"
                      aria-label="Remove link"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — metadata sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5 lg:sticky lg:top-24">
            {/* Status */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${isPublished ? 'bg-brand-green' : 'bg-brand-yellow'}`} />
                <span className="text-xs font-medium text-neutral-700">
                  {isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              {publishDate && (
                <p className="text-xs text-neutral-400 ml-4">
                  {new Date(publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>

            <hr className="border-neutral-100" />

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Category
              </label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none transition-colors"
              >
                <option value="">Select category...</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>

            {/* Owner */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Owner
              </label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. Admin User"
                className="w-full px-3 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none placeholder:text-neutral-400 transition-colors"
              />
            </div>

            {/* Version */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                Version
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
                className="w-full px-3 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-[10px] hover:border-neutral-400 focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/20 focus:outline-none placeholder:text-neutral-400 transition-colors"
              />
            </div>

            {/* Required toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-700">Required</label>
              <button
                type="button"
                onClick={() => setRequired(!required)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  required ? 'bg-brand-purple' : 'bg-neutral-300'
                }`}
                role="switch"
                aria-checked={required}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    required ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Audience */}
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-2">
                Audience
              </label>
              <div className="space-y-2">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audience.includes(opt.value)}
                      onChange={() => toggleAudience(opt.value)}
                      className="h-4 w-4 rounded border-neutral-300 text-brand-purple focus:ring-brand-purple/20"
                    />
                    <span className="text-sm text-neutral-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function EditorSection({ label, required, children }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">
        {label}
        {required && <span className="text-[#DA2E72] ml-1">*</span>}
      </h3>
      {children}
    </div>
  );
}

function CollapsibleSection({ label, subtitle, isOpen, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
          {subtitle && <span className="text-xs text-neutral-400">{subtitle}</span>}
        </div>
        {isOpen ? (
          <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-neutral-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-6">
          {children}
        </div>
      )}
    </div>
  );
}
