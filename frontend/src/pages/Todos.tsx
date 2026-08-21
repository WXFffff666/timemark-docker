import { useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { ArrowLeft, CalendarClock, CheckCircle2, Circle, History } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { MobileBottomNav } from '@/components/MobileBottomNav';

import { useEventStore } from '@/stores/event.store';

import { useTodoCompletions } from '@/hooks/useTodoCompletions';

import {

  daysUntilEvent,

  eventTypeLabel,

  getTodoEvents,

  isEventInTodoWindow,

  resolveNextOccurrenceDate,

  todoCompletionKey,

} from '@/lib/calendar-utils';
import { useTimezone } from '@/components/RealtimeClock';
import type { Event } from '@timemark/shared';



function formatCompletedAt(iso: string) {

  try {

    return new Date(iso).toLocaleString('zh-CN', { hour12: false });

  } catch {

    return iso;

  }

}



export default function Todos() {

  const navigate = useNavigate();

  const [tab, setTab] = useState<'active' | 'history'>('active');

  const { events, fetchEvents } = useEventStore();
  const { timezone } = useTimezone();

  const { completions, completedKeys, isCompleted, toggleComplete } = useTodoCompletions();



  useEffect(() => {

    if (events.length === 0) fetchEvents();

  }, [events.length, fetchEvents]);



  const eventById = useMemo(() => new Map(events.map((e) => [Number(e.id), e])), [events]);



  const allInWindow = useMemo(
    () => events.filter((e) => isEventInTodoWindow(e, new Date(), timezone)),
    [events, timezone],
  );

  const pending = useMemo(
    () => getTodoEvents(events, new Date(), completedKeys, timezone),
    [events, completedKeys, timezone],
  );

  const completed = useMemo(

    () => allInWindow.filter((e) => completedKeys.has(todoCompletionKey(e.id, e.date))),

    [allInWindow, completedKeys],

  );



  const historyItems = useMemo(() => {

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    return completions

      .map((c) => {

        const event = eventById.get(c.eventId);

        const occurrenceDate = c.occurrenceDate.slice(0, 10);

        const inWindow = event ? isEventInTodoWindow(event, today, timezone) : false;

        const nextDate = event
          ? resolveNextOccurrenceDate(event, today, timezone)
          : occurrenceDate;
        const days = daysUntilEvent(nextDate, today, timezone);

        return {

          ...c,

          event,

          occurrenceDate,

          inWindow,

          days,

        };

      })

      .filter((item) => !item.inWindow || item.days < 0)

      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  }, [completions, eventById, timezone]);



  const today = useMemo(() => new Date(), []);



  const dayLabel = (dateStr: string) => {

    const d = daysUntilEvent(dateStr, today, timezone);

    if (d === 0) return '今天';

    if (d === 1) return '明天';

    if (d > 1) return `${d} 天后`;

    return `已过期 ${Math.abs(d)} 天`;

  };



  return (

    <div className="min-h-screen pb-24">

      <header className="sticky top-4 z-40 px-4 max-w-4xl mx-auto">

        <div className="glass-panel rounded-full px-4 py-3 flex items-center gap-3 ring-1 ring-black/5 dark:ring-white/10">

          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)}>

            <ArrowLeft size={20} />

          </Button>

          <div className="flex-1">

            <h1 className="text-lg font-bold">近期待办</h1>

            <p className="text-xs text-slate-500">

              待办 {pending.length} · 已完成 {completed.length} · 历史 {historyItems.length}

            </p>

          </div>

        </div>

      </header>



      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'history')}>

          <TabsList className="mb-4">

            <TabsTrigger value="active">当前待办</TabsTrigger>

            <TabsTrigger value="history">完成历史</TabsTrigger>

          </TabsList>

        </Tabs>



        {tab === 'active' ? (

          <>

            <div className="glass-panel rounded-2xl p-4 text-sm text-slate-600 dark:text-slate-300 ring-1 ring-black/5 dark:ring-white/10">

              <p className="flex items-start gap-2">

                <CalendarClock className="w-4 h-4 shrink-0 mt-0.5 text-primary-500" />

                <span>

                  点击左侧圆圈<strong>打勾完成</strong>。事件日期过后会自动从「已完成」移出；

                  可在<strong>完成历史</strong>查看。历史记录保留约 365 天后自动清理。

                </span>

              </p>

            </div>



            {pending.length === 0 && completed.length === 0 ? (

              <div className="text-center py-16 glass-panel rounded-3xl">

                <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />

                <p className="font-semibold text-slate-700 dark:text-slate-200">暂无待办</p>

                <p className="text-sm text-slate-500 mt-1">事件进入提醒窗口后会自动显示在这里</p>

                <Button className="mt-4 rounded-full" variant="outline" onClick={() => navigate('/calendar')}>

                  打开日历

                </Button>

              </div>

            ) : (

              <>

                {pending.length > 0 && (

                  <section className="space-y-2">

                    <h2 className="text-sm font-bold text-slate-500 px-1">待处理 · {pending.length}</h2>

                    {pending.map((e) => (

                      <TodoRow

                        key={e.id}

                        event={e}

                        dayLabel={dayLabel(resolveNextOccurrenceDate(e, new Date(), timezone))}

                        completed={false}

                        onToggle={() => toggleComplete(e.id, e.date, isCompleted(e.id, e.date))}

                        onOpen={() => navigate('/calendar')}

                      />

                    ))}

                  </section>

                )}



                {completed.length > 0 && (

                  <section className="space-y-2">

                    <h2 className="text-sm font-bold text-slate-400 px-1">已完成 · {completed.length}</h2>

                    {completed.map((e) => (

                      <TodoRow

                        key={`done-${e.id}`}

                        event={e}

                        dayLabel={dayLabel(resolveNextOccurrenceDate(e, new Date(), timezone))}

                        completed

                        onToggle={() => toggleComplete(e.id, e.date, true)}

                        onOpen={() => navigate('/calendar')}

                      />

                    ))}

                  </section>

                )}

              </>

            )}

          </>

        ) : (

          <>

            <div className="glass-panel rounded-2xl p-4 text-sm text-slate-600 dark:text-slate-300 ring-1 ring-black/5 dark:ring-white/10">

              <p className="flex items-start gap-2">

                <History className="w-4 h-4 shrink-0 mt-0.5 text-primary-500" />

                <span>已过期或离开提醒窗口的完成记录会出现在这里，便于回顾。</span>

              </p>

            </div>



            {historyItems.length === 0 ? (

              <div className="text-center py-16 glass-panel rounded-3xl">

                <History className="w-12 h-12 mx-auto text-slate-300 mb-3" />

                <p className="font-semibold text-slate-700 dark:text-slate-200">暂无历史记录</p>

                <p className="text-sm text-slate-500 mt-1">完成待办且事件过期后会自动归档到这里</p>

              </div>

            ) : (

              <section className="space-y-2">

                {historyItems.map((item) => (

                  <div

                    key={`${item.eventId}-${item.occurrenceDate}`}

                    className="glass-panel rounded-2xl px-3 py-3 flex items-center gap-3 opacity-80"

                  >

                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />

                    <div className="flex-1 min-w-0">

                      <p className="font-semibold truncate text-slate-600">

                        {item.event?.name ?? `事件 #${item.eventId}`}

                      </p>

                      <p className="text-xs text-slate-500 mt-0.5">

                        {item.occurrenceDate}

                        {item.event ? ` · ${eventTypeLabel(item.event.type)}` : ''}

                        {' · 完成于 '}{formatCompletedAt(item.completedAt)}

                      </p>

                    </div>

                    <Badge variant="outline">已归档</Badge>

                  </div>

                ))}

              </section>

            )}

          </>

        )}

      </main>

      <MobileBottomNav />

    </div>

  );

}



