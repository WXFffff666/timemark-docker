import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import { useEventStore } from '@/stores/event.store';
import { Button } from '@/components/ui/button';
import { EventCard } from '@/components/events/EventCard';
import { EventForm } from '@/components/events/EventForm';
import { PlusIcon, SettingsIcon, BellIcon } from '@/components/icons';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RealtimeClock } from '@/components/RealtimeClock';
import type { Event, CreateEventRequest } from '@timemark/shared';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { events, loading, fetchEvents, createEvent, updateEvent, deleteEvent, testSendEvent } = useEventStore();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | undefined>();

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSubmit = async (data: CreateEventRequest) => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, data);
    } else {
      await createEvent(data);
    }
    setEditingEvent(undefined);
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除此事件？')) {
      await deleteEvent(id);
      setShowForm(false);
      setEditingEvent(undefined);
    }
  };

  const handleTestSend = async (id: string) => {
    try {
      await testSendEvent(id);
      alert('测试通知已发送！');
    } catch (error) {
      alert('发送失败，请检查通知渠道配置');
    }
  };

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            倒计时提醒系统
          </h1>
          <div className="flex items-center gap-3">
            <RealtimeClock />
            <ThemeToggle />
            <Button variant="ghost" className="w-10 h-10 p-0" onClick={() => navigate('/reminders')}>
              <BellIcon size={20} />
            </Button>
            <Button variant="ghost" className="w-10 h-10 p-0" onClick={() => navigate('/settings')}>
              <SettingsIcon size={20} />
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400">欢迎, {user?.username}</span>
            <Button variant="outline" onClick={logout}>退出</Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">我的事件</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">共 {events.length} 个事件</p>
          </div>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-6 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 glass rounded-2xl">
            <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <PlusIcon size={32} className="text-primary-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400">暂无事件，点击右下角按钮开始添加</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {events.map((event) => (
              <motion.div key={event.id} variants={itemVariants}>
                <EventCard event={event} onEdit={handleEdit} onDelete={handleDelete} onTestSend={handleTestSend} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
      <motion.div
        className="fixed bottom-8 right-8 z-40"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          variant="gradient"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => { setEditingEvent(undefined); setShowForm(true); }}
        >
          <PlusIcon size={24} />
        </Button>
      </motion.div>
      <EventForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditingEvent(undefined); }}
        onSubmit={handleSubmit}
        event={editingEvent}
      />
    </div>
  );
}
