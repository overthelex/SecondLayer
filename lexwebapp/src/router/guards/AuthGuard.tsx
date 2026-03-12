/**
 * Auth Guard
 * Protects routes that require authentication
 * Shows organization setup modal if user has no organization
 * Shows attorney offer modal if attorney hasn't accepted the offer
 */

import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../routes';
import { api } from '../../utils/api-client';
import { OrganizationSetupModal } from '../../components/organization/OrganizationSetupModal';
import { AttorneyOfferModal } from '../../components/attorney/AttorneyOfferModal';

export const AuthGuard: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [, setOrgChecked] = useState(false);

  // Check if attorney needs to accept the offer
  const showAttorneyOffer = isAuthenticated
    && user?.userType === 'attorney'
    && !user?.attorneyOfferAccepted;

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    // Skip if already dismissed this session
    if (sessionStorage.getItem('org_setup_skipped')) {
      setOrgChecked(true);
      return;
    }

    api.team.getOrganization()
      .then((res) => {
        if (!res.data?.data) {
          setShowOrgModal(true);
        }
      })
      .catch(() => {
        // If the endpoint fails, don't block the user
      })
      .finally(() => {
        setOrgChecked(true);
      });
  }, [isAuthenticated, isLoading]);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-claude-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-claude-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-claude-subtext">Завантаження...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Render child routes + modals
  return (
    <>
      <Outlet />
      {showAttorneyOffer && (
        <AttorneyOfferModal
          isOpen={true}
          onAccepted={() => {/* user state updated via updateUser in modal */}}
        />
      )}
      {!showAttorneyOffer && (
        <OrganizationSetupModal
          isOpen={showOrgModal}
          onClose={() => setShowOrgModal(false)}
          onCreated={() => setShowOrgModal(false)}
          userEmail={user?.email}
        />
      )}
    </>
  );
};
