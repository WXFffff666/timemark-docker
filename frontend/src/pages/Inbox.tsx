import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Inbox as InboxIcon, ArrowLeft, Trash2, RefreshCw, Mail, MailOpen, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const itemVariants = { hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };

interface InboxMessage {
  id: number;
  title: string;
  body: string;
  source: string;
  channel: string | null;
  sender_label: string | null;
  is_read: boolean;
  created_at: string;
}

const sourceLabels: Record<string, string> = {
  inbound: '外部推送',
  notification: '提醒通知',
  broadcast: '广播',
};

import { formatRelativeTime } from '@/lib/format-time';

export default function Inbox() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const res = await api.getRaw<InboxMessage[]>('/inbox?limit=100');
      setMessages(res.data || []);
      setTotal((res.pagination?.total as number) || 0);
      setUnreadCount((res.pagination?.unreadCount as number) || 0);
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const markRead = async (id: number) => {
    try {
      await api.patch(`/inbox/${id}/read`, {});
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, is_read: true } : m)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Failed to mark read:', error);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.post('/inbox/read-all', {});
      setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all read:', error);
    } finally {
      setMarkingAll(false);
    }
  };

  const deleteMessage = async (id: number) => {
    if (!confirm('确定删除此消息？')) return;
    try {
      await api.delete(`/inbox/${id}`);
      const removed = messages.find((m) => m.id === id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (removed && !removed.is_read) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen pb-24">
      <header className="sticky top-6 z-40 px-4 max-w-4xl mx-auto">
        <div className="glass-panel rounded-full px-6 py-3.5 flex justify-between items-center ring-1 ring-black/5 dark:ring-white/10 shadow-sm">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}><ArrowLeft size={20} /></Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                收件箱
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="scale-90">{unreadCount}</Badge>
                )}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">共 {total} 条消息</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="rounded-full" onClick={markAllRead} disabled={markingAll || unreadCount === 0}>
              <CheckCheck size={16} className="mr-1" />
              全部已读
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={fetchMessages} disabled={loading}>
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-10 mt-2">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass-panel rounded-[2.5rem] p-6 animate-pulse">
                <div className="flex gap-6">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-slate-200/60 dark:bg-slate-700/50"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-slate-200/60 dark:bg-slate-700/50 rounded-full w-1/3 mb-3"></div>
                    <div className="h-4 bg-slate-200/60 dark:bg-slate-700/50 rounded-full w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 glass-panel rounded-[2.5rem] ring-1 ring-black/5 dark:ring-white/10">
            <InboxIcon size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">收件箱为空</h3>
            <p className="text-slate-500 dark:text-slate-400">外部系统通过收件 API 推送的消息将显示在此处（不含您自己发出的提醒）</p>
          </div>
        ) : (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="relative">
            <div className="absolute left-[2.25rem] top-8 bottom-8 w-px bg-gradient-to-b from-primary-500/40 via-slate-200 dark:via-slate-700 to-transparent z-0"></div>
            <div className="space-y-6 relative z-10">
              {messages.map((msg) => (
                <motion.div key={msg.id} variants={itemVariants} className="flex gap-6 items-start">
                  <div className={`w-16 h-16 rounded-[1.5rem] shrink-0 flex items-center justify-center shadow-md border backdrop-blur-md ${msg.is_read ? 'bg-white/90 dark:bg-slate-800/90 text-slate-400 border-white/60 dark:border-white/10' : 'bg-primary-50/90 dark:bg-primary-900/40 text-primary-600 border-primary-100 dark:border-primary-800/50'}`}>
                    {msg.is_read ? <MailOpen size={26} /> : <Mail size={26} />}
                  </div>
                  <div className={`glass-panel rounded-[2.5rem] p-6 flex-1 hover:shadow-xl transition-all ring-1 ring-black/5 dark:ring-white/10 ${!msg.is_read ? 'ring-primary-200/50 dark:ring-primary-800/30' : ''}`}>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                            {msg.title}
                          </h3>
                          {!msg.is_read && <Badge variant="default" className="scale-90">未读</Badge>}
                          <Badge variant="outline" className="scale-90">{sourceLabels[msg.source] || msg.source}</Badge>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap break-words line-clamp-4">{msg.body}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {msg.sender_label && <span>来自 {msg.sender_label}</span>}
                          {msg.channel && <span>渠道 {msg.channel}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-sm font-bold text-slate-400 whitespace-nowrap bg-slate-100/50 dark:bg-slate-800/50 px-3 py-1 rounded-lg">
                          {formatRelativeTime(msg.created_at)}
                        </div>
                        <div className="flex gap-1">
                          {!msg.is_read && (
                            <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => markRead(msg.id)}>
                              标为已读
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="rounded-full text-xs text-red-500" onClick={() => deleteMessage(msg.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </motion.div>
  );
}
