import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ContactLabeledEntry } from '@timemark/shared';

interface LabeledFieldsEditorProps {
  label: string;
  placeholder?: string;
  valueLabel?: string;
  type?: string;
  entries: ContactLabeledEntry[];
  onChange: (entries: ContactLabeledEntry[]) => void;
  minCount?: number;
}

const defaultEntry = (): ContactLabeledEntry => ({ label: '', value: '' });

export function LabeledFieldsEditor({
  label,
  placeholder = '填写内容',
  valueLabel = '标签（如工作、妈妈）',
  type,
  entries,
  onChange,
  minCount = 1,
}: LabeledFieldsEditorProps) {
  const list = entries.length > 0 ? entries : [defaultEntry()];

  const update = (index: number, patch: Partial<ContactLabeledEntry>) => {
    const next = list.map((e, i) => (i === index ? { ...e, ...patch } : e));
    onChange(next);
  };

  const add = () => onChange([...list, defaultEntry()]);

  const remove = (index: number) => {
    if (list.length <= minCount) {
      onChange([defaultEntry()]);
      return;
    }
    onChange(list.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="ghost" size="sm" onClick={add} className="h-8 px-2">
          <Plus className="w-4 h-4 mr-1" />添加
        </Button>
      </div>
      <div className="space-y-2">
        {list.map((entry, index) => (
          <div key={index} className="flex gap-2 items-start">
            <Input
              placeholder={valueLabel}
              value={entry.label}
              onChange={(e) => update(index, { label: e.target.value })}
              className="w-28 shrink-0"
              aria-label={`${label}标签`}
            />
            <Input
              placeholder={placeholder}
              type={type}
              value={entry.value}
              onChange={(e) => update(index, { value: e.target.value })}
              className="flex-1"
              aria-label={`${label}值`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label="删除"
              className="shrink-0 min-h-10 min-w-10"
            >
              <Trash2 className="w-4 h-4 text-slate-400" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function normalizeEntriesForSave(entries: ContactLabeledEntry[]): ContactLabeledEntry[] {
  return entries
    .map((e) => ({
      label: e.label.trim() || '默认',
      value: e.value.trim(),
    }))
    .filter((e) => e.value);
}
