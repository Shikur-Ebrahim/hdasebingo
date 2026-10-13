import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, ChevronDown } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const API = import.meta.env.VITE_API_URL || '';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  'How do I deposit?',
  'How does BINGO work?',
  'How to withdraw?',
  'What is Derash?',
];

export default function SupportChat() {
  const { user } = useGameStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `👋 Hi ${user?.first_name || 'there'}! I'm your Hdasebingo AI assistant. How can I help you today?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/support/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `tma ${window.Telegram?.WebApp?.initData || ''}`,
        },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Sorry, I couldn\'t reach the server. Please try again.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Network error. Please check your connection.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-50 flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-3 py-2 rounded-full shadow-[0_4px_20px_rgba(109,40,217,0.5)] active:scale-95 transition-all"
        >
          <MessageCircle size={16} className="flex-shrink-0" />
          <span className="text-[11px] font-black tracking-wide">Support</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        </button>
      )}

      {/* Chat Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          {/* Backdrop tap to close */}
          <div className="flex-1" onClick={() => setOpen(false)} />

          {/* Chat Panel — slides up from bottom */}
          <div className="bg-white rounded-t-3xl flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
            
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Bot size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-black text-sm leading-none">ADWA AI Support</p>
                <p className="text-violet-200 text-[10px] font-medium mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  Online — AI Powered
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
              >
                <ChevronDown size={18} className="text-white" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-slate-50" style={{ minHeight: 0 }}>
              {messages.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mb-0.5">
                      <Bot size={14} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-br-sm'
                      : 'bg-white text-slate-800 shadow-sm border border-slate-100 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div className="flex items-end gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="bg-white shadow-sm border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Questions */}
            {messages.length <= 2 && !loading && (
              <div className="px-3 pb-2 pt-1 flex gap-1.5 overflow-x-auto bg-white border-t border-slate-100 flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="flex-shrink-0 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-bold rounded-full active:scale-95 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-3 py-2 bg-white border-t border-slate-100 flex gap-2 items-center flex-shrink-0">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                disabled={loading}
                className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 shadow-md flex-shrink-0"
              >
                <Send size={16} className="text-white translate-x-[1px]" />
              </button>
            </div>

            {/* Safe area for iOS */}
            <div className="h-safe bg-white flex-shrink-0" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
          </div>
        </div>
      )}
    </>
  );
}
