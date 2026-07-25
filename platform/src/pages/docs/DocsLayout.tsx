import { Outlet, NavLink } from 'react-router-dom';

const tocItems = [
  { to: '/docs', label: 'Introduction' },
  { to: '/docs/authentication', label: 'Authentication' },
  { to: '/docs/quickstart', label: 'Quick Start' },
  { to: '/docs/tools', label: 'MCP Tools Reference' },
  { to: '/docs/api', label: 'API Reference' },
  { to: '/docs/rate-limits', label: 'Rate Limits' },
  { to: '/docs/integrations', label: 'Integrations' },
];

export function DocsLayout() {
  return (
    <div className="max-w-5xl flex gap-8">
      <nav className="w-48 flex-shrink-0 hidden lg:block">
        <div className="sticky top-6 space-y-1">
          <div className="text-xs font-semibold text-txt-muted uppercase tracking-wider mb-3">
            Contents
          </div>
          {tocItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/docs'}
              className={({ isActive }) =>
                `block text-sm py-1.5 px-3 rounded-md transition-colors ${
                  isActive
                    ? 'text-brand-700 bg-brand-50 font-medium'
                    : 'text-txt-muted hover:text-txt-primary hover:bg-surface-tertiary'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
