import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { useToast } from '../hooks/use-toast';
import { api } from '../lib/api';
import { ArrowLeft, Bell, Clock, Calendar, Globe } from 'lucide-react';

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

export default function Reminders() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  const [config, setConfig] = useState({
    enabled: true,
    dailyTime: '09:00',
    daysBeforeList: [1, 3, 7, 30],
    emailAddresses: ['1127251096@qq.com', 'wxf200707@gmail.com'],
    timezone: 'Asia/Shanghai',
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get('/settings/reminders');
        if (response.success && response.data) {
          setConfig(response.data);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await api.post('/settings/reminders', config);
      console.log('✓ Settings saved:', response);
      toast({ title: '✓ 提醒设置已保存', description: `每日检查时间: ${config.dailyTime}` });
    } catch (error: any) {
      console.error('✗ Save failed:', error);
      toast({ title: '✗ 保存失败', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-6">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="rounded-full hover:bg-white/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">提醒配置</h1>
            <p className="text-sm text-gray-500 mt-1">自定义事件提醒的时间和方式</p>
          </div>
        </motion.div>
      
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>自动提醒设置</CardTitle>
                  <CardDescription>配置事件提醒的时间和方式</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <motion.div
                variants={itemVariants}
                className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Label htmlFor="enabled" className="text-base font-medium cursor-pointer">启用自动提醒</Label>
                    <p className="text-sm text-muted-foreground">每天定时检查并发送提醒</p>
                  </div>
                </div>
                <Switch
                  id="enabled"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                />
              </motion.div>
              
              <motion.div variants={itemVariants} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <Label htmlFor="dailyTime" className="text-sm font-medium">每日检查时间</Label>
                </div>
                <Input
                  id="dailyTime"
                  type="time"
                  value={config.dailyTime}
                  onChange={(e) => setConfig({ ...config, dailyTime: e.target.value })}
                  className="h-11"
                />
              </motion.div>
              

              <motion.div variants={itemVariants} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-gray-500" />
                  <Label htmlFor="timezone" className="text-sm font-medium">时区</Label>
                </div>
                <select
                  id="timezone"
                  value={config.timezone}
                  onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="Asia/Shanghai">东八区（北京时间）</option>
                  <option value="UTC">UTC</option>
                </select>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <Label className="text-sm font-medium">提前提醒天数</Label>
                </div>
                <p className="text-sm text-muted-foreground">在事件发生前多少天发送提醒</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 3, 7, 14, 30].map((day) => (
                    <motion.div key={day} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant={config.daysBeforeList.includes(day) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const days = config.daysBeforeList.includes(day)
                            ? config.daysBeforeList.filter(d => d !== day)
                            : [...config.daysBeforeList, day].sort((a, b) => a - b);
                          setConfig({ ...config, daysBeforeList: days });
                        }}
                        className="h-9 px-4"
                      >
                        {day}天
                      </Button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex-1 h-11">
                  取消
                </Button>
                <Button onClick={handleSave} disabled={loading} className="flex-1 h-11">
                  {loading ? '保存中...' : '保存设置'}
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
      </div>
    </div>
  );
}
