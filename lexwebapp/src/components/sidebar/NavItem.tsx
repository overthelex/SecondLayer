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
      className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all duration-200 flex items-center gap-3 group ${isActive ? 'bg-claude-accent/10 text-claude-accent' : 'text-claude-text hover:bg-claude-subtext/8'}`}>
      <Icon size={15} strokeWidth={2} className="text-claude-subtext/60 group-hover:text-claude-text transition-colors duration-200 flex-shrink-0" />
      <span className="truncate font-medium tracking-tight font-sans">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-semibold px-1.5">
          {badge}
        </span>
      )}
    </button>
  );
}
