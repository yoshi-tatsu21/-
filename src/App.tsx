import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { 
  ShoppingBag, 
  User, 
  CheckCircle2, 
  Phone, 
  Wallet, 
  Trash2, 
  Plus,
  AlertCircle,
  Clock,
  MapPin,
  ChevronRight,
  Settings,
  Save,
  X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const socket = io();

interface MenuItem {
  id: number;
  name: string;
  price: number;
}

interface OptionItem {
  id: number;
  name: string;
}

interface TicketPackItem {
  id: number;
  label: string;
  price: number;
}

interface Order {
  id: number;
  user_name: string;
  role: string;
  menu_id: number;
  menu_name: string;
  price: number;
  payment_method: 'cash' | 'ticket';
  change_amount: number;
  option: string | null;
  ticket_purchase: string | null;
  memo: string | null;
  can_be_representative: boolean;
  paid: boolean;
}

interface DailyStatus {
  date: string;
  representative_name: string | null;
  is_ordered: boolean;
}

interface OptionItem {
  id: number;
  name: string;
}

interface TicketPackItem {
  id: number;
  label: string;
  price: number;
}

const ROLES = ['消防士', '主任', '主査', '補佐以上'];

export default function App() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [ticketPacks, setTicketPacks] = useState<TicketPackItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('');
  const [selectedMenuId, setSelectedMenuId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'ticket'>('cash');
  const [changeAmount, setChangeAmount] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [ticketPurchase, setTicketPurchase] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [canBeRep, setCanBeRep] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Menu Editing State
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [editMenuName, setEditMenuName] = useState('');
  const [editMenuPrice, setEditMenuPrice] = useState<number>(0);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuPrice, setNewMenuPrice] = useState<number>(0);

  // Options Editing State
  const [editingOptionId, setEditingOptionId] = useState<number | null>(null);
  const [editOptionName, setEditOptionName] = useState('');
  const [newOptionName, setNewOptionName] = useState('');

  // Ticket Packs Editing State
  const [editingTicketPackId, setEditingTicketPackId] = useState<number | null>(null);
  const [editTicketPackLabel, setEditTicketPackLabel] = useState('');
  const [editTicketPackPrice, setEditTicketPackPrice] = useState<number>(0);
  const [newTicketPackLabel, setNewTicketPackLabel] = useState('');
  const [newTicketPackPrice, setNewTicketPackPrice] = useState<number>(0);

  const fetchData = async () => {
    try {
      const [menuRes, optionsRes, ticketPacksRes, ordersRes, statusRes] = await Promise.all([
        fetch('/api/menu'),
        fetch('/api/options'),
        fetch('/api/ticket_packs'),
        fetch('/api/orders/today'),
        fetch('/api/status/today')
      ]);

      if (!menuRes.ok || !optionsRes.ok || !ticketPacksRes.ok || !ordersRes.ok || !statusRes.ok) {
        throw new Error('データの取得に失敗しました');
      }

      setMenu(await menuRes.json());
      setOptions(await optionsRes.json());
      setTicketPacks(await ticketPacksRes.json());
      setOrders(await ordersRes.json());
      setStatus(await statusRes.json());
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setNotification('データの読み込みに失敗しました。再試行してください。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('update', fetchData);
    socket.on('notification', (data: { message: string }) => {
      setNotification(data.message);
      setTimeout(() => setNotification(null), 10000);
    });
    return () => {
      socket.off('update');
      socket.off('notification');
    };
  }, []);

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    const now = new Date();
    const deadline = new Date();
    deadline.setHours(9, 30, 0, 0);

    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        user_name: userName, 
        role,
        menu_id: selectedMenuId,
        payment_method: paymentMethod,
        change_amount: paymentMethod === 'cash' ? changeAmount : 0,
        option: selectedOption,
        ticket_purchase: ticketPurchase,
        memo,
        can_be_representative: canBeRep
      })
    });

    if (now > deadline) {
      const repName = status?.representative_name || '担当者';
      setNotification(`締め切り時間を過ぎています！注文担当の ${repName} さんに必ず報告してください`);
      setTimeout(() => setNotification(null), 15000);
    }

    setUserName('');
    setRole('');
    setSelectedMenuId(null);
    setPaymentMethod('cash');
    setChangeAmount(0);
    setSelectedOption(null);
    setTicketPurchase(null);
    setMemo('');
    setCanBeRep(false);
  };

  const togglePaid = async (id: number, currentPaid: boolean) => {
    await fetch(`/api/orders/${id}/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: !currentPaid })
    });
  };

  const deleteOrder = async (id: number) => {
    // confirm() は iframe 内で動作しない可能性があるため、直接削除するかカスタムダイアログを検討してください
    // ここではデモ用に直接削除します
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
    } catch (error) {
      console.error('Delete error:', error);
      setNotification('注文の削除に失敗しました');
    }
  };

  const updateStatus = async (updates: Partial<DailyStatus>) => {
    await fetch('/api/status/today', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  };

  const addMenuItem = async () => {
    if (!newMenuName || newMenuPrice <= 0) return;
    await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newMenuName, price: newMenuPrice })
    });
    setNewMenuName('');
    setNewMenuPrice(0);
  };

  const updateMenuItem = async (id: number) => {
    await fetch(`/api/menu/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editMenuName, price: editMenuPrice })
    });
    setEditingMenuId(null);
  };

  const deleteMenuItem = async (id: number) => {
    await fetch(`/api/menu/${id}`, { method: 'DELETE' });
  };

  // Options Management
  const addOption = async () => {
    if (!newOptionName) return;
    await fetch('/api/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newOptionName })
    });
    setNewOptionName('');
  };

  const updateOption = async (id: number) => {
    await fetch(`/api/options/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editOptionName })
    });
    setEditingOptionId(null);
  };

  const deleteOption = async (id: number) => {
    await fetch(`/api/options/${id}`, { method: 'DELETE' });
  };

  // Ticket Packs Management
  const addTicketPack = async () => {
    if (!newTicketPackLabel || newTicketPackPrice <= 0) return;
    await fetch('/api/ticket_packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newTicketPackLabel, price: newTicketPackPrice })
    });
    setNewTicketPackLabel('');
    setNewTicketPackPrice(0);
  };

  const updateTicketPack = async (id: number) => {
    await fetch(`/api/ticket_packs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editTicketPackLabel, price: editTicketPackPrice })
    });
    setEditingTicketPackId(null);
  };

  const deleteTicketPack = async (id: number) => {
    await fetch(`/api/ticket_packs/${id}`, { method: 'DELETE' });
  };

  const isFormValid = userName && role && selectedMenuId;
  const showCanBeRep = ['消防士', '主任', '主査'].includes(role);

  const now = new Date();
  const isAfter20 = now.getHours() >= 20;

  const getOrderTotal = (o: Order) => {
    let price = o.price;
    if (o.ticket_purchase) {
      const pack = ticketPacks.find(p => p.label === o.ticket_purchase);
      if (pack) price += pack.price;
    }
    return price;
  };

  const totalAmount = orders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  const cashOrders = orders.filter(o => o.payment_method === 'cash');
  const ticketOrders = orders.filter(o => o.payment_method === 'ticket');
  
  const totalCashNeeded = cashOrders.reduce((sum, o) => sum + getOrderTotal(o), 0);
  const collectedCash = cashOrders.filter(o => o.paid).reduce((sum, o) => sum + getOrderTotal(o), 0);

  const collectedTickets = ticketOrders.filter(o => o.paid).length;

  const detailedOrderSummary = orders.reduce((acc, o) => {
    const key = o.option ? `${o.menu_name} [${o.option}]` : o.menu_name;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const ticketBreakdown = orders.reduce((acc, o) => {
    if (o.ticket_purchase) {
      acc[o.ticket_purchase] = (acc[o.ticket_purchase] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalTicketPurchaseCount = orders.filter(o => o.ticket_purchase).length;

  const changeSummary = orders.filter(o => o.payment_method === 'cash' && o.change_amount > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center">
        <div className="animate-pulse text-[#5A5A40] font-serif italic text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#1a1a1a] font-sans pb-12">
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
          <div className="bg-[#5A5A40] text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
            <AlertCircle size={24} className="text-orange-400" />
            <p className="font-bold">{notification}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-[#5A5A40]/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-full flex items-center justify-center text-white">
              <ShoppingBag size={20} />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-[#5A5A40]">お弁当注文管理くん</h1>
              <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold">
                <Clock size={10} />
                注文締切 09:30
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "p-2 rounded-full transition-all",
                showSettings ? "bg-[#5A5A40] text-white" : "text-[#5A5A40] hover:bg-[#5A5A40]/10"
              )}
            >
              <Settings size={20} />
            </button>
            <div className="text-right">
              <div className="text-xs text-[#5A5A40]/60 uppercase tracking-widest font-medium">Today's Date</div>
              <div className="font-mono text-sm">{new Date().toLocaleDateString('ja-JP')}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 mt-8 space-y-6">
        {/* Menu Settings */}
        {showSettings && (
          <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[#5A5A40]/10 animate-in slide-in-from-top duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-serif font-bold text-[#5A5A40] flex items-center gap-2">
                <Settings size={20} />
                メニュー設定
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-[#5A5A40]/40 hover:text-[#5A5A40]">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-8">
              {/* Menu Management */}
              <div>
                <h3 className="text-sm font-bold text-[#5A5A40] mb-3 border-b border-[#5A5A40]/10 pb-1">お弁当メニュー</h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    {menu.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        {editingMenuId === item.id ? (
                          <>
                            <input 
                              type="text" 
                              className="flex-1 px-3 py-1 rounded border text-sm"
                              value={editMenuName}
                              onChange={(e) => setEditMenuName(e.target.value)}
                            />
                            <input 
                              type="number" 
                              className="w-20 px-3 py-1 rounded border text-sm font-mono"
                              value={editMenuPrice}
                              onChange={(e) => setEditMenuPrice(Number(e.target.value))}
                            />
                            <button onClick={() => updateMenuItem(item.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                              <Save size={18} />
                            </button>
                            <button onClick={() => setEditingMenuId(null)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium">{item.name}</span>
                            <span className="text-sm font-mono text-[#5A5A40]/60">¥{item.price}</span>
                            <button 
                              onClick={() => {
                                setEditingMenuId(item.id);
                                setEditMenuName(item.name);
                                setEditMenuPrice(item.price);
                              }} 
                              className="p-2 text-[#5A5A40]/40 hover:text-[#5A5A40] hover:bg-white rounded-lg transition-all"
                            >
                              編集
                            </button>
                            <button 
                              onClick={() => deleteMenuItem(item.id)}
                              className="p-2 text-red-300 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="メニュー名"
                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm"
                        value={newMenuName}
                        onChange={(e) => setNewMenuName(e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="価格"
                        className="w-24 px-4 py-2 rounded-xl border border-gray-200 text-sm font-mono"
                        value={newMenuPrice || ''}
                        onChange={(e) => setNewMenuPrice(Number(e.target.value))}
                      />
                      <button 
                        onClick={addMenuItem}
                        className="bg-[#5A5A40] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-[#4A4A30]"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Options Management */}
              <div>
                <h3 className="text-sm font-bold text-[#5A5A40] mb-3 border-b border-[#5A5A40]/10 pb-1">オプション（大盛りなど）</h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    {options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        {editingOptionId === opt.id ? (
                          <>
                            <input 
                              type="text" 
                              className="flex-1 px-3 py-1 rounded border text-sm"
                              value={editOptionName}
                              onChange={(e) => setEditOptionName(e.target.value)}
                            />
                            <button onClick={() => updateOption(opt.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                              <Save size={18} />
                            </button>
                            <button onClick={() => setEditingOptionId(null)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium">{opt.name}</span>
                            <button 
                              onClick={() => {
                                setEditingOptionId(opt.id);
                                setEditOptionName(opt.name);
                              }} 
                              className="p-2 text-[#5A5A40]/40 hover:text-[#5A5A40] hover:bg-white rounded-lg transition-all"
                            >
                              編集
                            </button>
                            <button 
                              onClick={() => deleteOption(opt.id)}
                              className="p-2 text-red-300 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="オプション名"
                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm"
                        value={newOptionName}
                        onChange={(e) => setNewOptionName(e.target.value)}
                      />
                      <button 
                        onClick={addOption}
                        className="bg-[#5A5A40] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-[#4A4A30]"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ticket Packs Management */}
              <div>
                <h3 className="text-sm font-bold text-[#5A5A40] mb-3 border-b border-[#5A5A40]/10 pb-1">チケット購入設定</h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    {ticketPacks.map((pack) => (
                      <div key={pack.id} className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                        {editingTicketPackId === pack.id ? (
                          <>
                            <input 
                              type="text" 
                              className="flex-1 px-3 py-1 rounded border text-sm"
                              value={editTicketPackLabel}
                              onChange={(e) => setEditTicketPackLabel(e.target.value)}
                            />
                            <input 
                              type="number" 
                              className="w-20 px-3 py-1 rounded border text-sm font-mono"
                              value={editTicketPackPrice}
                              onChange={(e) => setEditTicketPackPrice(Number(e.target.value))}
                            />
                            <button onClick={() => updateTicketPack(pack.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                              <Save size={18} />
                            </button>
                            <button onClick={() => setEditingTicketPackId(null)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-medium">{pack.label}</span>
                            <span className="text-sm font-mono text-[#5A5A40]/60">¥{pack.price}</span>
                            <button 
                              onClick={() => {
                                setEditingTicketPackId(pack.id);
                                setEditTicketPackLabel(pack.label);
                                setEditTicketPackPrice(pack.price);
                              }} 
                              className="p-2 text-[#5A5A40]/40 hover:text-[#5A5A40] hover:bg-white rounded-lg transition-all"
                            >
                              編集
                            </button>
                            <button 
                              onClick={() => deleteTicketPack(pack.id)}
                              className="p-2 text-red-300 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="ラベル（例：6枚3300円）"
                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm"
                        value={newTicketPackLabel}
                        onChange={(e) => setNewTicketPackLabel(e.target.value)}
                      />
                      <input 
                        type="number" 
                        placeholder="価格"
                        className="w-24 px-4 py-2 rounded-xl border border-gray-200 text-sm font-mono"
                        value={newTicketPackPrice || ''}
                        onChange={(e) => setNewTicketPackPrice(Number(e.target.value))}
                      />
                      <button 
                        onClick={addTicketPack}
                        className="bg-[#5A5A40] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-[#4A4A30]"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Status Dashboard */}
        <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[#5A5A40]/5">
          <div className="grid grid-cols-2 gap-4">
            <div className={cn(
              "p-4 rounded-2xl border transition-all",
              status?.is_ordered ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Phone size={16} className={status?.is_ordered ? "text-emerald-600" : "text-orange-600"} />
                <span className="text-xs font-bold uppercase tracking-wider opacity-60">注文状況</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold">{status?.is_ordered ? "注文済み" : "未注文"}</span>
                <button 
                  onClick={() => updateStatus({ is_ordered: !status?.is_ordered })}
                  className="text-[10px] bg-white px-2 py-1 rounded-full border border-current shadow-sm hover:scale-105 transition-transform"
                >
                  切替
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#151619] text-white border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <User size={16} className="text-orange-400" />
                <span className="text-xs font-bold uppercase tracking-wider opacity-40">今日の担当</span>
              </div>
              <div className="font-bold text-lg">
                {status?.representative_name || (
                  <span className="text-white/20 italic text-sm">09:30に決定</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Order Form */}
        <section className="bg-white rounded-[32px] p-6 shadow-sm border border-[#5A5A40]/5">
          <h2 className="text-lg font-serif font-bold text-[#5A5A40] mb-4 flex items-center gap-2">
            <Plus size={20} />
            新しく注文する
          </h2>
          <form onSubmit={handleOrder} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1.5">お名前</label>
                <input 
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[#5A5A40]/10 focus:ring-2 focus:ring-[#5A5A40]/20 focus:outline-none transition-all"
                  placeholder="名前"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-1.5">役職選択</label>
                <select 
                  required
                  className="w-full px-4 py-3 rounded-xl border border-[#5A5A40]/10 focus:ring-2 focus:ring-[#5A5A40]/20 focus:outline-none transition-all bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="">選択してください</option>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {showCanBeRep && (
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-100 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-orange-600" />
                  <span className="text-sm font-bold text-orange-800">注文担当が可能ですか？</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCanBeRep(true)}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg font-bold text-xs transition-all shadow-sm",
                      canBeRep 
                        ? "bg-orange-500 text-white shadow-orange-200" 
                        : "bg-white text-orange-500 border border-orange-200 hover:bg-orange-50"
                    )}
                  >
                    可能
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanBeRep(false)}
                    className={cn(
                      "flex-1 py-2.5 rounded-lg font-bold text-xs transition-all shadow-sm",
                      !canBeRep 
                        ? "bg-[#5A5A40] text-white shadow-[#5A5A40]/20" 
                        : "bg-white text-[#5A5A40] border border-[#5A5A40]/10 hover:bg-gray-50"
                    )}
                  >
                    不可
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">お弁当を選択</label>
              <div className="grid grid-cols-2 gap-2">
                {menu.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedMenuId(item.id)}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left",
                      selectedMenuId === item.id 
                        ? "bg-[#5A5A40] text-white border-[#5A5A40] shadow-md" 
                        : "bg-white text-[#1a1a1a] border-[#5A5A40]/10 hover:border-[#5A5A40]/30"
                    )}
                  >
                    <span className="font-medium text-sm">{item.name}</span>
                    <span className={cn("font-mono text-xs", selectedMenuId === item.id ? "text-white/80" : "text-[#5A5A40]/60")}>
                      ¥{item.price}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">オプション選択</label>
              <div className="flex gap-2 flex-wrap">
                {options.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedOption(selectedOption === opt.name ? null : opt.name)}
                    className={cn(
                      "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                      selectedOption === opt.name ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#5A5A40] border-[#5A5A40]/10"
                    )}
                  >
                    {opt.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">チケット購入</label>
              <div className="flex gap-2 flex-wrap">
                {ticketPacks.map(pack => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setTicketPurchase(ticketPurchase === pack.label ? null : pack.label)}
                    className={cn(
                      "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                      ticketPurchase === pack.label ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-600 border-emerald-600/10"
                    )}
                  >
                    {pack.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">支払い方法</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all",
                      paymentMethod === 'cash' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#5A5A40] border-[#5A5A40]/10"
                    )}
                  >
                    現金
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ticket')}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all",
                      paymentMethod === 'ticket' ? "bg-[#5A5A40] text-white border-[#5A5A40]" : "bg-white text-[#5A5A40] border-[#5A5A40]/10"
                    )}
                  >
                    チケット
                  </button>
                </div>
              </div>
              {paymentMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">おつり</label>
                  <input 
                    type="number"
                    className="w-full px-4 py-3 rounded-xl border border-[#5A5A40]/10 focus:ring-2 focus:ring-[#5A5A40]/20 focus:outline-none transition-all"
                    placeholder="金額"
                    value={changeAmount || ''}
                    onChange={(e) => setChangeAmount(Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider opacity-60 mb-2">自由記載欄</label>
              <textarea 
                className="w-full px-4 py-3 rounded-xl border border-[#5A5A40]/10 focus:ring-2 focus:ring-[#5A5A40]/20 focus:outline-none transition-all bg-white"
                placeholder="備考などあれば記入してください"
                rows={2}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <div className="pt-2">
              {!isFormValid && (
                <p className="text-red-500 text-xs font-bold mb-2 text-center animate-pulse">
                  必須項目が未選択です
                </p>
              )}
              <button 
                type="submit"
                disabled={!isFormValid}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-xl font-bold shadow-lg shadow-[#5A5A40]/20 hover:bg-[#4A4A30] disabled:opacity-50 disabled:shadow-none transition-all"
              >
                注文を確定する
              </button>
            </div>
          </form>
        </section>

        {/* Order List */}
        {!isAfter20 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-serif font-bold text-[#5A5A40]">注文一覧</h2>
              <span className="text-xs font-mono text-[#5A5A40]/60">{orders.length} orders</span>
            </div>

            {orders.length > 0 && (
              <div className="bg-[#151619] text-white rounded-[32px] p-6 shadow-xl space-y-6">
                <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest opacity-50">お弁当の注文数：</div>
                    <div className="text-2xl font-mono font-bold text-orange-400">{orders.length}個</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest opacity-50">チケット購入数：</div>
                    <div className="text-2xl font-mono font-bold text-emerald-400">{totalTicketPurchaseCount}個</div>
                    {Object.keys(ticketBreakdown).length > 0 && (
                      <div className="text-[10px] text-emerald-400/80 font-bold mt-1">
                        {Object.entries(ticketBreakdown).map(([label, count], idx) => (
                          <span key={label}>
                            {idx > 0 && ", "}
                            {label.split('枚')[0]}枚：{count}個
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3">お弁当の種類・個数：</h3>
                  <div className="space-y-2">
                    {Object.entries(detailedOrderSummary).map(([name, count]) => (
                      <div key={name} className="flex justify-between items-center border-b border-white/10 pb-1">
                        <span className="text-sm text-white/80">{name}</span>
                        <span className="font-mono font-bold">{count}個</span>
                      </div>
                    ))}
                  </div>
                </div>

                {changeSummary.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest opacity-50 mb-3">おつりが必要な人：</h3>
                    <div className="space-y-2">
                      {changeSummary.map((o) => (
                        <div key={o.id} className="flex justify-between items-center border-b border-white/10 pb-1">
                          <span className="text-sm text-white/80">{o.user_name}</span>
                          <span className="font-mono font-bold text-red-400">¥{o.change_amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              {orders.length === 0 ? (
                <div className="bg-white/50 border border-dashed border-[#5A5A40]/20 rounded-2xl p-8 text-center text-[#5A5A40]/40 italic">
                  まだ注文はありません
                </div>
              ) : (
                orders.map((order) => (
                  <div 
                    key={order.id}
                    className={cn(
                      "bg-white rounded-2xl p-4 flex items-center justify-between border transition-all",
                      order.paid ? "border-emerald-100 bg-emerald-50/30" : "border-[#5A5A40]/5"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => togglePaid(order.id, order.paid)}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                          order.paid 
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                            : "bg-white border-2 border-[#5A5A40]/10 text-[#5A5A40]/20 hover:border-emerald-200 hover:text-emerald-200"
                        )}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#1a1a1a]">{order.user_name}</span>
                          <span className="text-[10px] text-[#5A5A40]/40 font-medium">({order.role})</span>
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase",
                            order.payment_method === 'cash' ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"
                          )}>
                            {order.payment_method === 'cash' ? '現金' : 'チケット'}
                          </span>
                        </div>
                        <div className="text-xs text-[#5A5A40]/60 flex flex-wrap gap-x-3 gap-y-1 mt-1">
                          <span className="font-medium text-[#1a1a1a]">{order.menu_name}</span>
                          <span className="font-mono">¥{order.price}</span>
                          {order.option && <span className="text-orange-600 font-bold">[{order.option}]</span>}
                          {order.ticket_purchase && <span className="text-emerald-600 font-bold">[{order.ticket_purchase}]</span>}
                          {order.payment_method === 'cash' && order.change_amount > 0 && (
                            <span className="text-red-500 font-bold">おつり: ¥{order.change_amount}</span>
                          )}
                        </div>
                        {order.memo && (
                          <div className="mt-2 p-2 rounded-lg bg-[#5A5A40]/5 text-xs text-[#5A5A40] italic border-l-2 border-[#5A5A40]/20">
                            {order.memo}
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteOrder(order.id)}
                      className="p-2 text-[#5A5A40]/20 hover:text-red-400 transition-colors"
                      title="注文を削除"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="max-w-2xl mx-auto px-4 mt-12 pt-8 border-t border-[#5A5A40]/10 text-center space-y-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#5A5A40]/40 font-bold">
          Bento Order Management System
        </div>
        <div className="text-[10px] text-[#5A5A40]/30 font-medium">
          Created By TATSUYA YOSHIZAWA , GoogleAISudio , GitHub
        </div>
      </footer>
    </div>
  );
}
