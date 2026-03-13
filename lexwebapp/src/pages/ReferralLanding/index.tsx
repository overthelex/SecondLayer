/**
 * ReferralLanding
 * Handles /r/:code — saves referral code to localStorage and redirects to login
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../router/routes';

export function ReferralLanding() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (code) {
      localStorage.setItem('referral_code', code);
    }
    navigate(ROUTES.LOGIN, { replace: true });
  }, [code, navigate]);

  return null;
}
