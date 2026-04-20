import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2 } from 'lucide-react';
import Sidebar from './Sidebar';
import TitleBar from './TitleBar';
import StatusBar from './StatusBar';
import JobDrawer from './JobDrawer';
import ShortcutsModal from '@/components/ui/ShortcutsModal';
import FloatingProcessWidget from '../floating/FloatingProcessWidget';
import AmbientAudioProvider from '../ambient/AmbientAudioProvider';
import { AIChat, AIChatToggle } from '@/components/assistant/AIChat';
import { useThemeStore, useUIStore } from '@/store';
import { useCinemaMode } from '@/hooks/useCinemaMode';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { theme } = useThemeStore();
  const { setFullscreen } = useUIStore();
  const isWestworld = theme === 'westworld';
  const location = useLocation();

  // Cinema mode (F11 / Cmd+Shift+F) — hides chrome via body.cinema-mode CSS
  const { cinemaMode, toggle: toggleCinema } = useCinemaMode();

  // AI Chat state
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  
  // Extract project ID from URL if in editor
  const projectIdMatch = location.pathname.match(/\/editor\/([^/]+)/);
  const currentProjectId = projectIdMatch ? projectIdMatch[1] : undefined;

  // Listen for fullscreen changes from Electron
  useEffect(() => {
    const cleanup = (window.forge as any)?.onFullscreenChange?.((isFullscreen: boolean) => {
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
      <div data-cinema-hide="true">
        <TitleBar />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — hidden in cinema mode */}
        <div className="sidebar-collapsible" data-cinema-hide="true">
          <Sidebar />
        </div>

        {/* Main content — page transitions are handled in App.tsx via AnimatePresence */}
        <main className="main-content flex-1 overflow-auto bg-[var(--bg-secondary)]">
          {children}
        </main>
      </div>

      {/* Status bar */}
      <div data-cinema-hide="true">
        <StatusBar />
      </div>

      {/* Job drawer */}
      <div data-cinema-hide="true">
        <JobDrawer />
      </div>

      {/* Cinema mode toggle — floating, always reachable */}
      <button
        type="button"
        onClick={toggleCinema}
        title={cinemaMode ? 'Quitter le mode cinéma (F11)' : 'Mode cinéma (F11)'}
        className="fixed top-2 right-2 z-50 p-2 rounded-lg bg-black/50 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-black/70 transition-colors shadow-lg"
      >
        {cinemaMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Shortcuts modal */}
      <ShortcutsModal />

      {/* Floating process widget */}
      <FloatingProcessWidget />

      {/* Ambient audio provider (invisible) */}
      <AmbientAudioProvider />
      
      {/* AI Assistant Chat */}
      <AnimatePresence>
        {isAIChatOpen && (
          <AIChat 
            isOpen={isAIChatOpen} 
            onClose={() => setIsAIChatOpen(false)}
            projectId={currentProjectId}
          />
        )}
      </AnimatePresence>
      
      {/* AI Chat Toggle Button */}
      <AIChatToggle 
        onClick={() => setIsAIChatOpen(!isAIChatOpen)} 
      />
    </div>
  );
}


