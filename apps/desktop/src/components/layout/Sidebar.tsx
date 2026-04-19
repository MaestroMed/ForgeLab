import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Home,
  Settings,
  ChevronLeft,
  ChevronRight,
  Eye,
  Terminal,
  BarChart3,
  LayoutTemplate,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useAuthStore } from '@/store/auth';

const navItems = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/surveillance', icon: Eye, label: 'Surveillance' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { path: '/history', icon: History, label: 'Historique' },
  { path: '/admin', icon: Terminal, label: "L'ŒIL" },
  { path: '/settings', icon: Settings, label: 'Paramètres' },
];

export default function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, saasMode } = useAuthStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarCollapsed ? 60 : 200 }}
      transition={{ duration: 0.2 }}
      className="h-full bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col"
    >
      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <motion.li 
                key={item.path}
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Link
                  to={item.path}
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                    isActive
                      ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[var(--accent-color)] rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={cn(
                    'w-4 h-4 flex-shrink-0 transition-colors',
                    isActive && 'text-[var(--accent-color)]'
                  )} />
                  {!sidebarCollapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      </nav>

      {/* Quota badge (SaaS mode only) */}
      {saasMode && user && !sidebarCollapsed && (
        <div className="p-4 border-t border-white/5">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            Plan {user.plan}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span>Exports</span>
            <span>
              {user.exports_this_month}
              {user.plan === 'free' ? ' / 5' : ''}
            </span>
          </div>
          {user.plan === 'free' && (
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-viral-medium to-viral-high"
                style={{
                  width: `${Math.min(100, (user.exports_this_month / 5) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Collapse button */}
      <div className="p-2 border-t border-[var(--border-color)]">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </button>
      </div>
    </motion.aside>
  );
}


