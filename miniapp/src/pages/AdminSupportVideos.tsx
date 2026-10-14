import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Edit3, Upload, CheckCircle, XCircle, Video, Loader2, Eye, EyeOff, Play } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface SupportVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  video_url: string;
  video_key: string;
  thumbnail_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const CATEGORIES = [
  { id: 'how_to_use',   label: '📱 How to Use',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'how_to_play',  label: '🎮 How to Play',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'deposit',      label: '💰 Deposit',          color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'withdraw',     label: '💸 Withdraw',         color: 'bg-rose-100 text-rose-700 border-rose-200' },
  { id: 'invite',       label: '🤝 How to Invite',   color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'transfer',     label: '🔄 How to Transfer', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
];

// All tab + category tabs
const ALL_TABS = [{ id: 'all', label: '🗂 All', color: 'bg-slate-100 text-slate-700 border-slate-200' }, ...CATEGORIES];

const categoryLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label ?? id;
const categoryColor = (id: string) => CATEGORIES.find(c => c.id === id)?.color ?? 'bg-slate-100 text-slate-700';

export default function AdminSupportVideos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // default: All

  // Upload / form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupportVideo | null>(null);
  const [form, setForm] = useState({ category: 'how_to_use', title: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [previewVideo, setPreviewVideo] = useState<SupportVideo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/support-videos`, {
        headers: { 'x-telegram-init-data': initData },
      });
      const data = await res.json();
      setVideos(data.videos || []);
    } catch {
      showToast('Failed to load videos', 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVideos(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ category: activeTab === 'all' ? 'how_to_use' : activeTab, title: '', description: '' });
    setFile(null);
    setUploadProgress(0);
    setShowForm(true);
  };

  const openEdit = (v: SupportVideo) => {
    setEditing(v);
    setForm({ category: v.category, title: v.title, description: v.description || '' });
    setFile(null);
    setUploadProgress(0);
    setShowForm(true);
  };

  const uploadVideoFile = async (f: File): Promise<{ video_url: string; video_key: string }> => {
    const presignRes = await fetch(`${API_URL}/upload/presign`, {
      method: 'POST',
      headers: { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: f.name, contentType: f.type }),
    });
    if (!presignRes.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, publicUrl, key } = await presignRes.json();

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', f.type);
      xhr.send(f);
    });

    return { video_url: publicUrl, video_key: key };
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'err'); return; }
    if (!editing && !file) { showToast('Please select a video file', 'err'); return; }
    setSaving(true);
    try {
      let video_url = editing?.video_url;
      let video_key = editing?.video_key;

      if (file) {
        setUploading(true);
        const result = await uploadVideoFile(file);
        video_url = result.video_url;
        video_key = result.video_key;
        setUploading(false);
      }

      const payload = { ...form, video_url, video_key };
      const url = editing
        ? `${API_URL}/admin/support-videos/${editing.id}`
        : `${API_URL}/admin/support-videos`;
      const method = editing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');

      showToast(editing ? 'Video updated!' : 'Video added!');
      setShowForm(false);
      fetchVideos();
    } catch (e: any) {
      showToast(e.message || 'Save failed', 'err');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handleDelete = async (v: SupportVideo) => {
    if (!confirm(`Delete "${v.title}"?`)) return;
    try {
      await fetch(`${API_URL}/admin/support-videos/${v.id}`, {
        method: 'DELETE',
        headers: { 'x-telegram-init-data': initData },
      });
      showToast('Deleted');
      setVideos(prev => prev.filter(x => x.id !== v.id));
    } catch {
      showToast('Delete failed', 'err');
    }
  };

  const handleToggle = async (v: SupportVideo) => {
    try {
      await fetch(`${API_URL}/admin/support-videos/${v.id}`, {
        method: 'PUT',
        headers: { 'x-telegram-init-data': initData, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !v.is_active }),
      });
      setVideos(prev => prev.map(x => x.id === v.id ? { ...x, is_active: !x.is_active } : x));
    } catch {
      showToast('Update failed', 'err');
    }
  };

  const filtered = activeTab === 'all' ? videos : videos.filter(v => v.category === activeTab);

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center space-x-3 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 active:scale-90 transition-all">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="font-black text-slate-800 text-base">Support Videos</h1>
          <p className="text-xs text-slate-500 font-medium">{videos.length} video{videos.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center space-x-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 rounded-xl font-bold text-sm active:scale-95 transition-all shadow-sm"
        >
          <Plus size={16} />
          <span>Add</span>
        </button>
      </div>

      {/* Category Tabs — All + each category */}
      <div className="px-4 pt-4 pb-2 flex space-x-2 overflow-x-auto no-scrollbar">
        {ALL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-bold text-xs border transition-all ${
              activeTab === tab.id
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Video List */}
      <div className="px-4 space-y-3 mt-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-violet-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Video size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-semibold text-sm">No videos yet</p>
            <p className="text-slate-400 text-xs mt-1">Tap Add to upload the first video</p>
          </div>
        ) : (
          filtered.map(v => (
            <div key={v.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${!v.is_active ? 'opacity-60' : ''}`}>
              {/* Inline video player */}
              <div className="relative w-full bg-black" style={{ paddingTop: '56.25%' }}>
                <video
                  src={v.video_url}
                  controls
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                {!v.is_active && (
                  <div className="absolute top-2 right-2 bg-slate-900/70 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                    Hidden
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${categoryColor(v.category)}`}>
                    {categoryLabel(v.category)}
                  </span>
                </div>
                <p className="font-bold text-slate-800 text-sm leading-tight">{v.title}</p>
                {v.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{v.description}</p>}
              </div>

              {/* Actions */}
              <div className="flex items-center border-t border-gray-100 divide-x divide-gray-100">
                <button
                  onClick={() => handleToggle(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                >
                  {v.is_active ? <Eye size={14} className="text-emerald-500" /> : <EyeOff size={14} className="text-slate-400" />}
                  <span>{v.is_active ? 'Active' : 'Hidden'}</span>
                </button>
                <button
                  onClick={() => openEdit(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
                >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm">
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-800 text-base">{editing ? 'Edit Video' : 'Add Video'}</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                    className={`py-2.5 rounded-xl border font-bold text-xs transition-all ${
                      form.category === cat.id
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. How to deposit with Telebirr"
                className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Description <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Short description…"
                rows={2}
                className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            {/* Video File */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Video File {editing ? <span className="font-normal text-slate-400">(leave empty to keep existing)</span> : '*'}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center space-x-2 border-2 border-dashed border-violet-300 bg-violet-50 hover:bg-violet-100 py-5 rounded-xl transition-colors"
              >
                <Upload size={20} className="text-violet-500" />
                <span className="text-sm font-bold text-violet-700">
                  {file ? file.name : 'Tap to select video'}
                </span>
              </button>
              {file && (
                <p className="text-xs text-slate-500 mt-1 text-center">
                  {(file.size / 1024 / 1024).toFixed(1)} MB — {file.type}
                </p>
              )}

              {/* Preview selected file before upload */}
              {file && (
                <div className="mt-3 rounded-xl overflow-hidden border border-violet-200 bg-black">
                  <video
                    src={URL.createObjectURL(file)}
                    controls
                    playsInline
                    className="w-full max-h-48 object-contain"
                  />
                </div>
              )}

              {uploading && (
                <div className="mt-2 space-y-1">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-center text-violet-600 font-bold">{uploadProgress}% uploaded…</p>
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center space-x-2 active:scale-95 transition-all"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              <span>{saving ? (uploading ? 'Uploading…' : 'Saving…') : editing ? 'Update Video' : 'Save Video'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center space-x-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-bold ${toast.type === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {toast.type === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
