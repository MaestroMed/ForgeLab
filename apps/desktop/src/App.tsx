import { lazy, Suspense, ReactNode, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from '@/components/ui/Toaster';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import ShortcutsOverlay from '@/components/ui/ShortcutsOverlay';
import CommandPalette from '@/components/ui/CommandPalette';
import BackendDownOverlay from '@/components/layout/BackendDownOverlay';
import FurnaceHUD from '@/components/floating/FurnaceHUD';
import KeyboardHints from '@/components/floating/KeyboardHints';
import Starfield from '@/components/ambient/Starfield';
import RocketLaunch from '@/components/ambient/RocketLaunch';
import Celebration from '@/components/ambient/Celebration';
import ExportPremiere from '@/components/ambient/ExportPremiere';
import FFmpegPoetry from '@/components/ambient/FFmpegPoetry';
import Layout from '@/components/layout/Layout';
import QuickSettings from '@/components/layout/QuickSettings';
import HomePage from '@/pages/HomePage';
import ProjectPage from '@/pages/ProjectPage';
import OnboardingPage from '@/pages/OnboardingPage';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useWebSocketStore } from '@/store';

// Lazy-loaded heavy pages - keep initial bundle small
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const ClipEditorPage = lazy(() => import('@/pages/ClipEditorPage'));
const SurveillancePage = lazy(() => import('@/pages/SurveillancePage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage'));
const ClipHistoryPage = lazy(() => import('@/pages/ClipHistoryPage'));
const ReviewModePage = lazy(() => import('@/pages/ReviewModePage'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-viral-medium border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.01 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Suspense key={location.pathname} fallback={<PageLoader />}>
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <HomePage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/project/:id/*"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <ProjectPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/editor/:projectId"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <ClipEditorPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/surveillance"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <SurveillancePage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/admin"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <AdminPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/settings"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <SettingsPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/analytics"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <AnalyticsPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/onboarding"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <OnboardingPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/templates"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <TemplatesPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/history"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <ClipHistoryPage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
          <Route
            path="/review/:projectId"
            element={
              <PageWrapper>
                <ErrorBoundary>
                  <ReviewModePage />
                </ErrorBoundary>
              </PageWrapper>
            }
          />
        </Routes>
      </Suspense>
    </AnimatePresence>
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
      {/* Ambient starfield — renders behind everything, on every route */}
      <Starfield />
      <Layout>
        <AnimatedRoutes />
      </Layout>
      <ShortcutsOverlay />
      <CommandPalette />
      <BackendDownOverlay />
      <FurnaceHUD />
      <KeyboardHints />
      <RocketLaunch />
      <Celebration />
      <ExportPremiere />
      <FFmpegPoetry />
      <QuickSettings />
      <Toaster />
    </ErrorBoundary>
  );
}
