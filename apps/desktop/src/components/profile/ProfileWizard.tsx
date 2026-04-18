import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, Check, X, Layout, 
  Type, Play, Music, Settings, Sparkles, Save
} from 'lucide-react';
import { INTRO_PRESETS } from '@/store';
import { api } from '@/lib/api';

interface ProfileWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (profileId: string) => void;
  editProfileId?: string; // If editing existing
}

const STEPS = [
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'subtitles', label: 'Sous-titres', icon: Type },
  { id: 'intro', label: 'Intro', icon: Play },
  { id: 'music', label: 'Musique', icon: Music },
  { id: 'settings', label: 'Export', icon: Settings },
];

const LAYOUT_PRESETS = [
  { id: 'split-50', name: '50/50', desc: 'Facecam et contenu égaux' },
  { id: 'split-30', name: '30/70', desc: 'Facecam petite en haut' },
  { id: 'facecam-top', name: 'Facecam haut', desc: 'Facecam en haut, contenu en bas' },
  { id: 'facecam-bottom', name: 'Facecam bas', desc: 'Contenu en haut, facecam en bas' },
  { id: 'content-only', name: 'Contenu seul', desc: 'Pas de facecam' },
];

const SUBTITLE_PRESETS = [
  { id: 'karaoke', name: 'Karaoké', desc: 'Style animé mot par mot', color: '#FFD700' },
  { id: 'mrbeast', name: 'MrBeast', desc: 'Style populaire', color: '#FF0000' },
  { id: 'minimal', name: 'Minimal', desc: 'Simple et propre', color: '#FFFFFF' },
  { id: 'gaming', name: 'Gaming', desc: 'Style gaming coloré', color: '#00FF88' },
];

export default function ProfileWizard({ isOpen, onClose, onComplete, editProfileId: _editProfileId }: ProfileWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [profileName, setProfileName] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Local config state for wizard
  const [layoutPreset, setLayoutPreset] = useState('split-50');
  const [subtitlePreset, setSubtitlePreset] = useState('karaoke');
  const [introEnabled, setIntroEnabled] = useState(true);
  const [introPreset, setIntroPreset] = useState('minimal');
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicTheme] = useState('');
  const [autoExportCount, setAutoExportCount] = useState(0);
  const [minScore, setMinScore] = useState(60);
  
  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };
  
  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSave = async () => {
    if (!profileName.trim()) {
      return;
    }
    
    setSaving(true);
    try {
      const profileData = {
        name: profileName,
        layout_config: { preset: layoutPreset },
        subtitle_style: { preset: subtitlePreset },
        intro_config: { enabled: introEnabled, preset: introPreset },
        music_config: { enabled: musicEnabled, theme: musicTheme },
        export_settings: {
          format: 'mp4',
          resolution: '1080x1920',
          quality: 'high',
          use_nvenc: true,
          burn_subtitles: true,
          include_cover: true,
        },
        segment_filters: {
          min_score: minScore,
          min_duration: 30,
          max_duration: 180,
          auto_export_count: autoExportCount,
        },
        is_default: true,
      };
      
      const response = await api.request<{ success: boolean; data?: { id: string }; error?: string }>('/profiles', {
        method: 'POST',
        body: JSON.stringify(profileData),
      });

      if (response.success && response.data) {
        onComplete(response.data.id);
      }
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl mx-4 bg-[var(--bg-primary)] rounded-2xl shadow-2xl border border-[var(--border-color)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-[var(--accent-color)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Nouveau profil d'export
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-[var(--text-muted)]" />
          </button>
        </div>
        
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-1 px-6 py-4 bg-[var(--bg-secondary)]">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                  idx === currentStep 
                    ? 'bg-[var(--accent-color)] text-white' 
                    : idx < currentStep
                    ? 'bg-green-500/20 text-green-400'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {idx < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <step.icon className="w-4 h-4" />
                )}
                <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${
                  idx < currentStep ? 'bg-green-500' : 'bg-[var(--border-color)]'
                }`} />
              )}
            </div>
          ))}
        </div>
        
        {/* Content */}
        <div className="p-6 min-h-[320px]">
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <motion.div
                key="layout"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Choisissez le layout vidéo
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {LAYOUT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setLayoutPreset(preset.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        layoutPreset === preset.id
                          ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                          : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <div className="font-medium text-[var(--text-primary)]">{preset.name}</div>
                      <div className="text-sm text-[var(--text-muted)]">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            
            {currentStep === 1 && (
              <motion.div
                key="subtitles"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Style de sous-titres
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => setSubtitlePreset(preset.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        subtitlePreset === preset.id
                          ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                          : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="font-medium text-[var(--text-primary)]">{preset.name}</span>
                      </div>
                      <div className="text-sm text-[var(--text-muted)] mt-1">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            
            {currentStep === 2 && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Intro animée
                </h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={introEnabled}
                    onChange={(e) => setIntroEnabled(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-[var(--text-primary)]">Activer l'intro</span>
                </label>
                {introEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(INTRO_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => setIntroPreset(key)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          introPreset === key
                            ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                            : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
                        }`}
                      >
                        <div className="font-medium text-[var(--text-primary)] capitalize">{key}</div>
                        <div className="text-sm text-[var(--text-muted)]">
                          {preset.animation} • {preset.duration}s
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
            
            {currentStep === 3 && (
              <motion.div
                key="music"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Musique de fond
                </h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={musicEnabled}
                    onChange={(e) => setMusicEnabled(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-[var(--text-primary)]">Activer la musique</span>
                </label>
                {musicEnabled && (
                  <p className="text-sm text-[var(--text-muted)]">
                    La musique sera ajoutée à partir de votre bibliothèque lors de l'export.
                  </p>
                )}
              </motion.div>
            )}
            
            {currentStep === 4 && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-medium text-[var(--text-primary)]">
                  Paramètres d'export
                </h3>
                
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">
                    Nom du profil
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Mon profil TikTok"
                    className="w-full px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">
                    Auto-export: Top N clips après analyse
                  </label>
                  <input
                    type="number"
                    value={autoExportCount}
                    onChange={(e) => setAutoExportCount(parseInt(e.target.value) || 0)}
                    min={0}
                    max={20}
                    className="w-24 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)]"
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    0 = désactivé
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">
                    Score minimum: {minScore}
                  </label>
                  <input
                    type="range"
                    value={minScore}
                    onChange={(e) => setMinScore(parseInt(e.target.value))}
                    min={0}
                    max={100}
                    className="w-full"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Retour
          </button>
          
          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2 bg-[var(--accent-color)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Suivant
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !profileName.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>Enregistrement...</>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer le profil
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
