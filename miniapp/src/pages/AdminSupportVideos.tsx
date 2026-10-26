import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Edit3, Upload, CheckCircle, XCircle, Video, Loader2, Eye, EyeOff, Play, X, ChevronUp, ChevronDown, Sparkles } from 'lucide-react';
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
  show_on_home?: boolean;
  popup_max_views?: number;
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

const categoryLabel = (id: string) => CATEGORIES.find(c => c.id === id)?.label ?? id;
const categoryColor = (id: string) => CATEGORIES.find(c => c.id === id)?.color ?? 'bg-slate-100 text-slate-700';

export default function AdminSupportVideos() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState<SupportVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // default: All categories

  // Upload / form state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupportVideo | null>(null);
  const [form, setForm] = useState({
    category: 'how_to_use',
    title: '',
    description: '',
    show_on_home: true,
    popup_max_views: 1,
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Full-screen video preview modal with vertical swipe navigation
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const lastWheelTime = useRef<number>(0);

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
    setForm({
      category: activeTab === 'all' ? 'how_to_use' : activeTab,
      title: '',
      description: '',
      show_on_home: true,
      popup_max_views: 1,
    });
    setFile(null);
    setUploadProgress(0);
    setShowForm(true);
  };

  const openEdit = (v: SupportVideo) => {
    setEditing(v);
    setForm({
      category: v.category,
      title: v.title,
      description: v.description || '',
      show_on_home: v.show_on_home !== false,
      popup_max_views: typeof v.popup_max_views === 'number' ? v.popup_max_views : 1,
    });
    setFile(null);
    setUploadProgress(0);
    setShowForm(true);
  };

  const filtered = activeTab === 'all' ? videos : videos.filter(v => v.category === activeTab);

  const openPreview = (index: number) => {
    setPreviewIndex(index);
  };

  const closePreview = () => {
    if (previewVideoRef.current) previewVideoRef.current.pause();
    setPreviewIndex(null);
  };

  const goToNextPreview = () => {
    if (filtered.length <= 1) return;
    setPreviewIndex(prev => prev !== null ? (prev + 1) % filtered.length : 0);
  };

  const goToPrevPreview = () => {
    if (filtered.length <= 1) return;
    setPreviewIndex(prev => prev !== null ? (prev - 1 + filtered.length) % filtered.length : 0);
  };

  // Touch swipe handling for admin player
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchEndY.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null || touchEndY.current === null) return;
    const diff = touchStartY.current - touchEndY.current;
    if (diff > 45) {
      goToNextPreview();
    } else if (diff < -45) {
      goToPrevPreview();
    }
    touchStartY.current = null;
    touchEndY.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 450) return;
    if (e.deltaY > 30) {
      lastWheelTime.current = now;
      goToNextPreview();
    } else if (e.deltaY < -30) {
      lastWheelTime.current = now;
      goToPrevPreview();
    }
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

      const payload = {
        ...form,
        video_url,
        video_key,
        show_on_home: form.show_on_home,
        popup_max_views: Math.max(1, parseInt(String(form.popup_max_views), 10) || 1),
      };
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

  const getCategoryCount = (catId: string) => {
    if (catId === 'all') return videos.length;
    return videos.filter(v => v.category === catId).length;
  };

  const currentPreviewVideo = previewIndex !== null ? filtered[previewIndex] : null;

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

      {/* Category Tabs: All + 6 Categories */}
      <div className="px-4 pt-3 pb-2 flex space-x-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-bold text-xs border transition-all ${
            activeTab === 'all'
              ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
              : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50'
          }`}
        >
          🗂 All ({getCategoryCount('all')})
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full font-bold text-xs border transition-all ${
              activeTab === cat.id
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                : 'bg-white text-slate-600 border-gray-200 hover:bg-slate-50'
            }`}
          >
            {cat.label} ({getCategoryCount(cat.id)})
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
          <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200 p-6">
            <Video size={44} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-bold text-sm">No videos found</p>
            <p className="text-slate-400 text-xs mt-1">Tap Add to upload a video for this section</p>
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center space-x-1.5 bg-violet-600 text-white px-4 py-2 rounded-xl text-xs font-bold active:scale-95"
            >
              <Plus size={14} />
              <span>Add Video</span>
            </button>
          </div>
        ) : (
          filtered.map((v, idx) => (
            <div key={v.id} className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${!v.is_active ? 'opacity-70' : ''}`}>
              {/* Clickable Video Thumbnail / Player preview */}
              <div
                onClick={() => openPreview(idx)}
                className="relative w-full bg-slate-900 cursor-pointer group"
                style={{ paddingTop: '52%' }}
              >
                <video
                  src={v.video_url}
                  preload="metadata"
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                />
                
                {/* Dark gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-center justify-center">
                  <div className="w-13 h-13 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg group-hover:scale-110 active:scale-95 transition-transform p-3">
                    <Play size={24} fill="currentColor" className="ml-0.5" />
                  </div>
                </div>

                {/* Badge tags */}
                <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm bg-white/95 ${categoryColor(v.category)}`}>
                    {categoryLabel(v.category)}
                  </span>
                  {v.show_on_home && (
                    <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                      ✨ Home Popup ({v.popup_max_views ?? 1}x)
                    </span>
                  )}
                </div>

                <div className="absolute top-2.5 right-2.5">
                  {!v.is_active ? (
                    <span className="bg-rose-500/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                      Hidden
                    </span>
                  ) : (
                    <span className="bg-emerald-500/90 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                      Active
                    </span>
                  )}
                </div>

                {/* Click to open label */}
                <div className="absolute bottom-2 right-2.5 bg-black/70 backdrop-blur-sm text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1">
                  <Play size={10} fill="currentColor" />
                  <span>Click to play</span>
                </div>
              </div>

              {/* Title & Description */}
              <div className="p-3.5">
                <h3 
                  onClick={() => openPreview(idx)}
                  className="font-black text-slate-800 text-sm leading-snug cursor-pointer hover:text-violet-600 transition-colors"
                >
                  {v.title}
                </h3>
                {v.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{v.description}</p>
                )}
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center border-t border-gray-100 divide-x divide-gray-100 bg-slate-50/50">
                <button
                  onClick={() => openPreview(idx)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-50 active:bg-violet-100 transition-colors"
                >
                  <Play size={13} fill="currentColor" />
                  <span>Open Video</span>
                </button>
                <button
                  onClick={() => handleToggle(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  {v.is_active ? <Eye size={13} className="text-emerald-500" /> : <EyeOff size={13} className="text-slate-400" />}
                  <span>{v.is_active ? 'Active' : 'Hidden'}</span>
                </button>
                <button
                  onClick={() => openEdit(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
                >
                  <Edit3 size={13} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FULL-SCREEN VIDEO PLAYER MODAL WITH SWIPE UP/DOWN NAVIGATION */}
      {currentPreviewVideo && (
        <div 
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
          className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none touch-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-white/10 z-20">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center space-x-2 mb-0.5">
                <span className={`inline-block text-[9px] font-black px-2 py-0.5 rounded-full ${categoryColor(currentPreviewVideo.category)}`}>
                  {categoryLabel(currentPreviewVideo.category)}
                </span>
                <span className="text-[10px] font-bold text-white/70 bg-black/40 px-2 py-0.5 rounded-full">
                  {(previewIndex ?? 0) + 1} of {filtered.length}
                </span>
              </div>
              <p className="font-bold text-white text-sm truncate">{currentPreviewVideo.title}</p>
            </div>
            <button
              onClick={closePreview}
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 text-white flex items-center justify-center transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Video Player Area */}
          <div className="flex-1 relative flex items-center justify-center bg-black p-2 overflow-hidden">
            <video
              key={currentPreviewVideo.id}
              ref={previewVideoRef}
              src={currentPreviewVideo.video_url}
              controls
              autoPlay
              playsInline
              className="w-full max-h-full rounded-xl object-contain"
              style={{ maxHeight: 'calc(100vh - 150px)' }}
            >
              Your browser does not support video playback.
            </video>

            {/* Floating Navigation Controls on the Right Edge (Swipe Up/Down) */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center space-y-3 z-30">
              <button
                onClick={(e) => { e.stopPropagation(); goToPrevPreview(); }}
                className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                title="Previous Video (Swipe Down)"
              >
                <ChevronUp size={20} />
              </button>

              <div className="px-2 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[10px] font-black text-white/90">
                {(previewIndex ?? 0) + 1}/{filtered.length}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); goToNextPreview(); }}
                className="w-10 h-10 rounded-full bg-violet-600/90 backdrop-blur-md border border-violet-400/40 text-white flex items-center justify-center active:scale-90 transition-transform shadow-lg animate-pulse"
                title="Next Video (Swipe Up)"
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>

          {/* Bottom info footer & helper */}
          <div className="p-3.5 bg-slate-900/90 border-t border-white/10 z-20 space-y-1">
            {currentPreviewVideo.description && (
              <p className="text-xs text-white/80 font-medium line-clamp-2">{currentPreviewVideo.description}</p>
            )}
            <div className="text-[10px] text-white/50 font-bold flex items-center space-x-1">
              <span>↕</span>
              <span>Swipe up or down or use arrows to view next/prev video</span>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD / EDIT FORM MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm">
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h2 className="font-black text-slate-800 text-base">{editing ? 'Edit Video' : 'Add New Video'}</h2>
              <button 
                onClick={() => setShowForm(false)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Category Selection (6 categories) */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Category *</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                    className={`py-2.5 px-3 rounded-xl border font-bold text-xs transition-all text-left truncate ${
                      form.category === cat.id
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-white text-slate-700 border-gray-200 hover:bg-slate-50'
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
                placeholder="Short description of what the video explains…"
                rows={2}
                className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            {/* Home Popup Display Settings */}
            <div className="p-3.5 bg-gradient-to-r from-violet-50 to-indigo-50/70 rounded-2xl border border-violet-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
                    <Sparkles size={13} className="text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Display on Home Screen as Popup</p>
                    <p className="text-[10px] text-slate-500 font-medium">Auto-play guide popup when user opens the app</p>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, show_on_home: !f.show_on_home }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    form.show_on_home ? 'bg-violet-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.show_on_home ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {form.show_on_home && (
                <div className="pt-2 border-t border-violet-200/60 flex items-center justify-between">
                  <div className="pr-2">
                    <label className="text-xs font-bold text-slate-700">Display Count on Screen (Per User)</label>
                    <p className="text-[9.5px] text-slate-500">Default is 1 (shows on first open). Set 2 or more to repeat.</p>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, popup_max_views: Math.max(1, (Number(f.popup_max_views) || 1) - 1) }))}
                      className="w-7 h-7 rounded-lg bg-white border border-violet-200 text-violet-700 font-black text-sm flex items-center justify-center active:scale-95 shadow-xs"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.popup_max_views}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setForm(f => ({ ...f, popup_max_views: val }));
                      }}
                      className="w-12 h-7 text-center font-black text-xs text-violet-900 bg-white border border-violet-200 rounded-lg outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, popup_max_views: (Number(f.popup_max_views) || 1) + 1 }))}
                      className="w-7 h-7 rounded-lg bg-white border border-violet-200 text-violet-700 font-black text-sm flex items-center justify-center active:scale-95 shadow-xs"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Video File Picker */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Video File {editing ? <span className="font-normal text-slate-400">(choose new file to replace)</span> : '*'}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center space-x-2 border-2 border-dashed border-violet-300 bg-violet-50/70 hover:bg-violet-100/70 py-4 rounded-xl transition-colors"
              >
                <Upload size={20} className="text-violet-600" />
                <span className="text-sm font-bold text-violet-700">
                  {file ? file.name : 'Tap to select video file'}
                </span>
              </button>
              {file && (
                <p className="text-xs text-slate-500 mt-1 text-center font-medium">
                  Selected: {(file.size / 1024 / 1024).toFixed(1)} MB — {file.type || 'video'}
                </p>
              )}

              {/* Video Preview: Newly selected file */}
              {file && (
                <div className="mt-3 rounded-xl overflow-hidden border border-violet-200 bg-black">
                  <p className="text-[11px] font-bold text-white/80 bg-slate-900 px-3 py-1">Video Preview (Selected File):</p>
                  <video
                    src={URL.createObjectURL(file)}
                    controls
                    playsInline
                    className="w-full max-h-48 object-contain bg-black"
                  />
                </div>
              )}

              {/* Video Preview: Existing video when editing */}
              {!file && editing?.video_url && (
                <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 bg-black">
                  <p className="text-[11px] font-bold text-white/80 bg-slate-900 px-3 py-1">Current Saved Video:</p>
                  <video
                    src={editing.video_url}
                    controls
                    playsInline
                    className="w-full max-h-48 object-contain bg-black"
                  />
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="mt-2 space-y-1">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-center text-violet-600 font-bold">{uploadProgress}% uploaded to R2…</p>
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-black text-sm flex items-center justify-center space-x-2 active:scale-95 transition-all shadow-md shadow-violet-200"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              <span>{saving ? (uploading ? 'Uploading Video…' : 'Saving…') : editing ? 'Update Video' : 'Save & Publish Video'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center space-x-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-bold ${toast.type === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {toast.type === 'ok' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
