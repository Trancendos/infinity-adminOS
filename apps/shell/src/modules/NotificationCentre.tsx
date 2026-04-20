import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../providers/BackendProvider';

interface Notification {
  id: string; title: string; body: string; priority: string;
  source_module?: string; read_at?: string; is_read: boolean; created_at: string;
}

const PRIORITY_STYLES: Record<string, { bg: string; icon: string; border: string }> = {
  urgent: { bg: 'bg-red-500/10', icon: '🚨', border: 'border-red-500/30' },
  high: { bg: 'bg-orange-500/10', icon: '⚠️', border: 'border-orange-500/30' },
  normal: { bg: 'bg-white/5', icon: '📬', border: 'border-white/10' },
  low: { bg: 'bg-white/3', icon: '💤', border: 'border-white/5' },
};

function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCentre() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unread, setUnread] = useState(0);
  const [urgent, setUrgent] = useState(0);
  const { connect, on, connected } = useWebSocket();

  useEffect(() => { 
    load(); 
    count(); 
    connect();
    
    // Listen for real-time notifications
    const unsubscribe = on('notification.new', (msg: any) => {
      const newNotif = msg.notification;
      setNotifications(prev => [newNotif, ...prev]);
      setUnread(c => c + 1);
      if (newNotif.priority === 'urgent') {
        setUrgent(c => c + 1);
      }
      
      // Show browser notification for urgent notifications
      if (newNotif.priority === 'urgent' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(newNotif.title, {
          body: newNotif.body,
          icon: newNotif.icon_url || '/favicon.ico'
        });
      }
    });
    
    return unsubscribe;
  }, [filter, connect, on]);

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('infinity_access_token');
      const params = new URLSearchParams({ limit: '100' });
      if (filter === 'unread') params.set('unread_only', 'true');
      const r = await fetch(`/api/v1/notifications?${params}`, { 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (r.ok) setNotifications(await r.json());
    } catch (e) {
      console.error('Failed to load notifications:', e);
    }
    setLoading(false);
  }

  async function count() {
    try {
      const token = localStorage.getItem('infinity_access_token');
      const r = await fetch('/api/v1/notifications/count', { 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (r.ok) { const d = await r.json(); setUnread(d.unread); setUrgent(d.urgent); }
    } catch (e) {
      console.error('Failed to get notification count:', e);
    }
  }

  async function markRead(id: string) {
    try {
      const token = localStorage.getItem('infinity_access_token');
      await fetch(`/api/v1/notifications/${id}/read`, { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
      setUnread(c => Math.max(0, c - 1));
    } catch (e) {
      console.error('Failed to mark notification read:', e);
    }
  }

  async function markAllRead() {
    try {
      const token = localStorage.getItem('infinity_access_token');
      await fetch('/api/v1/notifications/read-all', { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      setNotifications(p => p.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
      setUnread(0); setUrgent(0);
    } catch (e) {
      console.error('Failed to mark all read:', e);
    }
  }

  async function del(id: string) {
    try {
      const token = localStorage.getItem('infinity_access_token');
      await fetch(`/api/v1/notifications/${id}`, { 
        method: 'DELETE', 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      setNotifications(p => p.filter(n => n.id !== id));
    } catch (e) {
      console.error('Failed to delete notification:', e);
    }
  }

  async function clearRead() {
    try {
      const token = localStorage.getItem('infinity_access_token');
      await fetch('/api/v1/notifications/', { 
        method: 'DELETE', 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      setNotifications(p => p.filter(n => !n.is_read));
    } catch (e) {
      console.error('Failed to clear read notifications:', e);
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-900 text-white">
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">🔔 Notifications</h2>
            {unread > 0 && <span className="px-2 py-0.5 bg-purple-600 rounded-full text-xs font-bold">{unread}</span>}
            {urgent > 0 && <span className="px-2 py-0.5 bg-red-600 rounded-full text-xs font-bold">🚨 {urgent}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={markAllRead} disabled={unread === 0} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-xs disabled:opacity-30">✓ Mark all read</button>
            <button onClick={clearRead} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-xs">🗑️ Clear read</button>
          </div>
        </div>
        <div className="flex gap-2">
          {(['all', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded text-xs font-medium transition ${filter === f ? 'bg-purple-600' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}>
              {f === 'all' ? '📥 All' : '📩 Unread'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 text-white/40"><p className="text-5xl mb-3">🔕</p><p>{filter === 'unread' ? 'All caught up!' : 'No notifications'}</p></div>
        ) : (
          <div className="divide-y divide-white/5">
            {notifications.map(n => {
              const s = PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.normal;
              return (
                <div key={n.id} className={`flex items-start gap-3 p-4 ${s.bg} ${!n.is_read ? 'border-l-2 ' + s.border : ''} hover:bg-white/5 transition cursor-pointer`}
                  onClick={() => !n.is_read && markRead(n.id)}>
                  <span className="text-xl flex-shrink-0">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`font-medium text-sm ${n.is_read ? 'text-white/60' : ''}`}>{n.title}</span>
                      {!n.is_read && <span className="w-2 h-2 bg-purple-500 rounded-full" />}
                    </div>
                    <p className={`text-xs ${n.is_read ? 'text-white/30' : 'text-white/50'} line-clamp-2`}>{n.body}</p>
                    <div className="flex gap-3 mt-1.5 text-xs text-white/20">
                      <span>{timeAgo(n.created_at)}</span>
                      {n.source_module && <span>from {n.source_module}</span>}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); del(n.id); }} className="text-white/20 hover:text-red-400 text-xs p-1">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
