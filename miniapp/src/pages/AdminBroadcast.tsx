import { useState, useEffect, useRef } from 'react';
import { Send, Clock, Trash2, Plus, Image as ImageIcon, Edit2, CheckCircle, Loader2, AlertCircle, Radio, MessageSquare, X, Video, Film, AtSign } from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type SendTo = 'bot' | 'channel' | 'both';
type PostStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
type MediaType = 'image' | 'video' | null;

interface BroadcastPost {
  id: string;
  title: string;
  body: string;
  media_url: string | null;
  media_key: string | null;
  media_type: MediaType;
  send_to: SendTo;
  channel_id: string | null;
  status: PostStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  error_message: string | null;
  created_at: string;
}

const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';

const STATUS_BADGE: Record<PostStatus, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' },
  sending:   { label: 'Sending…',  cls: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  sent:      { label: 'Sent ✓',    cls: 'bg-green-100 text-green-700' },
  failed:    { label: 'Failed',    cls: 'bg-red-100 text-red-700' },
};

const SEND_TO_OPTIONS: { value: SendTo; label: string; desc: string; icon: string }[] = [
  { value: 'bot',     label: 'Bot Only',      desc: 'All players via Telegram Bot',       icon: '🤖' },
  { value: 'channel', label: 'Channel Only',  desc: 'Hdasebingo Channel (@hdasebingo)',   icon: '📢' },
  { value: 'both',    label: 'Bot + Channel', desc: 'Both all players & @hdasebingo',     icon: '📡' },
];

