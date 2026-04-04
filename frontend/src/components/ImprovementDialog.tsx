import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';

const OPTIONS = [
  '启用 NTP 校时并在重启后自动同步',
  '把提醒改为“指定时刻”而非固定批处理时间',
  '增加批量删除与模板向导',
  '增强安全告警邮件（失败登录/IP 异常）',
];

export function ImprovementDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const shown = sessionStorage.getItem('timemark_improvements_shown');
    if (!shown) {
      setOpen(true);
    }
  }, []);

  const toggle = (value: string) => {
    setSelected((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const confirm = () => {
    sessionStorage.setItem('timemark_improvements_shown', '1');
    localStorage.setItem('timemark_improvements_choice', JSON.stringify(selected));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>改进建议（一次性弹窗）</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <Button onClick={confirm} className="w-full">确认选择</Button>
      </DialogContent>
    </Dialog>
  );
}
