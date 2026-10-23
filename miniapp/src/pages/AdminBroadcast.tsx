import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Radio,
  Plus,
  RefreshCw,
  Send,
  Clock,
  Trash2,
  Image as ImageIcon,
  Edit2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  MessageSquare,
  X,
  Video,
  Film,
  AtSign,
  Calendar,
  Sparkles,
  Users,
  Megaphone,
} from 'lucide-react';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

type SendTo = 'bot' | 'channel' | 'both';
type PostStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
type MediaType = 'image' | 'video' | null;
type FilterTab = 'all' | 'sent' | 'scheduled' | 'draft' | 'failed';

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

const STATUS_CONFIG: Record<PostStatus, { label: string; badgeCls: string; dotCls: string }> = {
  draft:     { label: 'Draft',     badgeCls: 'bg-slate-100 text-slate-700 border-slate-200', dotCls: 'bg-slate-400' },
  scheduled: { label: 'Scheduled', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',     dotCls: 'bg-blue-500' },
  sending:   { label: 'Sending…',  badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',  dotCls: 'bg-amber-500 animate-ping' },
  sent:      { label: 'Delivered', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotCls: 'bg-emerald-500' },
  failed:    { label: 'Failed',    badgeCls: 'bg-rose-50 text-rose-700 border-rose-200',     dotCls: 'bg-rose-500' },
};

const AUDIENCE_OPTIONS: { value: SendTo; label: string; sub: string; icon: any }[] = [
  { value: 'both',    label: 'Bot + Channel', sub: 'All players & @hdasebingo', icon: Megaphone },
  { value: 'bot',     label: 'Bot Only',      sub: 'All registered players',   icon: Users },
  { value: 'channel', label: 'Channel Only',  sub: 'Public Telegram channel',  icon: AtSign },
];

export default function AdminBroadcast() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BroadcastPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [defaultChannel, setDefaultChannel] = useState('@hdasebingo');
  const [showForm, setShowForm] = useState(false);
  const [editPost, setEditPost] = useState<BroadcastPost | null>(null);

  // Form states
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
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/broadcast`, { headers: { 'x-telegram-init-data': initData } });
      const d = await r.json();
      setPosts(d.posts || []);
    } catch {
      setError('Failed to load broadcast posts');
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
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchPosts();
    fetchDefaultChannel();
  }, []);

  // Auto-refresh when any post is currently sending
  useEffect(() => {
    const hasSending = posts.some(p => p.status === 'sending');
    if (!hasSending) return;
    const t = setTimeout(() => fetchPosts(), 6000);
    return () => clearTimeout(t);
  }, [posts]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    if (activeFilter === 'all') return posts;
    return posts.filter(p => p.status === activeFilter);
  }, [posts, activeFilter]);

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: posts.length,
      sent: posts.filter(p => p.status === 'sent').length,
      scheduled: posts.filter(p => p.status === 'scheduled').length,
      draft: posts.filter(p => p.status === 'draft').length,
      failed: posts.filter(p => p.status === 'failed').length,
    };
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
    setScheduleEnabled(Boolean(post.scheduled_at));
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
      setError('Please choose an image (JPG, PNG) or video (MP4)');
      return;
    }

    setMediaPreview(URL.createObjectURL(file));
    setMediaType(isVideo ? 'video' : 'image');
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
        throw new Error(d.error || 'Failed to prepare upload');
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
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
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

  const handleSave = async (autoSendImmediately: boolean = false) => {
    if (!body.trim()) {
      setError('Message text is required');
      return;
    }
    if (uploading) {
      setError('Please wait for the media upload to finish');
      return;
    }
    if (scheduleEnabled && !scheduledAt && !autoSendImmediately) {
      setError('Please select scheduled date and time');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const targetChannel = (sendTo === 'channel' || sendTo === 'both')
        ? (channelId.trim() || defaultChannel || '@hdasebingo')
        : null;

      const payload = {
        title: title.trim(),
        body: body.trim(),
        media_url: uploadedMediaUrl,
        media_key: uploadedMediaKey,
        media_type: mediaType,
        send_to: sendTo,
        channel_id: targetChannel,
        scheduled_at: (scheduleEnabled && !autoSendImmediately) ? new Date(scheduledAt).toISOString() : null,
      };

      const url = editPost ? `${API_URL}/broadcast/${editPost.id}` : `${API_URL}/broadcast`;
      const method = editPost ? 'PUT' : 'POST';

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify(payload),
      });
      const d = await r.json();

      if (!r.ok) {
        setError(d.error || 'Failed to save post');
        return;
      }

      const savedId = editPost ? editPost.id : d.post?.id;

      if (autoSendImmediately && savedId) {
        await handleSend(savedId);
      }

      setShowForm(false);
      resetForm();
      fetchPosts();
    } catch (err: any) {
      setError(err.message || 'Error saving broadcast post');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (postId: string) => {
    setSendingId(postId);
    setError('');
    try {
      const r = await fetch(`${API_URL}/broadcast/${postId}/send`, {
        method: 'POST',
        headers: { 'x-telegram-init-data': initData },
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Failed to send broadcast');
        return;
      }
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'sending' } : p));
      setTimeout(() => fetchPosts(), 2500);
    } catch (err: any) {
      setError(err.message || 'Send error');
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this broadcast post?')) return;
    try {
      const r = await fetch(`${API_URL}/broadcast/${postId}`, {
        method: 'DELETE',
        headers: { 'x-telegram-init-data': initData },
      });
      if (r.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── FORM VIEW (Mobile First) ───────────────────────────────────────────────
  if (showForm) {
    const isMedia = Boolean(mediaPreview);
    const maxChars = isMedia ? 1024 : 4096;
    const isOverLimit = body.length > maxChars;

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
        <div>
          {/* Mobile Top Header */}
          <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-20">
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 text-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center space-x-2">
              <Radio size={17} className="text-amber-500" />
              <span className="font-bold text-slate-800 text-sm">
                {editPost ? 'Edit Broadcast' : 'New Broadcast'}
              </span>
            </div>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 text-slate-600 active:scale-95 transition-all"
            >
              <X size={17} />
            </button>
          </div>

          <div className="p-3.5 space-y-3.5 max-w-lg mx-auto pb-28">
            {/* Error banner */}
            {error && (
              <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-rose-700 text-xs font-semibold">
                <AlertCircle size={16} className="shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError('')}><X size={14} /></button>
              </div>
            )}

            {/* Target Audience Segmented Buttons */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2">
              <label className="text-[11px] font-bold text-slate-500">Target Audience</label>
              <div className="grid grid-cols-3 gap-1.5">
                {AUDIENCE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = sendTo === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSendTo(opt.value)}
                      className={`flex flex-col items-center justify-center py-2.5 px-2 rounded-xl border text-center transition-all active:scale-95 ${
                        selected
                          ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200/70 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Icon size={16} className={selected ? 'text-white mb-1' : 'text-slate-500 mb-1'} />
                      <span className="text-[11px] font-bold leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Telegram Channel handle input if channel or both */}
              {(sendTo === 'channel' || sendTo === 'both') && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">Telegram Channel Username</span>
                    <button
                      type="button"
                      onClick={() => setChannelId('@hdasebingo')}
                      className="text-[10px] font-bold text-indigo-600 active:underline"
                    >
                      Use @hdasebingo
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={channelId}
                      onChange={e => setChannelId(e.target.value)}
                      placeholder="@hdasebingo"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Make sure the Telegram bot is an <strong>Administrator</strong> in the channel with permission to post.
                  </p>
                </div>
              )}
            </div>

            {/* Media Upload Area */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-500">Image or Video Attachment</label>
                {mediaPreview && (
                  <button
                    type="button"
                    onClick={removeMedia}
                    className="text-[10px] font-bold text-rose-600 flex items-center space-x-1"
                  >
                    <Trash2 size={12} />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {mediaPreview ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
                  {mediaType === 'video' ? (
                    <div className="relative w-full h-40 flex items-center justify-center">
                      <video src={mediaPreview} className="h-full w-full object-cover" muted playsInline />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="bg-black/60 rounded-full p-2.5">
                          <Film size={22} className="text-white" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-600 text-white shadow">
                        Video
                      </span>
                    </div>
                  ) : (
                    <div className="relative w-full h-40">
                      <img src={mediaPreview} alt="preview" className="w-full h-full object-cover" />
                      <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600 text-white shadow">
                        Image
                      </span>
                    </div>
                  )}

                  {/* Uploading progress bar */}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center space-y-2 p-4">
                      <Loader2 size={24} className="text-white animate-spin" />
                      <span className="text-white text-xs font-bold">{uploadProgress}% uploading...</span>
                      <div className="w-full max-w-[200px] h-1.5 bg-white/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 px-3 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:border-amber-400 hover:bg-amber-50/20 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center space-x-2 text-slate-400 mb-1">
                    <ImageIcon size={20} />
                    <Video size={20} />
                  </div>
                  <span className="text-xs font-bold text-slate-700">Tap to upload Photo or Video</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, GIF, MP4</span>
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

            {/* Post Title & Message Body */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  Title (Optional Heading)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. 🎁 Weekend Bingo Bonus!"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-500">
                    Message Body <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-[10px] font-semibold ${isOverLimit ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                    {body.length} / {maxChars}
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Type your broadcast announcement here... Supports *bold* and _italic_ text."
                  rows={4}
                  className={`w-full bg-slate-50 border rounded-xl p-3 text-xs leading-relaxed text-slate-800 focus:outline-none focus:ring-2 resize-none ${
                    isOverLimit ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 focus:ring-amber-400'
                  }`}
                />
              </div>

              {/* Formatting Helper Pills */}
              <div className="flex items-center space-x-1.5 pt-1 overflow-x-auto scrollbar-none">
                <span className="text-[10px] text-slate-400 font-semibold shrink-0">Quick format:</span>
                <button
                  type="button"
                  onClick={() => setBody(prev => prev + ' *bold text*')}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 shrink-0"
                >
                  *Bold*
                </button>
                <button
                  type="button"
                  onClick={() => setBody(prev => prev + ' _italic text_')}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 shrink-0"
                >
                  _Italic_
                </button>
                <button
                  type="button"
                  onClick={() => setBody(prev => prev + ' 🎉')}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 shrink-0"
                >
                  🎉 Emoji
                </button>
              </div>
            </div>

            {/* Telegram Interactive Button Preview */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Sparkles size={14} className="text-emerald-600" />
                  <span className="text-[11px] font-bold text-slate-800">Attached Play Button</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Included
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                A high-converting button is automatically added below your post:
              </p>
              <div className="p-2 bg-slate-100 rounded-xl">
                <div className="w-full py-2 px-3 bg-emerald-600 text-white rounded-lg text-center font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm">
                  <span>🎮 አሁኑኑ ይጫወቱ • PLAY NOW</span>
                </div>
              </div>
            </div>

            {/* Scheduling Section */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Calendar size={14} className="text-slate-500" />
                  <span className="text-[11px] font-bold text-slate-700">Schedule for Later</span>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    scheduleEnabled ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      scheduleEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              {scheduleEnabled && (
                <div className="pt-2 border-t border-slate-100">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Mobile Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 p-3 z-30 shadow-lg">
          <div className="max-w-lg mx-auto flex items-center space-x-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="flex-1 py-3 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving || uploading}
              className="flex-1 py-3 px-3 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-60 active:scale-[0.98] transition-all shadow-sm"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              <span>{scheduleEnabled ? '📅 Schedule' : '💾 Save Draft'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || uploading}
              className="flex-1 py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center space-x-1.5 disabled:opacity-60 active:scale-[0.98] transition-all shadow-sm"
            >
              <Send size={13} />
              <span>Send Now</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW (Mobile First) ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Sticky Mobile Header */}
      <div className="bg-white border-b border-slate-100 px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 text-slate-700 active:scale-95 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center space-x-2">
          <Radio size={17} className="text-amber-500" />
          <span className="font-bold text-slate-800 text-sm">Broadcast</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={fetchPosts}
            disabled={loading}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 active:bg-slate-200 text-slate-600 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreateForm}
            className="h-9 px-3 flex items-center space-x-1.5 rounded-xl bg-amber-500 active:bg-amber-600 text-white text-xs font-bold active:scale-95 transition-all shadow-sm"
          >
            <Plus size={15} />
            <span>New</span>
          </button>
        </div>
      </div>

      <div className="p-3.5 space-y-3 max-w-lg mx-auto">
        {/* Error notification */}
        {error && (
          <div className="flex items-center space-x-2 bg-rose-50 border border-rose-200 rounded-2xl p-3 text-rose-700 text-xs font-semibold">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        {/* Filter Pills Bar */}
        <div className="flex space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: 'all', label: 'All', count: counts.all },
            { key: 'sent', label: 'Delivered', count: counts.sent },
            { key: 'scheduled', label: 'Scheduled', count: counts.scheduled },
            { key: 'draft', label: 'Drafts', count: counts.draft },
            { key: 'failed', label: 'Failed', count: counts.failed },
          ].map(tab => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key as FilterTab)}
                className={`shrink-0 flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isActive
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Posts List */}
        {loading && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2.5 text-slate-400">
            <Loader2 size={28} className="animate-spin text-amber-500" />
            <p className="text-xs font-bold">Loading broadcasts...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-2">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
              <MessageSquare size={22} />
            </div>
            <p className="text-xs font-bold text-slate-700">No broadcasts found</p>
            <p className="text-[11px] text-slate-400">Tap "+ New" above to compose a message</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => {
              const cfg = STATUS_CONFIG[post.status];
              const isSending = sendingId === post.id || post.status === 'sending';
              const canSend = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
              const canEdit = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';

              return (
                <div
                  key={post.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col"
                >
                  {/* Media Banner preview if any */}
                  {post.media_url && post.media_type === 'image' && (
                    <div className="w-full h-36 bg-slate-100 overflow-hidden">
                      <img src={post.media_url} alt="broadcast" className="w-full h-full object-cover" />
                    </div>
                  )}
                  {post.media_url && post.media_type === 'video' && (
                    <div className="relative w-full h-36 bg-slate-900 flex items-center justify-center overflow-hidden">
                      <video src={post.media_url} className="h-full w-full object-cover" muted playsInline />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="bg-black/60 rounded-full p-2.5">
                          <Film size={20} className="text-white" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-600 text-white shadow">
                        Video
                      </span>
                    </div>
                  )}

                  {/* Body Content */}
                  <div className="p-3.5 space-y-2.5">
                    {/* Top Row: Title + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {post.title ? (
                          <p className="font-bold text-slate-800 text-sm truncate">{post.title}</p>
                        ) : (
                          <p className="font-bold text-slate-500 text-xs italic">No title</p>
                        )}
                      </div>
                      <div className={`shrink-0 flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${cfg.badgeCls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
                        <span>{cfg.label}</span>
                      </div>
                    </div>

                    {/* Message snippet */}
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                      {post.body}
                    </p>

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="inline-flex items-center space-x-1 bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {post.send_to === 'both' && '📡 Bot + Channel'}
                        {post.send_to === 'bot' && '🤖 Bot Only'}
                        {post.send_to === 'channel' && `📢 ${post.channel_id || '@hdasebingo'}`}
                      </span>

                      <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-100">
                        <span>🎮 Play Button</span>
                      </span>

                      {post.scheduled_at && post.status === 'scheduled' && (
                        <span className="inline-flex items-center space-x-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          <Clock size={11} />
                          <span>{fmtDate(post.scheduled_at)}</span>
                        </span>
                      )}
                    </div>

                    {/* Delivery metrics */}
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-50">
                      <span>Created {fmtDate(post.created_at)}</span>
                      {post.status === 'sent' && (
                        <span className="text-emerald-600 font-bold">
                          ✅ {post.sent_count} delivered {post.failed_count > 0 ? `(${post.failed_count} failed)` : ''}
                        </span>
                      )}
                      {post.status === 'failed' && (
                        <span className="text-rose-600 font-bold">
                          ❌ {post.failed_count} errors
                        </span>
                      )}
                    </div>

                    {/* Error message if any */}
                    {post.error_message && (
                      <div className="text-[10px] text-rose-600 bg-rose-50 p-2 rounded-xl border border-rose-100">
                        {post.error_message}
                      </div>
                    )}

                    {/* Action Buttons Row (Mobile Screen Touch Friendly) */}
                    <div className="grid grid-cols-12 gap-1.5 pt-1">
                      {canSend && (
                        <button
                          type="button"
                          onClick={() => handleSend(post.id)}
                          disabled={isSending}
                          className="col-span-6 flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs active:scale-95 transition-all disabled:opacity-60 shadow-sm"
                        >
                          {isSending ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>{isSending ? 'Sending…' : 'Send Now'}</span>
                        </button>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditForm(post)}
                          className={`${canSend ? 'col-span-4' : 'col-span-9'} flex items-center justify-center space-x-1 py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs active:scale-95 transition-all`}
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDelete(post.id)}
                        className={`${canSend ? 'col-span-2' : 'col-span-3'} flex items-center justify-center py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 active:scale-95 transition-all`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
