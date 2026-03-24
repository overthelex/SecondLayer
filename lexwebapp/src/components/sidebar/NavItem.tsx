import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import showToast from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  route?: string | null;
  onClick?: () => void;
  badge?: number;
}

export function NavItem({ icon: Icon, label, route, onClick, badge }: NavItemProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = route ? location.pathname === route || location.pathname.startsWith(route + '/') : false;

  const handleClick = onClick ?? (() => {
    if (route) {
      navigate(route);
      if (window.innerWidth < 1024) {
        window.dispatchEvent(new CustomEvent('sidebar-navigate'));
      }
    } else {
      showToast.info(toastT('comingSoon'));
    }
  });

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left pl-3 pr-2.5 py-[7px] rounded-md text-[12.5px] transition-all duration-150 flex items-center gap-2.5 group relative ${
        isActive
          ? 'bg-white/[0.07] text-white'
          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
      }`}>
      {/* Active left accent bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-white opacity-70" />
      )}
      <Icon
        size={13}
        strokeWidth={isActive ? 2 : 1.75}
        className={`flex-shrink-0 transition-colors duration-150 ${
          isActive ? 'text-white opacity-90' : 'text-zinc-500 group-hover:text-zinc-300'
        }`}
      />
      <span className={`truncate tracking-[-0.01em] font-sans transition-colors duration-150 ${isActive ? 'font-medium text-zinc-100' : 'font-normal text-zinc-400 group-hover:text-zinc-200'}`}>
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-white/15 text-white text-[10px] font-semibold px-1 border border-white/10">
          {badge}
        </span>
      )}
    </button>
  );
}