export default function AdminBroadcast() {
  const [posts, setPosts] = useState<BroadcastPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultChannel, setDefaultChannel] = useState('@hdasebingo');
  const [showForm, setShowForm] = useState(false);
  const [editPost, setEditPost] = useState<BroadcastPost | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendTo, setSendTo] = useState<SendTo>('both');
  const [channelId, setChannelId] = useState('@hdasebingo');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [uploadedMediaUrl, setUploadedMediaUrl] = useState<string | null>(null);
  const [uploadedMediaKey, setUploadedMediaKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/broadcast`, { headers: { 'x-telegram-init-data': initData } });
      const d = await r.json();
      setPosts(d.posts || []);
    } catch {
      setError('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const fetchDefaultChannel = async () => {
    try {
      const r = await fetch(`${API_URL}/broadcast/channel-default`, { headers: { 'x-telegram-init-data': initData } });
      const d = await r.json();
      if (d.defaultChannel) {
        setDefaultChannel(d.defaultChannel);
        setChannelId(d.defaultChannel);
      }
    } catch {}
  };

  useEffect(() => {
    fetchPosts();
    fetchDefaultChannel();
  }, []);

  // Auto-refresh every 10s if any post is 'sending'
  useEffect(() => {
    const hasLive = posts.some(p => p.status === 'sending');
    if (!hasLive) return;
    const t = setTimeout(() => fetchPosts(), 10_000);
    return () => clearTimeout(t);
  }, [posts]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setSendTo('both');
    setChannelId(defaultChannel || '@hdasebingo');
    setScheduleEnabled(false);
    setScheduledAt('');
    setMediaPreview(null);
    setMediaType(null);
    setUploadedMediaUrl(null);
    setUploadedMediaKey(null);
    setUploadProgress(0);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreateForm = () => {
    setEditPost(null);
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (post: BroadcastPost) => {
    setEditPost(post);
    setTitle(post.title || '');
    setBody(post.body);
    setSendTo(post.send_to);
    setChannelId(post.channel_id || defaultChannel || '@hdasebingo');
    setScheduleEnabled(!!post.scheduled_at);
    setScheduledAt(post.scheduled_at ? post.scheduled_at.slice(0, 16) : '');
    setMediaPreview(post.media_url || null);
    setMediaType(post.media_type || null);
    setUploadedMediaUrl(post.media_url || null);
    setUploadedMediaKey(post.media_key || null);
    setUploadProgress(0);
    setError('');
    setShowForm(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setError('Only image or video files are allowed');
      return;
    }

    if (isImage) {
      setMediaPreview(URL.createObjectURL(file));
      setMediaType('image');
    } else {
      setMediaPreview(URL.createObjectURL(file));
      setMediaType('video');
    }

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      const pr = await fetch(`${API_URL}/broadcast/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      if (!pr.ok) {
        const d = await pr.json();
        throw new Error(d.error || 'Presign failed');
      }
      const { uploadUrl, publicUrl, key } = await pr.json();

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Upload error'));
        xhr.send(file);
      });

      setUploadedMediaUrl(publicUrl);
      setUploadedMediaKey(key);
      setUploadProgress(100);
    } catch (err: any) {
      setError('Upload failed: ' + err.message);
      setMediaPreview(null);
      setMediaType(null);
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = () => {
    setMediaPreview(null);
    setMediaType(null);
    setUploadedMediaUrl(null);
    setUploadedMediaKey(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!body.trim()) { setError('Post message is required'); return; }
    if (uploading) { setError('Please wait for upload to finish'); return; }
    if (scheduleEnabled && !scheduledAt) { setError('Please pick a scheduled date/time'); return; }
    setSaving(true); setError('');
    try {
      const targetChannel = (sendTo === 'channel' || sendTo === 'both')
        ? (channelId.trim() || defaultChannel || '@hdasebingo')
        : null;

      const payload = {
        title,
        body,
        media_url: uploadedMediaUrl,
        media_key: uploadedMediaKey,
        media_type: mediaType,
        send_to: sendTo,
        channel_id: targetChannel,
        scheduled_at: scheduleEnabled ? new Date(scheduledAt).toISOString() : null,
      };
      const url = editPost ? `${API_URL}/broadcast/${editPost.id}` : `${API_URL}/broadcast`;
      const method = editPost ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Save failed'); return; }
      setShowForm(false);
      fetchPosts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (postId: string) => {
    setSending(postId); setError('');
    try {
      const r = await fetch(`${API_URL}/broadcast/${postId}/send`, {
        method: 'POST',
        headers: { 'x-telegram-init-data': initData },
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Send failed'); return; }
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'sending' } : p));
      setTimeout(() => fetchPosts(), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      await fetch(`${API_URL}/broadcast/${postId}`, {
        method: 'DELETE',
        headers: { 'x-telegram-init-data': initData },
      });
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── FORM VIEW ──────────────────────────────────────────────────────────────
  if (showForm) {
    const isMedia = !!mediaPreview;
    const maxChars = isMedia ? 1024 : 4096;
    const isOverLimit = body.length > maxChars;

    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-slate-800">
            {editPost ? '✏️ Edit Post' : '📢 New Broadcast'}
          </h2>
          <button onClick={() => { setShowForm(false); resetForm(); }}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">

          {/* Title */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 mb-2">Title (optional header)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. 🎁 Weekend Deposit Bonus!"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>

          {/* Media Upload */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 mb-2">
              Image or Video (optional)
            </label>

            {mediaPreview ? (
              <div className="relative">
                {mediaType === 'video' ? (
                  <div className="relative w-full h-44 bg-slate-900 rounded-xl flex items-center justify-center overflow-hidden">
                    <video src={mediaPreview} className="h-full w-full object-cover rounded-xl" muted playsInline />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/60 rounded-full p-3">
                        <Film size={28} className="text-white" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img src={mediaPreview} alt="preview" className="w-full h-44 object-cover rounded-xl" />
                )}

                {/* Upload progress overlay */}
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 rounded-xl flex flex-col items-center justify-center space-y-2">
                    <Loader2 size={28} className="text-white animate-spin" />
                    <span className="text-white text-sm font-bold">{uploadProgress}%</span>
                    <div className="w-3/4 h-2 bg-white/30 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                {!uploading && (
                  <button onClick={removeMedia}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-lg">
                    <X size={14} />
                  </button>
                )}

                {/* Type badge */}
                <div className="absolute bottom-2 left-2">
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg shadow ${mediaType === 'video' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'}`}>
                    {mediaType === 'video' ? '🎬 Video' : '🖼️ Image'}
                  </span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-yellow-400 hover:text-yellow-500 transition-colors"
              >
                <div className="flex space-x-3 mb-2">
                  <ImageIcon size={24} />
                  <Video size={24} />
                </div>
                <span className="text-sm font-semibold">Tap to upload Image or Video</span>
                <span className="text-xs mt-1">JPG, PNG, GIF · MP4, MOV, WebM</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Message Body */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 mb-2">
              Message <span className="text-red-500">*</span>
              <span className="ml-2 font-normal text-slate-400">(supports *bold* _italic_)</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your announcement here…"
              rows={5}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none ${
                isOverLimit ? 'border-red-400 focus:ring-red-400' : 'border-slate-200 focus:ring-yellow-400'
              }`}
            />
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-slate-400">
                {isMedia ? '📷 Caption limit: 1024 chars' : '💬 Text message'}
              </span>
              <span className={isOverLimit ? 'font-bold text-red-500' : 'text-slate-400'}>
                {body.length} / {maxChars}
              </span>
            </div>
          </div>

          {/* Send To */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 mb-3">Target Audience</label>
            <div className="space-y-2">
              {SEND_TO_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSendTo(opt.value)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                    sendTo === opt.value
                      ? 'border-yellow-400 bg-yellow-50 text-yellow-900 shadow-sm'
                      : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.desc}</p>
                  </div>
                  {sendTo === opt.value && <CheckCircle size={18} className="text-yellow-600 shrink-0" />}
                </button>
              ))}
            </div>

            {/* Target Channel input if channel or both selected */}
            {(sendTo === 'channel' || sendTo === 'both') && (
              <div className="mt-3 pt-3 border-t border-slate-100 bg-yellow-50/50 p-3 rounded-xl border border-yellow-100">
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center space-x-1.5">
                  <AtSign size={14} className="text-yellow-600" />
                  <span>Target Telegram Channel</span>
                </label>
                <input
                  type="text"
                  value={channelId}
                  onChange={e => setChannelId(e.target.value)}
                  placeholder="@hdasebingo"
                  className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Default channel: <strong>@hdasebingo</strong> (<a href="https://t.me/hdasebingo" target="_blank" rel="noreferrer" className="text-yellow-600 font-bold underline">https://t.me/hdasebingo</a>).
                  <br />Ensure your Telegram bot is added as an <strong>Administrator</strong> in @hdasebingo.
                </p>
              </div>
            )}
          </div>

          {/* Action Button Attachment */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <span className="text-base">🎮</span>
                <span className="font-black text-slate-900">Interactive "PLAY NOW" Button</span>
              </label>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-200">
                AUTO-ATTACHED
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Every broadcast post automatically includes an attractive high-converting Telegram button:
            </p>

            {/* Telegram-style button preview */}
            <div className="p-3 bg-slate-900/5 rounded-xl border border-slate-200/60 mb-3 flex flex-col items-center">
              <div className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white font-black text-xs rounded-xl shadow text-center flex items-center justify-center space-x-1.5">
                <span>🎮 አሁኑኑ ይጫወቱ • PLAY NOW</span>
              </div>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div className="flex items-start gap-1.5">
                <span className="font-bold text-slate-700 shrink-0">📢 ቻናል (Channel):</span>
                <span>ቦቱን ያላስጀመሩት ተጠቃሚዎች ቦቱን ከፍተው START እንዲጫኑ ያደርጋል፤ ያስጀመሩትን ደግሞ በቀጥታ ጨዋታውን ይከፍትላቸዋል።</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="font-bold text-slate-700 shrink-0">🤖 ተጫዋቾች (Bot Users):</span>
                <span>በቀጥታ ሚኒ አፑን ሙሉ ስክሪን ይከፍትላቸዋል።</span>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-slate-500 flex items-center space-x-1.5">
                <Clock size={14} />
                <span>Schedule Post</span>
              </label>
              <button
                type="button"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${scheduleEnabled ? 'bg-yellow-400' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduleEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </div>
            {scheduleEnabled ? (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              />
            ) : (
              <p className="text-xs text-slate-400">Post saved as draft. Press "Send Now" to broadcast immediately.</p>
            )}
          </div>

          {error && (
            <div className="flex items-center space-x-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-sm active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex-1 py-3.5 rounded-xl bg-yellow-400 text-slate-900 font-black text-sm flex items-center justify-center space-x-2 disabled:opacity-60 active:scale-95 transition-all shadow-sm"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              <span>{scheduleEnabled ? '📅 Schedule' : '💾 Save Draft'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-black text-slate-800 flex items-center space-x-2">
            <Radio className="text-yellow-500" size={22} />
            <span>Broadcast</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Send posts to all players &amp; channel @hdasebingo</p>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center space-x-2 bg-yellow-400 text-slate-900 font-black text-sm px-4 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all"
        >
          <Plus size={16} />
          <span>New Post</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center space-x-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm mb-4">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center pt-16">
          <Loader2 size={32} className="animate-spin text-yellow-400" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center pt-20 text-slate-400 space-y-3">
          <MessageSquare size={48} strokeWidth={1.5} />
          <p className="font-semibold text-sm">No posts yet</p>
          <button onClick={openCreateForm} className="text-yellow-600 font-bold text-sm underline">
            Create your first post →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const badge = STATUS_BADGE[post.status];
            const isSendable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
            const isEditable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
            const isSending = sending === post.id;
            const targetChannelName = post.channel_id || defaultChannel || '@hdasebingo';

            return (
              <div key={post.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Media preview */}
                {post.media_url && post.media_type === 'image' && (
                  <img src={post.media_url} alt="post" className="w-full h-36 object-cover" />
                )}
                {post.media_url && post.media_type === 'video' && (
                  <div className="relative w-full h-36 bg-slate-900 flex items-center justify-center overflow-hidden">
                    <video src={post.media_url} className="h-full w-full object-cover" muted playsInline />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="bg-black/70 rounded-full p-3">
                        <Film size={24} className="text-white" />
                      </div>
                    </div>
                    <span className="absolute bottom-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-purple-600 text-white">🎬 Video</span>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      {post.title && (
                        <p className="font-black text-slate-800 text-sm truncate">{post.title}</p>
                      )}
                      <p className="text-slate-600 text-sm line-clamp-2 mt-0.5">{post.body}</p>
                    </div>
                    <span className={`ml-2 shrink-0 text-[10px] font-black px-2 py-1 rounded-lg ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Target audience badge & Play button indicator */}
                  <div className="flex flex-wrap gap-1.5 text-[11px] mb-2">
                    <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                      {post.send_to === 'bot' && '🤖 Bot (All Players)'}
                      {post.send_to === 'channel' && `📢 Channel (${targetChannelName})`}
                      {post.send_to === 'both' && `📡 Bot + Channel (${targetChannelName})`}
                    </span>
                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                      🎮 PLAY NOW Button Attached
                    </span>
                    {post.scheduled_at && post.status === 'scheduled' && (
                      <span className="bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded-md">
                        📅 {fmtDate(post.scheduled_at)}
                      </span>
                    )}
                  </div>

                  {/* Delivery status */}
                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 mb-3">
                    {post.status === 'sent' && (
                      <span className="text-green-600 font-bold">
                        ✅ {post.sent_count} delivered {post.failed_count > 0 ? `· ${post.failed_count} failed` : ''} · {fmtDate(post.sent_at)}
                      </span>
                    )}
                    {post.status === 'failed' && (
                      <span className="text-red-600 font-bold">
                        ❌ Failed ({post.failed_count} errors)
                      </span>
                    )}
                    {!post.scheduled_at && post.status === 'draft' && (
                      <span>Created {fmtDate(post.created_at)}</span>
                    )}
                  </div>

                  {/* Error warning if any */}
                  {post.error_message && (
                    <div className="text-[11px] text-red-600 bg-red-50 p-2.5 rounded-lg mb-3 border border-red-100 leading-relaxed">
                      ⚠️ {post.error_message}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex space-x-2">
                    {isSendable && (
                      <button
                        onClick={() => handleSend(post.id)}
                        disabled={isSending}
                        className="flex-1 flex items-center justify-center space-x-1.5 bg-green-500 hover:bg-green-600 text-white font-bold text-xs py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-60 shadow-sm"
                      >
                        {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        <span>{isSending ? 'Sending…' : 'Send Now'}</span>
                      </button>
                    )}
                    {isEditable && (
                      <button
                        onClick={() => openEditForm(post)}
                        className="flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs px-3 py-2.5 rounded-xl active:scale-95 transition-all"
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2.5 rounded-xl active:scale-95 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