function TodoRow({

  event,

  dayLabel,

  completed,

  onToggle,

  onOpen,

}: {

  event: Event;

  dayLabel: string;

  completed: boolean;

  onToggle: () => void;

  onOpen: () => void;

}) {

  const dateStr = event.date.slice(0, 10);

  return (

    <div

      className={`glass-panel rounded-2xl px-3 py-3 flex items-center gap-3 transition ${

        completed ? 'opacity-60' : ''

      }`}

    >

      <button

        type="button"

        onClick={onToggle}

        className={`shrink-0 p-1 rounded-full transition ${

          completed

            ? 'text-green-600 hover:text-green-700'

            : 'text-slate-400 hover:text-primary-500'

        }`}

        aria-label={completed ? '取消完成' : '标记完成'}

      >

        {completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}

      </button>

      <button

        type="button"

        onClick={onOpen}

        className="flex-1 min-w-0 text-left flex justify-between items-center gap-3 hover:opacity-80"

      >

        <div className="min-w-0">

          <p className={`font-semibold truncate ${completed ? 'line-through text-slate-500' : ''}`}>

            {event.name}

          </p>

          <p className="text-xs text-slate-500 mt-0.5">

            {dateStr} · {eventTypeLabel(event.type)}

            {event.reminderConfig?.daysBeforeList?.length

              ? ` · 提前 ${[...event.reminderConfig.daysBeforeList].sort((a, b) => b - a).join('/')} 天`

              : ''}

          </p>

        </div>

        <Badge variant={completed ? 'outline' : dayLabel === '今天' ? 'default' : 'secondary'}>

          {completed ? '已完成' : dayLabel}

        </Badge>

      </button>

    </div>

  );

}

