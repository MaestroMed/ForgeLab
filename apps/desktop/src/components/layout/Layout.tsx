import { ReactNode, useEffect } from 'react';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import StatusBar from './StatusBar';
import JobDrawer from './JobDrawer';
import ShortcutsModal from '@/components/ui/ShortcutsModal';
import FloatingProcessWidget from '../floating/FloatingProcessWidget';
import AmbientAudioProvider from '../ambient/AmbientAudioProvider';
import { useThemeStore, useUIStore } from '@/store';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { theme } = useThemeStore();
  const { setFullscreen } = useUIStore();
  const isWestworld = theme === 'westworld';

  // Listen for fullscreen changes from Electron
  useEffect(() => {
    const cleanup = window.forge?.onFullscreenChange?.((isFullscreen) => {
      setFullscreen(isFullscreen);
    });
    return () => cleanup?.();
  }, [setFullscreen]);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Westworld visual effects */}
      {isWestworld && (
        <>
          <div className="ww-grid-overlay" />
          <div className="ww-scan-line" />
        </>
      )}

      {/* Title bar */}
      <TitleBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 overflow-auto bg-[var(--bg-secondary)]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Job drawer */}
      <JobDrawer />

      {/* Shortcuts modal */}
      <ShortcutsModal />

      {/* Floating process widget */}
      <FloatingProcessWidget />

      {/* Ambient audio provider (invisible) */}
      <AmbientAudioProvider />
    </div>
  );
}


