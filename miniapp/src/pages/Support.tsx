import { useState, useRef, useEffect } from 'react';
import { Send, Bot, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { t } from '../lib/translations';
import ReactMarkdown from 'react-markdown';

const API = import.meta.env.VITE_API_URL || '/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}



export default function SupportPage() {
  const { user, language } = useGameStore();
  const QUICK_QUESTIONS = [
    t[language].support.quick1,
    t[language].support.quick2,
    t[language].support.quick3,
    t[language].support.quick4,
    t[language].support.quick5,
    t[language].support.quick6,
  ];
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: t[language].support.welcome.replace('{name}', user?.first_name || 'there'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          'x-telegram-init-data': (window as any).Telegram?.WebApp?.initData || '',
        },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ Sorry, I couldn\'t reach the server. Please try again in a moment.',
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Network error. Please check your connection and try again.',
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const showQuickQuestions = messages.length <= 2 && !loading;

  return (
    <div className="flex flex-col h-screen bg-slate-50" style={{ maxHeight: '100dvh' }}>
      {/* Header - Native Style */}
      <div className="bg-white px-3 py-3 flex items-center gap-3 flex-shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.05)] z-30 relative">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center active:bg-slate-100 transition-colors flex-shrink-0 text-slate-700"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 relative">
          <Bot size={22} className="text-violet-600" />
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 font-bold text-[17px] leading-tight">{t[language].support.title}</p>
          <p className="text-emerald-600 text-[13px] font-medium leading-tight">{t[language].support.online}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4" style={{ paddingBottom: showQuickQuestions ? 'calc(220px + env(safe-area-inset-bottom, 0px))' : 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
              msg.role === 'user'
                ? 'bg-violet-600 text-white rounded-[20px] rounded-br-[4px] whitespace-pre-wrap'
                : 'bg-white text-slate-800 rounded-[20px] rounded-bl-[4px] border border-slate-100 prose prose-sm prose-slate prose-p:my-1 prose-strong:text-violet-900 prose-ul:my-1 prose-li:my-0 prose-ul:pl-4 max-w-none'
            }`}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex flex-col items-start">
            <div className="bg-white shadow-sm border border-slate-100 rounded-[20px] rounded-bl-[4px] px-5 py-3.5 flex gap-1.5 items-center">
              <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {showQuickQuestions && (
        <div className="fixed left-0 right-0 bg-white border-t border-slate-100 px-3 py-3 flex flex-col gap-2 z-10" style={{ bottom: 'calc(64px + 68px + env(safe-area-inset-bottom, 0px))' }}>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{t[language].support.quickQuestions}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="flex-shrink-0 px-3 py-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-bold rounded-full active:scale-95 transition-all whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="fixed left-0 right-0 px-3 py-3 bg-white border-t border-slate-100 flex gap-2 items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-20" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t[language].support.placeholder}
          disabled={loading}
          className="flex-1 bg-slate-100 rounded-full px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 border border-slate-200"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40 shadow-md flex-shrink-0"
        >
          <Send size={18} className="text-white translate-x-[1px]" />
        </button>
      </div>
    </div>
  );
}
