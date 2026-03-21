import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import showToast from '../../utils/toast';

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
  const isActive = route ? location.pathname === route : false;

  const handleClick = onClick ?? (() => {
    if (route) {
      navigate(route);
      if (window.innerWidth < 1024) {
        window.dispatchEvent(new CustomEvent('sidebar-navigate'));
      }
    } else {
      showToast.info('Скоро буде доступно');
    }
  });

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-150 flex items-center gap-2.5 group ${
        isActive
          ? 'bg-zinc-200/70 text-zinc-900 font-medium'
          : 'text-zinc-600 hover:bg-zinc-200/40 hover:text-zinc-900'
      }`}>
      <Icon size={14} strokeWidth={2} className={`flex-shrink-0 transition-colors duration-150 ${isActive ? 'text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
      <span className="truncate font-medium tracking-tight font-sans">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-zinc-900 text-white text-[10px] font-semibold px-1">
          {badge}
        </span>
      )}
    </button>
  );
}
