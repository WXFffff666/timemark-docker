import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { api } from '../lib/api';
import { ArrowLeft, History, Lock, Shield } from 'lucide-react';

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

export default function Settings() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [username, setUsername] = useState('');

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });


  useEffect(() => {
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        if (user?.username) setUsername(user.username);
      } catch {}
    }
  }, []);

  const handleChangeUsername = async () => {
    if (username.trim().length < 3) {
      toast({ title: '用户名至少3个字符', variant: 'destructive' });
      return;
    }
    setUsernameLoading(true);
    try {
      await api.post('/auth/change-username', { username: username.trim() });
      const userRaw = localStorage.getItem('user');
      if (userRaw) {
        const user = JSON.parse(userRaw);
        localStorage.setItem('user', JSON.stringify({ ...user, username: username.trim() }));
      }
      toast({ title: '用户名修改成功' });
    } catch (error: any) {
      toast({ title: '修改失败', description: error.message, variant: 'destructive' });
    } finally {
      setUsernameLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword.length < 8) {
      toast({ title: '新密码至少需要8个字符', variant: 'destructive' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: '两次输入的密码不一致', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast({ title: '密码修改成功' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      toast({ title: '修改失败', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">设置</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">管理您的账户和安全设置</p>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >

          <motion.div variants={itemVariants}>
            <Card className="glass overflow-hidden">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="text-gray-900 dark:text-white">修改用户名</CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">更新登录用户名（单用户模式）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">新用户名</Label>
                  <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-11" />
                </div>
                <Button onClick={handleChangeUsername} disabled={usernameLoading} className="w-full h-11">
                  {usernameLoading ? '修改中...' : '修改用户名'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="glass overflow-hidden">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center">
                    <Lock className="h-5 w-5 text-primary-500" />
                  </div>
                  <div>
                    <CardTitle className="text-gray-900 dark:text-white">修改密码</CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">更新您的账户密码以保护安全</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-medium">当前密码</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">新密码</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="至少8个字符"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">确认新密码</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="h-11"
                  />
                </div>
                <Button onClick={handleChangePassword} disabled={loading} className="w-full h-11 mt-2">
                  <Shield className="h-4 w-4 mr-2" />
                  {loading ? '修改中...' : '修改密码'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div variants={itemVariants}>
            <Card className="glass overflow-hidden">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <History className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-gray-900 dark:text-white">登录历史</CardTitle>
                    <CardDescription className="text-gray-600 dark:text-gray-400">查看最近的登录记录和设备信息</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Button onClick={() => navigate('/login-history')} variant="outline" className="w-full h-11">
                  <History className="h-4 w-4 mr-2" />
                  查看登录历史
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
