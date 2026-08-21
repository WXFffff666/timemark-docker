import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 智能返回：优先 location.state.backTo，其次浏览器历史，最后 fallback。
 * 避免子页面硬编码跳转到 /settings 导致历史栈错乱。
 */
export function useSmartBack(fallback = '/dashboard') {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const backTo = (location.state as { backTo?: string } | null)?.backTo;
    if (backTo) {
      navigate(backTo, { replace: true });
      return;
    }
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate, location.state, fallback]);
}
