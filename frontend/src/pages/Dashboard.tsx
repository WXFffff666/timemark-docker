import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { useEventStore } from '@/stores/event.store';
import { Button } from '@/components/ui/button';
import { EventCard } from '@/components/events/EventCard';
import { EventForm } from '@/components/events/EventForm';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RealtimeClock } from '@/components/RealtimeClock';
import { TimezoneSelector } from '@/components/TimezoneSelector';
import type { Event, CreateEventRequest } from '@timemark/shared';
import { Settings, Bell, Plus, Download, Calendar } from 'lucide-react';

const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } };

export function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { events, loading, fetchEvents, createEvent, updateEvent, deleteEvent, deleteEventsBatch, testSendEvent } = useEventStore();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>();
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleSubmit = async (data: CreateEventRequest) => {
    if (editingEvent) await updateEvent(editingEvent.id, data);
    else await createEvent(data);
    setEditingEvent(undefined);
  };

  const handleEdit = (event: Event) => { setEditingEvent(event); setShowForm(true); };
  const handleDelete = async (id: string) => { if (confirm('确定删除此事件？')) { await deleteEvent(id); setShowForm(false); setEditingEvent(undefined); } };
  const handleTestSend = async (id: string) => { try { await testSendEvent(id); alert('测试通知已发送！'); } catch (error) { alert('发送失败，请检查通知渠道配置'); } };
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      if (confirm(`确定批量删除 ${selectedIds.length} 个事件？`)) {
        const deletedCount = await deleteEventsBatch(selectedIds);
        alert(`成功删除 ${deletedCount} 个事件`);
        setSelectedIds([]);
        setBatchMode(false);
      }
    } catch (error) {
      console.error('Batch delete error:', error);
      alert('批量删除失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  const handleExportCalendar = async (format: 'ics' | 'google' | 'apple') => {
    try {
      if (format === 'ics') {
        // Download ICS file
        const response = await fetch('/api/calendar/export.ics', {
          credentials: 'include',
        });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'timemark-events.ics';
        a.click();
        window.URL.revokeObjectURL(url);
      } else if (format === 'google') {
        // Open Google Calendar links
        const response = await fetch('/api/calendar/google', {
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success && data.data?.length > 0) {
          window.open(data.data[0].link, '_blank');
        } else {
          alert('没有可导出的事件');
        }
      } else if (format === 'apple') {
        // Subscribe to Apple Calendar
        const response = await fetch('/api/calendar/apple', {
          credentials: 'include',
        });
        const data = await response.json();
        if (data.success) {
          window.open(data.data.subscribeUrl, '_blank');
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('导出失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen pb-24">
      <header className="sticky top-4 z-50 px-4 max-w-7xl mx-auto">
        <div className="glass-panel rounded-full px-6 py-3 flex justify-between items-center ring-1 ring-white/20 dark:ring-white/10">
          <div className="flex items-center gap-4 alive-interactive" onClick={() => navigate('/dashboard')}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-500 to-purple-500 flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">T</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 hidden md:block tracking-tight">TimeMark</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-3 bg-white/30 dark:bg-black/30 backdrop-blur-md rounded-full px-4 py-1.5 shadow-inner">
              <RealtimeClock />
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-600"></div>
              <TimezoneSelector />
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/channels')}>
                <Bell size={20} className="text-slate-600 dark:text-slate-300" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full" title="导出 ICS" onClick={() => handleExportCalendar('ics')}>
                <Download size={20} className="text-slate-600 dark:text-slate-300" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate('/settings')}>
                <Settings size={20} className="text-slate-600 dark:text-slate-300" />
              </Button>
              <ThemeToggle />
            </div>
            <div className="h-8 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">{user?.username}</span>
              <Button variant="outline" size="sm" className="rounded-full border-slate-300/50 dark:border-slate-600/50" onClick={logout}>退出</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 mt-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">我的倒计时</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">共有 {events.length} 个正在追踪的事件</p>
          </div>
          <div className="flex items-center gap-3 glass px-2 py-2 rounded-2xl ring-1 ring-white/20">
            <Button variant={batchMode ? "secondary" : "ghost"} className="rounded-xl transition-all" onClick={() => { setBatchMode(!batchMode); setSelectedIds([]); }}>
              {batchMode ? '取消批量操作' : '批量管理'}
            </Button>
            <AnimatePresence>
              {batchMode && (
                <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden">
                  <Button variant="destructive" className="rounded-xl whitespace-nowrap" onClick={handleBatchDelete} disabled={selectedIds.length === 0}>
                    删除已选 ({selectedIds.length})
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="glass rounded-3xl p-6 animate-pulse h-48">
                <div className="h-5 bg-slate-300/50 dark:bg-slate-700/50 rounded-full w-2/3 mb-6"></div>
                <div className="h-12 bg-slate-300/50 dark:bg-slate-700/50 rounded-2xl w-full mb-4"></div>
                <div className="h-4 bg-slate-300/50 dark:bg-slate-700/50 rounded-full w-1/3"></div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24 glass-panel rounded-3xl ring-1 ring-white/20">
            <div className="w-20 h-20 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Plus size={40} className="text-primary-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">暂无倒计时事件</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">点击右下角的按钮创建一个新的重要时刻</p>
            <Button variant="vision" onClick={() => { setEditingEvent(undefined); setShowForm(true); }}>立即创建</Button>
          </div>
        ) : (
          <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" variants={containerVariants} initial="hidden" animate="visible">
            {events.map((event) => (
              <motion.div key={event.id} variants={itemVariants}>
                <EventCard event={event} onEdit={handleEdit} onDelete={handleDelete} onTestSend={handleTestSend} selectable={batchMode} selected={selectedIds.includes(event.id)} onSelectToggle={(id, checked) => { setSelectedIds((prev) => checked ? [...prev, id] : prev.filter((item) => item !== id)); }} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <motion.div className="fixed bottom-10 right-10 z-40" whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
        <Button 
          variant="vision" 
          className="h-16 w-16 rounded-[1.5rem] shadow-2xl shadow-primary-600/50 flex items-center justify-center p-0 bg-gradient-to-br from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600" 
          onClick={() => { setEditingEvent(undefined); setShowForm(true); }}
        >
          <Plus size={28} className="text-white" />
        </Button>
      </motion.div>
      
      <EventForm open={showForm} onClose={() => { setShowForm(false); setEditingEvent(undefined); }} onSubmit={handleSubmit} event={editingEvent} />
    </motion.div>
  );
}
