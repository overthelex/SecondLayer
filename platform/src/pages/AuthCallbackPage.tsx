import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAuth } from '@/utils/auth';
import { api } from '@/utils/api-client';
import { Loader2 } from 'lucide-react';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      localStorage.setItem('auth_token', token);
      api.get('/auth/me').then(({ data }) => {
        if (data.user) {
          setAuth(token, data.user);
        }
        navigate('/', { replace: true });
      }).catch(() => {
        navigate('/login', { replace: true });
      });
    } else {
      navigate('/login', { replace: true });
    }
  }, [navigate, searchParams]);

  return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );
}
