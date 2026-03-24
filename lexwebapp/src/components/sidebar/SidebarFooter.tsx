import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, CreditCard, UsersRound, Plug, FileText, UserPlus, Code, ChevronUp } from 'lucide-react';
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

  const menuItemClass = "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 hover:bg-white/[0.06]";
  const menuIconClass = "text-zinc-500 flex-shrink-0";
  const menuLabelClass = "text-[12.5px] font-normal text-zinc-300 font-sans tracking-[-0.01em]";

  return (
    <div className="px-2 py-2.5 border-t border-white/[0.06] relative" ref={profileMenuRef}>
      {/* Legal links */}
      <div className="flex items-center justify-center gap-3 mb-2 px-1">
        <a
          href="/ua/offer"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9.5px] text-zinc-700 hover:text-zinc-500 transition-colors tracking-wide"
        >
          Оферта
        </a>
        <span className="text-zinc-800 text-[9px]">·</span>
        <a
          href="/ua/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9.5px] text-zinc-700 hover:text-zinc-500 transition-colors tracking-wide"
        >
          Конфіденційність
        </a>
      </div>

      {/* Profile menu popup */}
      <AnimatePresence>
        {showProfileMenu && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full left-2 right-2 mb-1.5 bg-[#1a1a1a] rounded-lg border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
          >
            <button onClick={onProfileClick} className={`${menuItemClass} border-b border-white/[0.05]`}>
              <User size={13} className={menuIconClass} />
              <span className={menuLabelClass}>Профіль</span>
            </button>

            {role !== 'administrator' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.BILLING); }}
                className={`${menuItemClass} border-b border-white/[0.05]`}
              >
                <CreditCard size={13} className={menuIconClass} />
                <span className={menuLabelClass}>Біллінг</span>
              </button>
            )}

            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MY_CONTRACTS); }}
              className={`${menuItemClass} border-b border-white/[0.05]`}
            >
              <FileText size={13} className={menuIconClass} />
              <span className={menuLabelClass}>Мої договори</span>
            </button>

            <button
              onClick={() => { onProfileMenuClick(); window.open('/ua/developer-offer', '_blank'); }}
              className={`${menuItemClass} border-b border-white/[0.05]`}
            >
              <Code size={13} className={menuIconClass} />
              <span className={menuLabelClass}>Оферта розробника</span>
            </button>

            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.REFERRAL); }}
              className={`${menuItemClass} border-b border-white/[0.05]`}
            >
              <UserPlus size={13} className={menuIconClass} />
              <span className={menuLabelClass}>Запросити друга</span>
            </button>

            <button
              onClick={() => { onProfileMenuClick(); navigate(ROUTES.MCP_CONNECT); }}
              className={`${menuItemClass} border-b border-white/[0.05]`}
            >
              <Plug size={13} className={menuIconClass} />
              <span className={menuLabelClass}>MCP конект</span>
            </button>

            {role === 'company' && (
              <button
                onClick={() => { onProfileMenuClick(); navigate(ROUTES.TEAM); }}
                className={`${menuItemClass} border-b border-white/[0.05]`}
              >
                <UsersRound size={13} className={menuIconClass} />
                <span className={menuLabelClass}>Команда</span>
              </button>
            )}

            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-100 hover:bg-red-500/10"
            >
              <LogOut size={13} className="text-red-500/70 flex-shrink-0" />
              <span className="text-[12.5px] font-normal text-red-400/80 font-sans tracking-[-0.01em]">Вихід</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile trigger button */}
      <button
        onClick={onProfileMenuClick}
        className="w-full flex items-center gap-2.5 px-2 py-1.5 hover:bg-white/[0.05] rounded-md transition-colors duration-150 group"
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="w-6 h-6 rounded-full object-cover flex-shrink-0 opacity-90"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-[9px] font-semibold flex-shrink-0 border border-white/10">
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 text-left min-w-0">
          <div className="text-[12px] font-medium text-zinc-300 tracking-[-0.01em] font-sans truncate leading-tight">
            {user?.name || 'Користувач'}
          </div>
          <div className="text-[10.5px] text-zinc-600 font-sans truncate leading-tight">{user?.email || ''}</div>
        </div>
        <ChevronUp
          size={11}
          strokeWidth={2}
          className={`flex-shrink-0 text-zinc-700 group-hover:text-zinc-500 transition-all duration-200 ${showProfileMenu ? 'rotate-0' : 'rotate-180'}`}
        />
      </button>
    </div>
  );
}
