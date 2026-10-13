import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { ArrowLeft, Plus, Edit2, Trash2, UploadCloud, Save, X, ChevronDown, CheckCircle2, Landmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import WebApp from '@twa-dev/sdk';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface DepositMethod {
  id: string;
  type: 'cbe' | 'boa' | 'telebirr' | 'mpesa';
  name: string;
  account_number: string;
  logo_url: string;
  min_deposit: number;
  is_active: boolean;
}

const methodNames = {
    cbe: 'Commercial Bank of Ethiopia',
  boa: 'Bank of Abyssinia',
  telebirr: 'Telebirr',
  mpesa: 'M-Pesa',
  cbebirr: 'CBE Birr',
  ebirr: 'E-Birr',
  awash: 'Awash Bank',
  dashen: 'Dashen Bank',
  amhara: 'Amhara Bank',
  coop: 'Cooperative Bank of Oromia',
  amole: 'Amole Wallet',
  hello_cash: 'HelloCash',
  nib: 'Nib International Bank',
  wegagen: 'Wegagen Bank',
  zemen: 'Zemen Bank',
  oromia: 'Oromia Bank',
  hibret: 'Hibret Bank',
};

export default function AdminDepositMethods() {
  const { user } = useGameStore();
  const [methods, setMethods] = useState<DepositMethod[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypeSelect, setShowTypeSelect] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    type: 'cbe',
    name: '',
    account_number: '',
    min_deposit: 50,
  });
  const [file, setFile] = useState<File | null>(null);
  const [existingLogoUrl, setExistingLogoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchMethods();
  }, []);

  const fetchMethods = async () => {
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/deposit-methods`, {
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) {
        const data = await res.json();
        setMethods(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingId(null);
    setFormData({ type: 'cbe', name: '', account_number: '', min_deposit: 50 });
    setFile(null);
    setExistingLogoUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (method: DepositMethod) => {
    setEditingId(method.id);
    setFormData({
      type: method.type,
      name: method.name,
      account_number: method.account_number,
      min_deposit: method.min_deposit,
    });
    setFile(null);
    setExistingLogoUrl(method.logo_url || '');
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deposit method?')) return;
    try {
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      const res = await fetch(`${API_URL}/admin/deposit-methods/${id}`, {
        method: 'DELETE',
        headers: { 'x-telegram-init-data': initData }
      });
      if (res.ok) fetchMethods();
    } catch (err) {
      console.error(err);
    }
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
    // 1. Get presigned URL
    const res = await fetch(`${API_URL}/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
      body: JSON.stringify({ filename: file.name, contentType: file.type })
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to get upload URL');
    }
    
    const { uploadUrl, publicUrl } = await res.json();
    
    // 2. Upload to Cloudflare R2
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });

    if (!uploadRes.ok) {
      throw new Error(`Cloudflare rejected the upload. Check R2 CORS settings.`);
    }
    
    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      let finalLogoUrl = existingLogoUrl;
      
      // Upload new file to R2 if selected
      if (file) {
        finalLogoUrl = await uploadLogo(file);
      }
      
      const payload = { ...formData, logo_url: finalLogoUrl, is_active: true };
      const initData = typeof WebApp !== 'undefined' ? WebApp.initData : '';
      
      const url = editingId 
        ? `${API_URL}/admin/deposit-methods/${editingId}`
        : `${API_URL}/admin/deposit-methods`;
        
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchMethods();
      } else {
        const err = await res.json();
        alert('API Error: ' + err.error);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed! ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user?.role !== 'admin') {
    return <div className="p-10 text-center font-bold text-slate-600">Admin only!</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50  pb-20">
      {/* Header */}
      <div className="bg-white  px-4 py-4 rounded-b-2xl shadow-sm border-b border-gray-100  flex items-center justify-between sticky top-0 z-10">
        <Link to="/admin" className="p-2 bg-slate-100  rounded-full text-slate-600  hover:bg-slate-200 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="font-black text-slate-800  text-lg tracking-tight">Deposit Methods</h1>
        <button onClick={openNewModal} className="p-2.5 bg-yellow-400 text-yellow-950 rounded-full hover:bg-yellow-500 shadow-sm transition-transform active:scale-95">
          <Plus size={18} strokeWidth={3} />
        </button>
      </div>

      {/* List of Methods */}
      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-slate-500  mt-10 font-medium">Loading...</p>
        ) : methods.length === 0 ? (
          <div className="bg-white  border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50  rounded-full flex items-center justify-center mb-3">
              <Landmark size={24} className="text-slate-400" />
            </div>
            <p className="text-slate-500  font-medium">No deposit methods found.</p>
            <p className="text-xs text-slate-400 mt-1">Click the + button to add one.</p>
          </div>
        ) : (
          methods.map((method) => (
            <div key={method.id} className="bg-white  p-4 rounded-2xl shadow-sm border border-gray-100  flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {method.logo_url ? (
                  <img src={method.logo_url} alt="Logo" className="w-12 h-12 rounded-xl object-contain bg-slate-50  border border-slate-100 p-1" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100  flex items-center justify-center text-slate-400 text-[10px] font-bold">NO IMG</div>
                )}
                <div>
                  <h3 className="font-bold text-slate-800  leading-tight">{methodNames[method.type]}</h3>
                  <p className="text-[11px] text-slate-500  font-bold uppercase tracking-wider mt-0.5">{method.name}</p>
                  <p className="text-sm font-black text-slate-600  mt-1">{method.account_number}</p>
                </div>
              </div>
              <div className="flex flex-col space-y-2">
                <button onClick={() => openEditModal(method)} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(method.id)} className="p-2.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Main Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white  w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden animate-slide-up">
            <div className="px-5 py-4 border-b border-gray-100  flex justify-between items-center bg-slate-50 /50">
              <h2 className="font-black text-slate-800  text-lg">{editingId ? 'Edit Method' : 'Add New Method'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="bg-white  p-2 rounded-full text-slate-400 hover:text-slate-600  shadow-sm border border-gray-100 ">
                <X size={18} strokeWidth={3} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              
              {/* Custom Dropdown */}
              <div className="relative">
                <label className="block text-[10px] font-black text-slate-400 tracking-wider mb-2">METHOD TYPE</label>
                <button
                  type="button"
                  onClick={() => setShowTypeSelect(!showTypeSelect)}
                  className="w-full bg-slate-50  border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-700  flex justify-between items-center text-left focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                >
                  <span>{methodNames[formData.type as keyof typeof methodNames]}</span>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${showTypeSelect ? 'rotate-180' : ''}`} />
                </button>

                {showTypeSelect && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-y-auto max-h-60">
                    <div className="flex flex-col">
                      {(Object.entries(methodNames)).map(([key, name]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setFormData({...formData, type: key as any});
                            setShowTypeSelect(false);
                          }}
                          className={`w-full text-left px-5 py-4 font-bold flex items-center justify-between transition-colors border-b border-gray-50 last:border-0 ${
                            formData.type === key 
                              ? 'bg-blue-50/50 text-blue-600' 
                              : 'bg-white  text-slate-700  hover:bg-slate-50 '
                          }`}
                        >
                          <span>{name}</span>
                          {formData.type === key && <CheckCircle2 size={18} className="text-blue-500" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-wider mb-2">ACCOUNT NAME</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Abebe Kebede"
                  className="w-full bg-slate-50  border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-wider mb-2">ACCOUNT / PHONE NUMBER</label>
                <input 
                  type="text" 
                  required
                  placeholder={formData.type === 'cbe' || formData.type === 'boa' ? '1000123456789' : '0911234567'}
                  className="w-full bg-slate-50  border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={formData.account_number}
                  onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-wider mb-2">MIN DEPOSIT (ETB)</label>
                <input 
                  type="number" 
                  required
                  min="50"
                  className="w-full bg-slate-50  border border-gray-200 rounded-xl px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                  value={formData.min_deposit}
                  onChange={(e) => setFormData({...formData, min_deposit: Number(e.target.value)})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 tracking-wider mb-2">LOGO IMAGE</label>
                <div className="flex items-center space-x-3">
                  <label className="flex-1 bg-blue-50 text-blue-600 px-4 py-3.5 rounded-xl text-center font-bold text-sm cursor-pointer border border-blue-100 flex justify-center items-center space-x-2 hover:bg-blue-200 transition-colors">
                    <UploadCloud size={18} />
                    <span>Choose Image</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  {(file || existingLogoUrl) && (
                    <div className="w-14 h-14 rounded-xl bg-slate-50  border border-gray-200 flex-shrink-0 flex items-center justify-center p-1 shadow-inner">
                      <img 
                        src={file ? URL.createObjectURL(file) : existingLogoUrl} 
                        alt="Preview" 
                        className="w-full h-full object-contain rounded-lg" 
                      />
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-950 font-black py-4 rounded-xl flex items-center justify-center space-x-2 mt-4 shadow-sm disabled:opacity-50 transition-all active:scale-95"
              >
                {isSubmitting ? <span>Saving...</span> : <><Save size={18} /> <span>Save Method</span></>}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
