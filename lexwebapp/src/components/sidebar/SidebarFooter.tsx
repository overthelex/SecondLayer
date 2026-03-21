import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, CreditCard, UsersRound, Plug, FileText, UserPlus } from 'lucide-react';
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
    <div className="px-3 py-3 border-t border-claude-border relative" ref={profileMenuRef}>
      <AnimatePresence>
        {showProfileMenu &&
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-full left-3 right-3 mb-1.5 bg-white rounded-lg border border-zinc-200 shadow-elevation-3 overflow-hidden z-50">
            <button
              onClick={onProfileClick}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
              <User size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-zinc-800 font-sans">Профіль</span>
            </button>
            {/* "Стати адвокатом" hidden — feature not ready for production */}
            {role !== 'administrator' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.BILLING); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
                <CreditCard size={14} className="text-zinc-500 flex-shrink-0" />
                <span className="text-[13px] font-medium text-zinc-800 font-sans">Біллінг</span>
              </button>
            )}
            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MY_CONTRACTS); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
              <FileText size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-zinc-800 font-sans">Мої договори</span>
            </button>
            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.REFERRAL); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
              <UserPlus size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-zinc-800 font-sans">Запросити друга</span>
            </button>
            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MCP_CONNECT); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
              <Plug size={14} className="text-zinc-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-zinc-800 font-sans">MCP конект</span>
            </button>
            {role === 'company' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.TEAM); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 transition-colors duration-100 border-b border-zinc-100">
                <UsersRound size={14} className="text-zinc-500 flex-shrink-0" />
                <span className="text-[13px] font-medium text-zinc-800 font-sans">Команда</span>
              </button>
            )}
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-red-50 transition-colors duration-100">
              <LogOut size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-[13px] font-medium text-red-500 font-sans">Вихід</span>
            </button>
          </motion.div>
        }
      </AnimatePresence>

      <div className="flex items-center justify-center gap-3 mb-2 px-1">
        <a href="/ua/offer" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-400 hover:text-zinc-500 transition-colors">
          Оферта
        </a>
        <span className="text-zinc-300 text-[10px]">·</span>
        <a href="/ua/privacy" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-400 hover:text-zinc-500 transition-colors">
          Конфіденційність
        </a>
      </div>

      <button
        onClick={onProfileMenuClick}
        className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-zinc-200/40 rounded-lg transition-colors duration-150">
        {user?.picture ?
          <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> :
          <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-600 text-[10px] font-semibold flex-shrink-0">
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
          </div>
        }
        <div className="flex-1 text-left min-w-0">
          <div className="text-[13px] font-semibold text-zinc-900 tracking-tight font-sans truncate">
            {user?.name || 'Користувач'}
          </div>
          <div className="text-[11px] text-zinc-400 font-sans truncate">{user?.email || ''}</div>
        </div>
      </button>
    </div>
  );
}
