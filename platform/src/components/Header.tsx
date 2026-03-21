import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 lg:px-6">
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-1.5 text-txt-muted hover:text-txt-primary transition-colors"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="text-sm text-txt-secondary hidden sm:block">{user.email}</div>
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-medium">
                {user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <button
              onClick={logout}
              className="p-1.5 text-txt-muted hover:text-txt-primary transition-colors"
              title="Вийти"
            >
              <LogOut size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
