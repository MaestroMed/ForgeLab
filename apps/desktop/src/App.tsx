import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Toaster } from '@/components/ui/Toaster';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import HomePage from '@/pages/HomePage';
import ProjectPage from '@/pages/ProjectPage';
import SettingsPage from '@/pages/SettingsPage';
import ClipEditorPage from '@/pages/ClipEditorPage';
import SurveillancePage from '@/pages/SurveillancePage';
import AdminPage from '@/pages/AdminPage';
import AnalyticsPage from '@/pages/AnalyticsPage';
import OnboardingPage from '@/pages/OnboardingPage';
import TemplatesPage from '@/pages/TemplatesPage';
import { useEngineStatus } from '@/hooks/useEngineStatus';
import { useWebSocketStore } from '@/store';
import { useEffect } from 'react';

export default function App() {
  // Check engine status on mount
  useEngineStatus();
  
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
          </Routes>
        </AnimatePresence>
      </Layout>
      <Toaster />
    </ErrorBoundary>
  );
}
