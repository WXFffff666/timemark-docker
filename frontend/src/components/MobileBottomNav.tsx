import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Bell, Calendar, Settings, CheckSquare } from 'lucide-react';

const items = [
  { path: '/dashboard', icon: Home, label: '首页' },
  { path: '/calendar', icon: Calendar, label: '日历' },
  { path: '/todos', icon: CheckSquare, label: '待办' },
  { path: '/reminders', icon: Bell, label: '提醒' },
  { path: '/settings', icon: Settings, label: '设置' },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-white/10 bg-white/80 dark:bg-slate-900/90 backdrop-blur flex justify-around py-2" aria-label="主导航">
      {items.map(({ path, icon: Icon, label }) => {
        const active = location.pathname === path;
        return (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 text-xs px-2 min-h-11 min-w-11 justify-center ${active ? 'text-blue-600' : 'text-slate-500'}`}
          >
            <Icon className="w-5 h-5" aria-hidden />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
