import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  Home,
  Settings,
  Eye,
  Terminal,
  BarChart3,
  LayoutTemplate,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import HealthStatusBadge from '@/components/layout/HealthStatusBadge';
import { preloadAnalytics, preloadClipHistory } from '@/lib/routePreload';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const primaryItems: NavItem[] = [
  { path: '/', icon: Home, label: 'Accueil' },
  { path: '/surveillance', icon: Eye, label: 'Surveillance' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/templates', icon: LayoutTemplate, label: 'Templates' },
  { path: '/history', icon: History, label: 'Historique' },
  { path: '/admin', icon: Terminal, label: "L'ŒIL" },
];

const secondaryItems: NavItem[] = [
  { path: '/settings', icon: Settings, label: 'Paramètres' },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, saasMode } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Route preload triggered on nav-item hover. Fire-and-forget; React Query
  // dedupes repeat calls so this is safe to call per-hover.
  const handlePreload = (path: string) => {
    switch (path) {
      case '/analytics':
        preloadAnalytics(queryClient);
        break;
      case '/history':
        preloadClipHistory(queryClient);
        break;
      default:
        break;
    }
  };

  return (
    <motion.nav
      initial={false}
      animate={{ width: expanded ? 200 : 56 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className="relative h-full flex flex-col bg-[#0A0A0F]/80 backdrop-blur-md overflow-hidden"
      style={{
        boxShadow: '4px 0 24px -12px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Primary nav */}
      <div className="flex-1 py-3">
        <ul className="flex flex-col">
          {primaryItems.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              isActive={isActiveRoute(location.pathname, item.path)}
              expanded={expanded}
              onHover={() => handlePreload(item.path)}
            />
          ))}
        </ul>
      </div>

      {/* Quota badge (SaaS mode, only visible when expanded) */}
      {saasMode && user && (
        <motion.div
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.15 }}
          className="px-4 py-3 border-t border-white/5 pointer-events-none"
        >
          <div className="text-[10px] text-white/40 uppercase tracking-wider">
            Plan {user.plan}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-white/70 whitespace-nowrap">
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
        </motion.div>
      )}

      {/* Health badge — only visible when expanded */}
      <motion.div
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className="px-3 py-2 border-t border-white/5"
      >
        <HealthStatusBadge />
      </motion.div>

      {/* Secondary nav (settings) */}
      <div className="pb-3 border-t border-white/5 pt-3">
        <ul className="flex flex-col">
          {secondaryItems.map((item) => (
            <NavLink
              key={item.path}
              item={item}
              isActive={isActiveRoute(location.pathname, item.path)}
              expanded={expanded}
            />
          ))}
        </ul>
      </div>
    </motion.nav>
  );
}

function NavLink({
  item,
  isActive,
  expanded,
  onHover,
}: {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
  onHover?: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.path}
        onMouseEnter={onHover}
        onFocus={onHover}
        className={cn(
          'relative flex items-center gap-3 h-11 pl-[18px] pr-3 transition-colors group whitespace-nowrap',
          isActive
            ? 'text-viral-medium'
            : 'text-white/50 hover:text-white/90'
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-2 bottom-2 w-[2px] bg-viral-medium rounded-r"
            style={{ boxShadow: '0 0 8px #F59E0B' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
        <span
          className={cn(
            'text-sm font-medium transition-opacity duration-150',
            expanded ? 'opacity-100' : 'opacity-0'
          )}
        >
          {item.label}
        </span>
      </Link>
    </li>
  );
}

function isActiveRoute(pathname: string, target: string): boolean {
  if (target === '/') return pathname === '/';
  return pathname === target || pathname.startsWith(`${target}/`);
}
