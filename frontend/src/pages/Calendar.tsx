import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { useEventStore } from '@/stores/event.store';
import type { Event } from '@timemark/shared';
import {
  dateKey,
  pad,
  groupEventsByDate,
  eventTypeLabel,
  daysUntilEvent,
} from '@/lib/calendar-utils';
import { getTodayDateKey } from '@/lib/timezone-utils';
import { useTimezone } from '@/components/RealtimeClock';

type ViewMode = 'year' | 'month' | 'day';
type ListScope = 'month' | 'year';

export default function Calendar() {
  const navigate = useNavigate();
  const { events, fetchEvents } = useEventStore();
  const { timezone } = useTimezone();
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [listScope, setListScope] = useState<ListScope>('month');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKey(new Date()));

  useEffect(() => {
    if (events.length === 0) fetchEvents();
  }, [events.length, fetchEvents]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todayKey = getTodayDateKey(timezone);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const selectDate = (d: Date) => {
    const key = dateKey(d);
    setSelectedKey(key);
    setCursor(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  };

  const goPrev = () => {
    if (viewMode === 'year') setCursor(new Date(year - 1, 0, 1));
    else if (viewMode === 'month') setCursor(new Date(year, month - 1, 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1));
  };

  const goNext = () => {
    if (viewMode === 'year') setCursor(new Date(year + 1, 0, 1));
    else if (viewMode === 'month') setCursor(new Date(year, month + 1, 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1));
  };

  const headerLabel = () => {
    if (viewMode === 'year') return `${year}年`;
    if (viewMode === 'day') {
      const d = parseSelectedDate(selectedKey);
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return `${year}年${month + 1}月`;
  };

  const listEvents = useMemo(() => {
    if (listScope === 'year') {
      return events
        .filter((e) => e.date.startsWith(`${year}-`))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return events
      .filter((e) => e.date.startsWith(`${year}-${pad(month + 1)}`))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, listScope, year, month]);

  const selectedEvents = eventsByDate.get(selectedKey) || [];

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-4 z-40 px-4 max-w-4xl mx-auto space-y-2">
        <div className="glass-panel rounded-full px-4 py-3 flex items-center justify-between ring-1 ring-black/5 dark:ring-white/10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </Button>
            <h1 className="text-lg font-bold truncate">日历</h1>
          </div>
          <div className="flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0">
            {(['year', 'month', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setViewMode(v);
                  if (v === 'day') setSelectedKey(dateKey(cursor));
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition ${
                  viewMode === v
                    ? 'bg-white dark:bg-slate-700 shadow text-primary-600'
                    : 'text-slate-500'
                }`}
              >
                {v === 'year' ? '年' : v === 'month' ? '月' : '日'}
              </button>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-full px-3 py-2 flex items-center justify-between ring-1 ring-black/5 dark:ring-white/10">
          <Button variant="ghost" size="icon" onClick={goPrev}>
            <ChevronLeft size={18} />
          </Button>
          <button
            type="button"
            className="text-sm font-semibold hover:text-primary-600"
            onClick={() => {
              const now = new Date();
              selectDate(now);
              if (viewMode === 'year') setCursor(new Date(now.getFullYear(), 0, 1));
              else if (viewMode === 'month') setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            {headerLabel()}
          </button>
          <Button variant="ghost" size="icon" onClick={goNext}>
            <ChevronRight size={18} />
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {viewMode === 'year' && (
          <YearGrid
            year={year}
            eventsByDate={eventsByDate}
            selectedKey={selectedKey}
            onSelectMonth={(m) => {
              setCursor(new Date(year, m, 1));
              setViewMode('month');
            }}
          />
        )}

        {viewMode === 'month' && (
          <MonthGrid
            year={year}
            month={month}
            eventsByDate={eventsByDate}
            selectedKey={selectedKey}
            todayKey={todayKey}
            onSelectDate={(d) => {
              selectDate(d);
            }}
            onDayOpen={(d) => {
              selectDate(d);
              setViewMode('day');
            }}
          />
        )}

        {viewMode === 'day' && (
          <DayPanel
            dateKey={selectedKey}
            events={selectedEvents}
            todayKey={todayKey}
            timeZone={timezone}
          />
        )}

        {/* 选中日详情（月/年视图显示；日视图已在 DayPanel） */}
        {viewMode !== 'day' && selectedEvents.length > 0 && (
          <section className="glass-panel rounded-2xl p-4 ring-1 ring-primary-200/50 dark:ring-primary-800/30">
            <h2 className="text-sm font-bold text-primary-600 mb-2">{selectedKey} · {selectedEvents.length} 个事件</h2>
            <EventListCompact events={selectedEvents} />
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              {listScope === 'month' ? '本月事件' : '本年事件'}
            </h2>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1 ${listScope === 'month' ? 'bg-primary-500 text-white' : 'bg-transparent text-slate-500'}`}
                onClick={() => setListScope('month')}
              >
                本月
              </button>
              <button
                type="button"
                className={`px-3 py-1 ${listScope === 'year' ? 'bg-primary-500 text-white' : 'bg-transparent text-slate-500'}`}
                onClick={() => setListScope('year')}
              >
                本年
              </button>
            </div>
          </div>
          {listEvents.length === 0 ? (
            <p className="text-sm text-slate-500 px-1">
              {listScope === 'month' ? '本月暂无事件' : '本年暂无事件'}
            </p>
          ) : (
            <EventListCompact events={listEvents} showDate />
          )}
        </section>

        <div className="text-center">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/todos')}>
            查看近期待办
          </Button>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}

function parseSelectedDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function YearGrid({
  year,
  eventsByDate,
  selectedKey,
  onSelectMonth,
}: {
  year: number;
  eventsByDate: Map<string, Event[]>;
  selectedKey: string;
  onSelectMonth: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {Array.from({ length: 12 }, (_, m) => {
        const prefix = `${year}-${pad(m + 1)}`;
        let count = 0;
        for (const [k, list] of eventsByDate) {
          if (k.startsWith(prefix)) count += list.length;
        }
        const hasSelected = selectedKey.startsWith(prefix);
        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMonth(m)}
            className={`glass-panel rounded-2xl p-3 text-left hover:ring-2 hover:ring-primary-300/50 transition min-h-[5rem] ${
              hasSelected ? 'ring-2 ring-primary-400' : ''
            }`}
          >
            <p className="font-bold text-sm">{m + 1}月</p>
            <p className="text-xs text-slate-500 mt-1">{count > 0 ? `${count} 个事件` : '无事件'}</p>
            {count > 0 && (
              <div className="flex gap-0.5 mt-2 flex-wrap">
                {Array.from({ length: Math.min(count, 5) }).map((_, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MonthGrid({
  year,
  month,
  eventsByDate,
  selectedKey,
  todayKey,
  onSelectDate,
  onDayOpen,
}: {
  year: number;
  month: number;
  eventsByDate: Map<string, Event[]>;
  selectedKey: string;
  todayKey: string;
  onSelectDate: (d: Date) => void;
  onDayOpen: (d: Date) => void;
}) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="glass-panel rounded-3xl p-4 ring-1 ring-black/5 dark:ring-white/10">
      <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-semibold text-slate-500">
        {['日', '一', '二', '三', '四', '五', '六'].map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="min-h-[4.5rem]" />;
          const key = dateKey(day);
          const dayEvents = eventsByDate.get(key) || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(day)}
              onDoubleClick={() => onDayOpen(day)}
              className={`min-h-[4.5rem] rounded-xl p-1.5 border text-xs text-left transition hover:ring-2 hover:ring-primary-300/60 ${
                isSelected
                  ? 'ring-2 ring-primary-500 border-primary-400 bg-primary-50/90 dark:bg-primary-900/30'
                  : isToday
                    ? 'border-primary-500/60 bg-primary-50/50 dark:bg-primary-900/15'
                    : 'border-transparent bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className={`font-bold mb-0.5 ${isToday ? 'text-primary-600' : ''}`}>{day.getDate()}</div>
              {dayEvents.slice(0, 2).map((e) => (
                <div
                  key={e.id}
                  className="truncate text-[10px] px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200"
                >
                  {e.name}
                </div>
              ))}
              {dayEvents.length > 2 && (
                <div className="text-[10px] text-slate-400">+{dayEvents.length - 2}</div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-2 text-center">单击选日期 · 双击进入日视图</p>
    </div>
  );
}

function DayPanel({
  dateKey: key,
  events,
  todayKey,
  timeZone,
}: {
  dateKey: string;
  events: Event[];
  todayKey: string;
  timeZone: string;
}) {
  const d = parseSelectedDate(key);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const isToday = key === todayKey;
  const diff = daysUntilEvent(key, new Date(), timeZone);

  return (
    <div className="glass-panel rounded-3xl p-6 ring-1 ring-black/5 dark:ring-white/10 text-center">
      <p className="text-sm text-slate-500">星期{weekdays[d.getDay()]}</p>
      <p className={`text-5xl font-bold mt-1 ${isToday ? 'text-primary-600' : ''}`}>{d.getDate()}</p>
      <p className="text-lg text-slate-600 dark:text-slate-300 mt-1">
        {d.getFullYear()}年{d.getMonth() + 1}月
      </p>
      {diff === 0 && <p className="text-sm text-primary-600 font-medium mt-2">今天</p>}
      {diff > 0 && <p className="text-sm text-slate-500 mt-2">{diff} 天后</p>}
      <div className="mt-6 text-left space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">当天暂无事件</p>
        ) : (
          <EventListCompact events={events} />
        )}
      </div>
    </div>
  );
}

function EventListCompact({ events, showDate }: { events: Event[]; showDate?: boolean }) {
  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="glass-panel rounded-2xl px-4 py-3 flex justify-between items-center gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{e.name}</p>
            <p className="text-xs text-slate-500">
              {showDate ? `${e.date.slice(0, 10)} · ` : ''}
              {eventTypeLabel(e.type)}
            </p>
          </div>
          <span className="text-xs text-slate-400 shrink-0">
            {e.calendarType === 'lunar' ? '农历' : e.calendarType === 'both' ? '双历' : '公历'}
          </span>
        </div>
      ))}
    </div>
  );
}
