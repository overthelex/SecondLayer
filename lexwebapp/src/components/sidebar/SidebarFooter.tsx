import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, CreditCard, UsersRound, Plug, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ROUTES } from '../../router/routes';
import type { UserRole } from '../../types/models/User';

interface SidebarFooterProps {
  user: { name?: string; email?: string; picture?: string; role?: UserRole; userType?: string } | null;
  role: UserRole;
  showProfileMenu: boolean;
  profileMenuRef: React.RefObject<HTMLDivElement | null>;
  onProfileMenuClick: () => void;
  onProfileClick: () => void;
  onLogout: () => void;
}

export function SidebarFooter({
  user, role, showProfileMenu, profileMenuRef,
  onProfileMenuClick, onProfileClick, onLogout,
}: SidebarFooterProps) {
  const navigate = useNavigate();
  return (
    <div className="p-4 border-t border-claude-border relative" ref={profileMenuRef}>
      <AnimatePresence>
        {showProfileMenu &&
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl border border-claude-border shadow-xl overflow-hidden z-50">
            <button
              onClick={onProfileClick}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-claude-bg transition-colors border-b border-claude-border/50">
              <div className="p-1.5 bg-claude-accent/10 rounded-lg">
                <User size={16} className="text-claude-accent" />
              </div>
              <span className="text-[13px] font-medium text-claude-text font-sans">Профіль</span>
            </button>
            {/* "Стати адвокатом" hidden — feature not ready for production */}
            {role !== 'administrator' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.BILLING); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-claude-bg transition-colors border-b border-claude-border/50">
                <div className="p-1.5 bg-claude-subtext/8 rounded-lg">
                  <CreditCard size={16} className="text-claude-subtext" />
                </div>
                <span className="text-[13px] font-medium text-claude-text font-sans">Біллінг</span>
              </button>
            )}
            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MY_CONTRACTS); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-claude-bg transition-colors border-b border-claude-border/50">
              <div className="p-1.5 bg-claude-subtext/8 rounded-lg">
                <FileText size={16} className="text-claude-subtext" />
              </div>
              <span className="text-[13px] font-medium text-claude-text font-sans">Мої договори</span>
            </button>
            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MCP_CONNECT); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-claude-bg transition-colors border-b border-claude-border/50">
              <div className="p-1.5 bg-claude-subtext/8 rounded-lg">
                <Plug size={16} className="text-claude-subtext" />
              </div>
              <span className="text-[13px] font-medium text-claude-text font-sans">MCP конект</span>
            </button>
            {role === 'company' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.TEAM); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-claude-bg transition-colors border-b border-claude-border/50">
                <div className="p-1.5 bg-claude-subtext/8 rounded-lg">
                  <UsersRound size={16} className="text-claude-subtext" />
                </div>
                <span className="text-[13px] font-medium text-claude-text font-sans">Команда</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 transition-colors">
              <div className="p-1.5 bg-red-50 rounded-lg">
                <LogOut size={16} className="text-red-600" />
              </div>
              <span className="text-[13px] font-medium text-red-600 font-sans">Вихід</span>
            </button>
          </motion.div>
        }
      </AnimatePresence>

      <button
        onClick={onProfileMenuClick}
        className="w-full flex items-center gap-3 px-2 py-2 hover:bg-claude-subtext/8 rounded-lg transition-all duration-200">
        {user?.picture ?
          <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full object-cover" /> :
          <div className="w-8 h-8 rounded-full bg-claude-subtext/15 flex items-center justify-center text-claude-subtext text-[11px] font-semibold">
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
          </div>
        }
        <div className="flex-1 text-left">
          <div className="text-[13px] font-semibold text-claude-text tracking-tight font-sans">
            {user?.name || 'Користувач'}
          </div>
          <div className="text-[11px] text-claude-subtext/70 font-sans">{user?.email || ''}</div>
        </div>
      </button>
    </div>
  );
}
