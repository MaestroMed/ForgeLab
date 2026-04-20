import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from '@/components/ui/Toaster';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import ShortcutsOverlay from '@/components/ui/ShortcutsOverlay';
import CommandPalette from '@/components/ui/CommandPalette';
import BackendDownOverlay from '@/components/layout/BackendDownOverlay';
import Layout from '@/components/layout/Layout';
import HomePage from '@/pages/HomePage';
import ProjectPage from '@/pages/ProjectPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useWebSocketStore } from '@/store';
import { useEffect } from 'react';

// Lazy-loaded heavy pages - keep initial bundle small
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ClipEditorPage = lazy(() => import('@/pages/ClipEditorPage'));
const SurveillancePage = lazy(() => import('@/pages/SurveillancePage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage'));
const ClipHistoryPage = lazy(() => import('@/pages/ClipHistoryPage'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-viral-medium border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  // Check engine status on mount
  useEngineStatus();

  // Global G-chord navigation shortcuts (G+H, G+A, G+T, G+S).
  useGlobalShortcuts();

  // Connect to WebSocket
  const { connect } = useWebSocketStore();
  useEffect(() => {
    connect();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [connect]);

  return (
    <ErrorBoundary>
      <Layout>
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
              <Route path="/project/:id/*" element={<ErrorBoundary><ProjectPage /></ErrorBoundary>} />
              <Route path="/editor/:projectId" element={<ErrorBoundary><ClipEditorPage /></ErrorBoundary>} />
              <Route path="/surveillance" element={<ErrorBoundary><SurveillancePage /></ErrorBoundary>} />
              <Route path="/admin" element={<ErrorBoundary><AdminPage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
              <Route path="/onboarding" element={<ErrorBoundary><OnboardingPage /></ErrorBoundary>} />
              <Route path="/templates" element={<ErrorBoundary><TemplatesPage /></ErrorBoundary>} />
              <Route path="/history" element={<ErrorBoundary><ClipHistoryPage /></ErrorBoundary>} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </Layout>
      <ShortcutsOverlay />
      <CommandPalette />
      <BackendDownOverlay />
      <Toaster />
    </ErrorBoundary>
  );
}
