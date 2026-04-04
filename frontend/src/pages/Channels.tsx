import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';

export default function Channels() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await api.get('/settings/config');
      setConfig(data);
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setLoading(false);
    }
  };

  const channels = [
    { name: '飞书', key: 'feishu_webhook', configured: !!config?.feishu_webhook },
    { name: '企业微信', key: 'wecom_webhook', configured: !!config?.wecom_webhook },
    { name: '钉钉', key: 'dingtalk_webhook', configured: !!config?.dingtalk_webhook },
    { name: 'Telegram', key: 'telegram_bot_token', configured: !!config?.telegram_bot_token },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-dark-bg dark:via-slate-900 dark:to-dark-bg">
      <header className="glass sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="w-10 h-10 p-0">
            ←
          </Button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">通知渠道</h1>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Card className="glass">
          <CardHeader>
            <CardTitle>已配置的通知渠道</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : (
              <div className="space-y-4">
                {channels.map((ch) => (
                  <div key={ch.key} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${ch.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="font-medium text-gray-900 dark:text-white">{ch.name}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {ch.configured ? '已配置' : '未配置'}
                    </span>
                  </div>
                ))}
                <div className="pt-4 text-sm text-gray-500 dark:text-gray-400">
                  提示：在设置页面配置通知渠道的 Webhook 地址
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
