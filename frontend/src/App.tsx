import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/auth.store';
import { LoginPage } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import Settings from './pages/Settings';
import Reminders from './pages/Reminders';
import LoginHistory from './pages/LoginHistory';
import Channels from './pages/Channels';
import Templates from './pages/Templates';
import Inbox from './pages/Inbox';
import Contacts from './pages/Contacts';
import Calendar from './pages/Calendar';
import { useEffect } from 'react';
import { TimezoneProvider } from './components/RealtimeClock';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  
  // During auth check, don't redirect - wait for check to complete
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" state={{ from: location }} replace />;
}

function MeshBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" style={{ backgroundColor: 'var(--mesh-color-3)' }}>
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="meshGradient1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="var(--mesh-color-1)" stopOpacity="var(--mesh-opacity)" />
            <stop offset="100%" stopColor="var(--mesh-color-1)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="meshGradient2" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor="var(--mesh-color-2)" stopOpacity="var(--mesh-opacity)" />
            <stop offset="100%" stopColor="var(--mesh-color-2)" stopOpacity="0" />
          </radialGradient>
          <filter id="blurFilter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={80} />
          </filter>
        </defs>
        <g className="animate-blob-spin" style={{ transformOrigin: 'center', animation: 'blob-spin 30s linear infinite' }}>
          <ellipse cx="20%" cy="20%" rx="35vw" ry="35vw" fill="url(#meshGradient1)" filter="url(#blurFilter)" />
        </g>
        <g className="animate-blob-spin-slow" style={{ transformOrigin: 'center', animation: 'blob-spin 40s linear infinite reverse' }}>
          <ellipse cx="80%" cy="80%" rx="40vw" ry="40vw" fill="url(#meshGradient2)" filter="url(#blurFilter)" />
        </g>
      </svg>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Simple redirect to dashboard when logged in and on login page
  useEffect(() => {
    if (isAuthenticated && location.pathname === '/login') {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, location.pathname, navigate]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/reminders" element={<ProtectedRoute><Reminders /></ProtectedRoute>} />
        <Route path="/login-history" element={<ProtectedRoute><LoginHistory /></ProtectedRoute>} />
<Route path="/channels" element={<ProtectedRoute><Channels /></ProtectedRoute>} />
<Route path="/templates" element={<ProtectedRoute><Templates /></ProtectedRoute>} />
<Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
<Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
<Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
<Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  },[]);

  return (
    <BrowserRouter>
      <TimezoneProvider>
        <MeshBackground />
        <div className="relative z-10 min-h-screen text-slate-900 dark:text-slate-100">
          <AnimatedRoutes />
        </div>
      </TimezoneProvider>
    </BrowserRouter>
  );
}

export default App;