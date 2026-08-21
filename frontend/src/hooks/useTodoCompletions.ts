import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { buildCompletedSet, todoCompletionKey } from '@/lib/calendar-utils';

export interface TodoCompletion {
  eventId: number;
  occurrenceDate: string;
  completedAt: string;
}

export function useTodoCompletions() {
  const [completions, setCompletions] = useState<TodoCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<TodoCompletion[]>('/todos/completions');
      setCompletions(data || []);
    } catch {
      setCompletions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const completedKeys = useMemo(() => buildCompletedSet(completions), [completions]);

  const isCompleted = useCallback(
    (eventId: string | number, date: string) => completedKeys.has(todoCompletionKey(eventId, date)),
    [completedKeys],
  );

  const toggleComplete = useCallback(
    async (eventId: string | number, date: string, currentlyCompleted: boolean) => {
      const occurrenceDate = date.slice(0, 10);
      const numericId = Number(eventId);
      try {
        if (currentlyCompleted) {
          await api.delete('/todos/complete', { eventId: numericId, occurrenceDate });
          setCompletions((prev) =>
            prev.filter((c) => !(c.eventId === numericId && c.occurrenceDate === occurrenceDate)),
          );
        } else {
          await api.post('/todos/complete', { eventId: numericId, occurrenceDate });
          setCompletions((prev) => [
            { eventId: numericId, occurrenceDate, completedAt: new Date().toISOString() },
            ...prev.filter((c) => !(c.eventId === numericId && c.occurrenceDate === occurrenceDate)),
          ]);
        }
      } catch (e) {
        console.error('Todo toggle failed:', e);
      }
    },
    [],
  );

  return { completions, completedKeys, loading, isCompleted, toggleComplete, refresh };
}
