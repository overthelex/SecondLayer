import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Key,
  BarChart3,
  BookOpen,
  Shield,
  Zap,
  Blocks,
  FileCode2,
  Gauge,
  Cable,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/keys', icon: Key, label: 'API Keys' },
  { to: '/usage', icon: BarChart3, label: 'Usage' },
];

const docsItems = [
  { to: '/docs', icon: BookOpen, label: 'Introduction' },
  { to: '/docs/authentication', icon: Shield, label: 'Authentication' },
  { to: '/docs/quickstart', icon: Zap, label: 'Quick Start' },
  { to: '/docs/tools', icon: Blocks, label: 'MCP Tools' },
  { to: '/docs/api', icon: FileCode2, label: 'API Reference' },
  { to: '/docs/rate-limits', icon: Gauge, label: 'Rate Limits' },
  { to: '/docs/integrations', icon: Cable, label: 'Integrations' },
];

function SidebarLink({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/' || to === '/docs'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-sidebar-active text-sidebar-text-active'
            : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="w-64 bg-sidebar-bg h-screen flex flex-col fixed left-0 top-0">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">
            SL
          </div>
          <div>
            <div className="text-white font-semibold text-sm">SecondLayer</div>
            <div className="text-sidebar-text text-xs">Developer Platform</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}

        <div className="pt-4 pb-2">
          <div className="px-3 text-xs font-semibold text-sidebar-text/60 uppercase tracking-wider">
            Documentation
          </div>
        </div>

        {docsItems.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-white/10">
        <div className="text-xs text-sidebar-text/50">
          SecondLayer Platform v0.1
        </div>
      </div>
    </aside>
  );
}
