import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy as Restore } from 'lucide-react';
import { useEngineStore } from '@/store';
import { ThemeToggle } from './ThemeToggle';

export default function TitleBar() {
  const { connected, services } = useEngineStore();
  const [isMaximized, setIsMaximized] = useState(false);

  // Sync initial maximize state and subscribe to changes
  useEffect(() => {
    const forge = (window as any).forge;
    if (!forge) return;

    if (forge.getWindowState) {
      forge.getWindowState().then((max: boolean) => setIsMaximized(Boolean(max)));
    }

    const cleanup = forge.onMaximizeChange?.((max: boolean) => {
      setIsMaximized(Boolean(max));
    });
    return () => cleanup?.();
  }, []);

  const handleMin = () => {
    (window as any).forge?.windowMinimize?.();
  };

  const handleMax = () => {
    (window as any).forge?.windowMaximize?.();
    // Optimistic flip; the real state arrives via onMaximizeChange
    setIsMaximized((v) => !v);
  };

  const handleClose = () => {
    (window as any).forge?.windowClose?.();
  };

  return (
    <header
      data-cinema-hide="true"
      className="relative h-10 w-full flex items-center select-none bg-[#0A0A0F] border-b border-white/5 drag-region"
    >
      {/* Left: logo / title */}
      <div className="pl-4 flex items-center gap-2 text-xs text-white/70 pointer-events-none">
        <span className="w-1.5 h-1.5 rounded-full bg-viral-medium shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
        <span className="uppercase tracking-[0.22em] font-semibold">FORGE LAB</span>
      </div>

      {/* Middle: engine status dots (no-drag so dots feel "live" but still non-interactive) */}
      <div className="flex items-center gap-4 ml-8 no-drag">
        <div className="flex items-center gap-3">
          <StatusDot label="Engine" active={connected} />
          <StatusDot label="GPU" active={services.nvenc} />
          <StatusDot label="Whisper" active={services.whisper} />
        </div>

        <div className="w-px h-4 bg-white/10" />

        <ThemeToggle />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: window controls */}
      <div className="flex items-center no-drag">
        <button
          type="button"
          onClick={handleMin}
          aria-label="Minimiser"
          className="h-10 w-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleMax}
          aria-label={isMaximized ? 'Restaurer' : 'Agrandir'}
          className="h-10 w-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        >
          {isMaximized ? <Restore className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="h-10 w-12 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}

function StatusDot({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full transition-all duration-300 ${
          active
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
            : 'bg-white/20'
        }`}
      />
      <span className={`text-[11px] font-medium ${active ? 'text-white/90' : 'text-white/40'}`}>
        {label}
      </span>
    </div>
  );
}
