import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { INTRO_PRESETS } from '@/store';

interface IntroPanelProps {
  config: any;
  segmentTitle: string;
  onConfigChange: (updates: any) => void;
  onApplyPreset: (preset: string) => void;
}

export function IntroPanel({
  config,
  segmentTitle,
  onConfigChange,
  onApplyPreset,
}: IntroPanelProps) {
  const [activeSection, setActiveSection] = useState<'style' | 'text' | 'animation'>('style');
  const [animPhase, setAnimPhase] = useState<'hidden' | 'enter' | 'wobble' | 'exit'>('hidden');

  // Initialize title with segment title if empty
  useEffect(() => {
    if (config && !config.title && segmentTitle) {
      onConfigChange({ title: segmentTitle });
    }
  }, [segmentTitle, config]);

  // Guard against undefined config
  if (!config) {
    return (
      <div className="p-4 text-center text-gray-400">
        <p>Chargement de la configuration...</p>
      </div>
    );
  }

  // Trigger preview animation - adapts to selected animation type
  const playPreview = () => {
    setAnimPhase('hidden');
    setTimeout(() => setAnimPhase('enter'), 100);
    setTimeout(() => setAnimPhase('wobble'), 600);
    setTimeout(() => setAnimPhase('exit'), (config.duration || 2) * 1000 - 400);
    setTimeout(() => setAnimPhase('hidden'), (config.duration || 2) * 1000 + 300);
  };

  // Get label animation styles based on selected animation type
  const getLabelStyle = (): React.CSSProperties => {
    const animType = config.animation || 'fade';

    // Base transition
    const baseStyle: React.CSSProperties = {
      transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    };

    // Animation-specific styles for each phase
    switch (animType) {
      case 'fade':
        switch (animPhase) {
          case 'hidden': return { ...baseStyle, opacity: 0 };
          case 'enter': return { ...baseStyle, opacity: 1 };
          case 'wobble': return { ...baseStyle, opacity: 1 };
          case 'exit': return { ...baseStyle, opacity: 0, transition: 'all 0.6s ease-out' };
          default: return baseStyle;
        }

      case 'zoom':
        switch (animPhase) {
          case 'hidden': return { ...baseStyle, transform: 'scale(0.3)', opacity: 0 };
          case 'enter': return { ...baseStyle, transform: 'scale(1)', opacity: 1 };
          case 'wobble': return { ...baseStyle, transform: 'scale(1)', opacity: 1, animation: 'pulse 1.5s ease-in-out infinite' };
          case 'exit': return { ...baseStyle, transform: 'scale(1.5)', opacity: 0, transition: 'all 0.4s ease-in' };
          default: return baseStyle;
        }

      case 'slide':
        switch (animPhase) {
          case 'hidden': return { ...baseStyle, transform: 'translateY(100%)', opacity: 0 };
          case 'enter': return { ...baseStyle, transform: 'translateY(0)', opacity: 1 };
          case 'wobble': return { ...baseStyle, transform: 'translateY(0)', opacity: 1 };
          case 'exit': return { ...baseStyle, transform: 'translateY(-100%)', opacity: 0, transition: 'all 0.4s ease-in' };
          default: return baseStyle;
        }

      case 'swoosh':
      default:
        switch (animPhase) {
          case 'hidden': return { ...baseStyle, transform: 'translateX(-120%) rotate(-5deg)', opacity: 0 };
          case 'enter': return { ...baseStyle, transform: 'translateX(0) rotate(0deg)', opacity: 1 };
          case 'wobble': return { ...baseStyle, transform: 'translateX(0) rotate(0deg)', opacity: 1, animation: 'wobble 2s ease-in-out infinite' };
          case 'exit': return { ...baseStyle, transform: 'translateX(120%) rotate(5deg)', opacity: 0, transition: 'all 0.4s ease-in' };
          default: return baseStyle;
        }
    }
  };

  // Preset visual configs
  const VISUAL_PRESETS = [
    { key: 'minimal', label: 'Minimal', icon: '◯', gradient: 'from-gray-600 to-gray-800', desc: 'Épuré & pro' },
    { key: 'neon', label: 'Néon', icon: '⚡', gradient: 'from-cyan-500 to-blue-600', desc: 'Vibrant & flashy' },
    { key: 'gaming', label: 'Gaming', icon: '🎮', gradient: 'from-purple-600 to-pink-600', desc: 'Dynamique' },
    { key: 'elegant', label: 'Élégant', icon: '✨', gradient: 'from-amber-500 to-orange-600', desc: 'Raffiné' },
  ];

  // Font options with preview
  const FONTS = [
    { value: 'Inter', label: 'Inter', style: 'font-sans' },
    { value: 'Montserrat', label: 'Montserrat', style: 'font-sans font-bold' },
    { value: 'Space Grotesk', label: 'Space Grotesk', style: 'font-mono' },
    { value: 'Playfair Display', label: 'Playfair', style: 'font-serif italic' },
    { value: 'Oswald', label: 'Oswald', style: 'font-sans uppercase tracking-wider' },
    { value: 'Bebas Neue', label: 'Bebas', style: 'font-sans uppercase tracking-widest' },
  ];

  // Animation options
  const ANIMATIONS = [
    { value: 'fade', label: 'Fondu', icon: '○', desc: 'Apparition douce' },
    { value: 'swoosh', label: 'Swoosh', icon: '➜', desc: 'Étiquette animée' },
    { value: 'zoom', label: 'Zoom', icon: '◎', desc: 'Effet d\'échelle' },
    { value: 'slide', label: 'Glisser', icon: '↑', desc: 'Entrée par le bas' },
  ];

  return (
    <div className="space-y-4">
      {/* CSS for animations */}
      <style>{`
        @keyframes wobble {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(0) rotate(-1deg); }
          75% { transform: translateX(0) rotate(1deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      {/* Live Preview Card */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-900 to-black border border-white/10">
        {/* Preview container - 9:16 aspect ratio scaled down */}
        <div
          className="relative mx-auto bg-black overflow-hidden"
          style={{ width: '100%', aspectRatio: '9/12' }}
        >
          {/* Video background simulation (blurred) */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
              filter: `blur(${config.backgroundBlur || 15}px)`,
              transform: 'scale(1.1)', // Prevent blur edge artifacts
            }}
          />

          {/* Overlay for depth */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Animated Label/Étiquette */}
          <div className="absolute inset-0 flex items-center justify-center p-3 overflow-hidden">
            <div
              className="relative"
              style={getLabelStyle()}
            >
              {/* Label background with gradient */}
              <div
                className="relative px-5 py-4 rounded-2xl shadow-2xl"
                style={{
                  background: `linear-gradient(135deg, ${config.badgeColor || '#00FF88'}15, ${config.titleColor || '#FFFFFF'}10)`,
                  border: `2px solid ${config.badgeColor || '#00FF88'}40`,
                  backdropFilter: 'blur(10px)',
                  boxShadow: `0 10px 40px ${config.badgeColor || '#00FF88'}30, 0 0 60px ${config.badgeColor || '#00FF88'}10`,
                }}
              >
                {/* Shimmer effect */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-30"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${config.titleColor || '#FFFFFF'}20, transparent)`,
                    backgroundSize: '200% 100%',
                    animation: animPhase === 'wobble' ? 'shimmer 3s infinite' : 'none',
                  }}
                />

                {/* Badge/Pseudo at top */}
                {(config.badgeText || '@etostark') && (
                  <div
                    className="text-center text-xs font-bold uppercase tracking-widest mb-1"
                    style={{ color: config.badgeColor || '#00FF88' }}
                  >
                    {config.badgeText || '@etostark'}
                  </div>
                )}

                {/* Title */}
                <h2
                  className="text-center font-bold leading-tight"
                  style={{
                    color: config.titleColor || '#FFFFFF',
                    fontSize: `${Math.min((config.titleSize || 72) / 4, 20)}px`,
                    fontFamily: config.titleFont || 'Montserrat',
                    textShadow: `0 2px 20px ${config.titleColor || '#FFFFFF'}50`,
                  }}
                >
                  {config.title || 'Titre du clip'}
                </h2>

                {/* Decorative line */}
                <div
                  className="mt-2 mx-auto h-0.5 rounded-full"
                  style={{
                    width: '60%',
                    background: `linear-gradient(90deg, transparent, ${config.badgeColor || '#00FF88'}, transparent)`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Duration indicator */}
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/70">
            {config.duration || 2}s
          </div>

          {/* Phase indicator for debug */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/50">
            {animPhase === 'hidden' ? '⏸️' : animPhase === 'enter' ? '➡️' : animPhase === 'wobble' ? '〰️' : '⬅️'}
          </div>
        </div>

        {/* Play preview button */}
        <button
          onClick={playPreview}
          className="absolute top-2 right-2 p-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-full transition-all shadow-lg group"
        >
          <Play className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
        </button>

        {/* Enable toggle overlay */}
        <div className="absolute top-2 left-2">
          <button
            onClick={() => onConfigChange({ enabled: !config.enabled })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              config.enabled
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-white/10 text-gray-400 border border-white/10'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-green-400' : 'bg-gray-500'}`} />
            {config.enabled ? 'Activé' : 'Désactivé'}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
        {[
          { key: 'style', label: '🎨 Style' },
          { key: 'text', label: '✏️ Texte' },
          { key: 'animation', label: '🎬 Anim' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key as any)}
            className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-all ${
              activeSection === tab.key
                ? 'bg-blue-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Style Section */}
      {activeSection === 'style' && (
        <div className="space-y-4">
          {/* Visual Presets */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Presets</label>
            <div className="grid grid-cols-2 gap-2">
              {VISUAL_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => onApplyPreset(preset.key)}
                  className={`relative overflow-hidden p-3 rounded-xl border transition-all group ${
                    config.animation === (INTRO_PRESETS as any)[preset.key]?.animation
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${preset.gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                  <div className="relative">
                    <span className="text-lg">{preset.icon}</span>
                    <div className="text-sm font-medium text-white mt-1">{preset.label}</div>
                    <div className="text-[10px] text-gray-400">{preset.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Titre</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.titleColor || '#FFFFFF'}
                  onChange={(e) => onConfigChange({ titleColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={config.titleColor || '#FFFFFF'}
                  onChange={(e) => onConfigChange({ titleColor: e.target.value })}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Badge</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.badgeColor || '#00FF88'}
                  onChange={(e) => onConfigChange({ badgeColor: e.target.value })}
                  className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={config.badgeColor || '#00FF88'}
                  onChange={(e) => onConfigChange({ badgeColor: e.target.value })}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Background blur */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Flou arrière-plan</label>
              <span className="text-xs text-gray-400">{config.backgroundBlur ?? 15}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={config.backgroundBlur ?? 15}
              onChange={(e) => onConfigChange({ backgroundBlur: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      )}

      {/* Text Section */}
      {activeSection === 'text' && (
        <div className="space-y-4">
          {/* Title input */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Titre principal</label>
            <input
              type="text"
              value={config.title || ''}
              onChange={(e) => onConfigChange({ title: e.target.value })}
              placeholder="Titre accrocheur..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Badge input */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Badge (@pseudo)</label>
            <input
              type="text"
              value={config.badgeText || ''}
              onChange={(e) => onConfigChange({ badgeText: e.target.value })}
              placeholder="@votrepseudo"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Font selector */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Police</label>
            <div className="grid grid-cols-3 gap-2">
              {FONTS.map((font) => (
                <button
                  key={font.value}
                  onClick={() => onConfigChange({ titleFont: font.value })}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    config.titleFont === font.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className={`text-sm ${font.style}`}>{font.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title size */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Taille</label>
              <span className="text-xs text-gray-400">{config.titleSize || 72}px</span>
            </div>
            <input
              type="range"
              min="48"
              max="120"
              value={config.titleSize || 72}
              onChange={(e) => onConfigChange({ titleSize: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      )}

      {/* Animation Section */}
      {activeSection === 'animation' && (
        <div className="space-y-4">
          {/* Animation type */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">Type d'animation</label>
            <div className="grid grid-cols-2 gap-2">
              {ANIMATIONS.map((anim) => (
                <button
                  key={anim.value}
                  onClick={() => onConfigChange({ animation: anim.value })}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    config.animation === anim.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl opacity-60">{anim.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{anim.label}</div>
                      <div className="text-[10px] text-gray-400">{anim.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Durée de l'intro</label>
              <span className="text-xs text-gray-400">{config.duration || 2}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={config.duration || 2}
              onChange={(e) => onConfigChange({ duration: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>1s</span>
              <span>3s</span>
              <span>5s</span>
            </div>
          </div>

          {/* Preview button */}
          <button
            onClick={playPreview}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 rounded-xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Prévisualiser l'animation
          </button>
        </div>
      )}

      {/* Status indicator */}
      <div className={`p-3 rounded-xl border transition-all ${
        config.enabled
          ? 'bg-green-500/5 border-green-500/20'
          : 'bg-white/5 border-white/10'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${config.enabled ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">
            {config.enabled
              ? `Intro de ${config.duration || 2}s sera ajoutée à l'export`
              : 'Intro désactivée'
            }
          </span>
        </div>
      </div>
    </div>
  );
}
