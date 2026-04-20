import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { ENGINE_BASE_URL } from '@/lib/config';
import {
  useEngineStore, useToastStore, useThemeStore, useAmbientAudioStore,
  useSubtitleStyleStore, useIntroStore, AmbientTrack
} from '@/store';
import { useAuthStore } from '@/store/auth';
import { useSocialStatus } from '@/lib/hooks/useSocialStatus';
import {
  FolderOpen, HardDrive, RefreshCw, Zap, Cloud, Monitor,
  Palette, Volume2, Key, FileVideo, FlaskConical, Settings, Sun, Moon,
  Sparkles, Check, Eye, EyeOff, Trash2, Download,
  Share2, Building2
} from 'lucide-react';

// Settings sections
const SETTINGS_SECTIONS = [
  { id: 'appearance', icon: Palette, label: 'Apparence' },
  { id: 'audio', icon: Volume2, label: 'Audio' },
  { id: 'storage', icon: HardDrive, label: 'Stockage' },
  { id: 'api-keys', icon: Key, label: 'Clés API' },
  { id: 'performance', icon: Zap, label: 'Performances' },
  { id: 'export', icon: FileVideo, label: 'Export' },
  { id: 'experimental', icon: FlaskConical, label: 'Expérimental' },
  { id: 'cloud-gpu', icon: Cloud, label: 'Cloud GPU' },
  { id: 'social', icon: Share2, label: 'Réseaux sociaux' },
  { id: 'enterprise', icon: Building2, label: 'Enterprise' },
];

interface ProviderInfo {
  name: string;
  description: string;
  available: boolean;
  configured?: boolean;
  cost_per_hour: number;
  icon: string;
}

interface ProvidersData {
  current: string;
  available: string[];
  providers: Record<string, ProviderInfo>;
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('appearance');
  const { connected, services } = useEngineStore();
  const { addToast } = useToastStore();
  const [libraryPath, setLibraryPath] = useState('');
  const [capabilities, setCapabilities] = useState<any>(null);
  const [, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [currentProvider, setCurrentProvider] = useState('local');
  const [switchingProvider, setSwitchingProvider] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      if (window.forge) {
        const path = await window.forge.getLibraryPath();
        setLibraryPath(path);
      }

      if (connected) {
        const caps = await api.getCapabilities();
        setCapabilities(caps);
        
        const providersResp = await api.getTranscriptionProviders();
        if (providersResp.success) {
          setProviders(providersResp);
          setCurrentProvider(providersResp.current);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      addToast({ type: 'error', title: 'Erreur de chargement', message: 'Impossible de charger les paramètres. Moteur hors ligne ?', duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const switchProvider = async (provider: string) => {
    if (switchingProvider) return;
    
    setSwitchingProvider(true);
    try {
      const response = await api.setTranscriptionProvider(provider);
      if (response.success) {
        setCurrentProvider(provider);
        addToast({
          type: 'success',
          title: 'Provider changé',
          message: `Transcription via ${provider === 'local' ? 'GPU Local' : provider === 'openai' ? 'OpenAI' : 'Deepgram'}`,
        });
      } else {
        throw new Error(response.error || 'Failed to switch provider');
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Erreur',
        message: error instanceof Error ? error.message : 'Impossible de changer de provider',
      });
    } finally {
      setSwitchingProvider(false);
    }
  };

  return (
    <div className="h-full flex">
      {/* Sidebar navigation */}
      <aside className="w-56 border-r border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center gap-2 mb-6 px-2">
          <Settings className="w-5 h-5 text-[var(--accent-color)]" />
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Paramètres</h1>
        </div>
        
        <nav className="space-y-1">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                  ${isActive 
                    ? 'bg-[var(--accent-color)] text-white' 
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {section.label}
              </button>
            );
          })}
        </nav>
        
        {/* Version info */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
            FORGE LAB v1.0.0
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-2xl"
          >
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'audio' && <AudioSection />}
            {activeSection === 'storage' && (
              <StorageSection 
                libraryPath={libraryPath} 
                setLibraryPath={setLibraryPath}
                capabilities={capabilities}
              />
            )}
            {activeSection === 'api-keys' && (
              <div className="space-y-6">
                <ApiKeysSection
                  providers={providers}
                  currentProvider={currentProvider}
                  switchProvider={switchProvider}
                  switchingProvider={switchingProvider}
                />
                <UserApiSection />
              </div>
            )}
            {activeSection === 'performance' && (
              <PerformanceSection 
                capabilities={capabilities}
                services={services}
                connected={connected}
                loadSettings={loadSettings}
              />
            )}
            {activeSection === 'export' && <ExportDefaultsSection />}
            {activeSection === 'experimental' && <ExperimentalSection />}
            {activeSection === 'cloud-gpu' && <CloudGpuSection />}
            {activeSection === 'social' && <SocialSection />}
            {activeSection === 'enterprise' && <EnterpriseSection />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ============ APPEARANCE SECTION ============
function AppearanceSection() {
  const { theme, setTheme } = useThemeStore();
  
  const themes = [
    { id: 'light', label: 'Clair', icon: Sun, description: 'Interface claire et lumineuse' },
    { id: 'dark', label: 'Sombre', icon: Moon, description: 'Mode nuit confortable' },
    { id: 'westworld', label: 'Westworld', icon: Sparkles, description: 'Thème laboratoire Delos' },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Apparence</h2>
        <p className="text-sm text-[var(--text-muted)]">Personnalisez l'interface de FORGE LAB</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thème</CardTitle>
          <CardDescription>Choisissez votre thème préféré</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => {
              const Icon = t.icon;
              const isSelected = theme === t.id;
              
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all text-left
                    ${isSelected 
                      ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' 
                      : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
                    }
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent-color)] flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-[var(--accent-color)]' : 'text-[var(--text-muted)]'}`} />
                  <div className="font-medium text-[var(--text-primary)]">{t.label}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">{t.description}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Animations</CardTitle>
          <CardDescription>Contrôlez les effets visuels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <ToggleSetting
              label="Animations de transition"
              description="Effets de fondu et de glissement"
              defaultChecked={true}
            />
            <ToggleSetting
              label="Effets Westworld"
              description="Grille et scan (thème Westworld uniquement)"
              defaultChecked={true}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ AUDIO SECTION ============
function AudioSection() {
  const { 
    enabled, volume, track, fadeOnActivity, sfxEnabled, sfxVolume,
    setEnabled, setVolume, setTrack, setFadeOnActivity, setSfxEnabled, setSfxVolume
  } = useAmbientAudioStore();

  const tracks: { id: AmbientTrack; label: string; description: string }[] = [
    { id: 'westworld', label: 'Westworld', description: 'Ambiance cinématique' },
    { id: 'minimal', label: 'Minimal', description: 'Drone subtil' },
    { id: 'deep', label: 'Deep', description: 'Basses profondes' },
    { id: 'none', label: 'Désactivé', description: 'Pas de musique' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Audio</h2>
        <p className="text-sm text-[var(--text-muted)]">Gérez la musique d'ambiance et les effets sonores</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Musique d'ambiance</CardTitle>
          <CardDescription>Boucle audio en arrière-plan pour une expérience immersive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Activer la musique d'ambiance"
            description="Joue une boucle audio en fond"
            checked={enabled}
            onChange={setEnabled}
          />
          
          <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">Volume</span>
                <span className="text-sm text-[var(--text-muted)]">{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div>
              <span className="text-sm font-medium text-[var(--text-primary)] block mb-3">Piste</span>
              <div className="grid grid-cols-2 gap-2">
                {tracks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTrack(t.id)}
                    className={`
                      p-3 rounded-lg border text-left transition-colors
                      ${track === t.id 
                        ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' 
                        : 'border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                      }
                    `}
                  >
                    <div className="font-medium text-sm text-[var(--text-primary)]">{t.label}</div>
                    <div className="text-xs text-[var(--text-muted)]">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <ToggleSetting
              label="Atténuer pendant les tâches"
              description="Réduit le volume automatiquement pendant les exports"
              checked={fadeOnActivity}
              onChange={setFadeOnActivity}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Effets sonores</CardTitle>
          <CardDescription>Sons de notification pour les événements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Activer les effets sonores"
            description="Sons pour les notifications et alertes"
            checked={sfxEnabled}
            onChange={setSfxEnabled}
          />
          
          <div className={`${!sfxEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-primary)]">Volume SFX</span>
              <span className="text-sm text-[var(--text-muted)]">{sfxVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={sfxVolume}
              onChange={(e) => setSfxVolume(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ STORAGE SECTION ============
function StorageSection({ 
  libraryPath, 
  setLibraryPath, 
  capabilities 
}: { 
  libraryPath: string; 
  setLibraryPath: (path: string) => void;
  capabilities: any;
}) {
  const { addToast } = useToastStore();

  const selectLibraryPath = async () => {
    if (!window.forge) return;
    
    const path = await window.forge.selectDirectory();
    if (path) {
      setLibraryPath(path);
      addToast({
        type: 'info',
        title: 'Chemin mis à jour',
        message: 'Redémarrez l\'application pour appliquer le changement',
      });
    }
  };

  const openLibrary = async () => {
    if (window.forge && libraryPath) {
      await window.forge.openPath(libraryPath);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Stockage</h2>
        <p className="text-sm text-[var(--text-muted)]">Gérez l'espace de stockage et les fichiers</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dossier Library</CardTitle>
          <CardDescription>Emplacement des projets et fichiers générés</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={libraryPath}
              readOnly
              className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)]"
            />
            <Button variant="secondary" onClick={selectLibraryPath}>
              Changer
            </Button>
            <Button variant="ghost" size="icon" onClick={openLibrary}>
              <FolderOpen className="w-4 h-4" />
            </Button>
          </div>

          {capabilities?.storage && (
            <div className="p-3 bg-[var(--bg-secondary)] rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Espace libre</span>
                <span className="font-medium text-[var(--text-primary)]">
                  {formatBytes(capabilities.storage.freeSpace)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nettoyage automatique</CardTitle>
          <CardDescription>Supprime automatiquement les anciens fichiers temporaires</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Nettoyage automatique"
            description="Nettoie les fichiers de plus de 30 jours"
            defaultChecked={false}
          />
          
          <Button variant="secondary" className="w-full">
            <Trash2 className="w-4 h-4 mr-2" />
            Vider le cache maintenant
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ API KEYS SECTION ============
function ApiKeysSection({ 
  providers, 
  currentProvider, 
  switchProvider, 
  switchingProvider 
}: {
  providers: ProvidersData | null;
  currentProvider: string;
  switchProvider: (provider: string) => void;
  switchingProvider: boolean;
}) {
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [showDeepgram, setShowDeepgram] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [deepgramKey, setDeepgramKey] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Clés API</h2>
        <p className="text-sm text-[var(--text-muted)]">Configurez vos clés pour les services cloud</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider de transcription</CardTitle>
          <CardDescription>Choisissez le moteur pour l'analyse audio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProviderOption
            id="local"
            name="GPU Local"
            description="RTX 4070 Ti • Gratuit • ~25min/3h"
            icon={<Monitor className="w-5 h-5" />}
            available={true}
            selected={currentProvider === 'local'}
            loading={switchingProvider}
            onClick={() => switchProvider('local')}
            badge="Gratuit"
            badgeColor="emerald"
          />
          
          <ProviderOption
            id="openai"
            name="OpenAI Whisper"
            description="API Cloud • $0.36/h • ~5min/3h"
            icon={<Cloud className="w-5 h-5" />}
            available={providers?.providers?.openai?.configured || false}
            selected={currentProvider === 'openai'}
            loading={switchingProvider}
            onClick={() => switchProvider('openai')}
            badge={providers?.providers?.openai?.configured ? "Configuré" : "Clé requise"}
            badgeColor={providers?.providers?.openai?.configured ? "blue" : "amber"}
          />
          
          <ProviderOption
            id="deepgram"
            name="Deepgram Nova-2"
            description="API Cloud • $0.26/h • ~3min/3h (le plus rapide)"
            icon={<Zap className="w-5 h-5" />}
            available={providers?.providers?.deepgram?.configured || false}
            selected={currentProvider === 'deepgram'}
            loading={switchingProvider}
            onClick={() => switchProvider('deepgram')}
            badge={providers?.providers?.deepgram?.configured ? "Configuré" : "Clé requise"}
            badgeColor={providers?.providers?.deepgram?.configured ? "purple" : "amber"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clés API</CardTitle>
          <CardDescription>Entrez vos clés pour activer les services cloud</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">
              OpenAI API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showOpenAI ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAI(!showOpenAI)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showOpenAI ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button variant="secondary">Sauvegarder</Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">
              Deepgram API Key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showDeepgram ? 'text' : 'password'}
                  value={deepgramKey}
                  onChange={(e) => setDeepgramKey(e.target.value)}
                  placeholder="dg-..."
                  className="w-full px-3 py-2 pr-10 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepgram(!showDeepgram)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showDeepgram ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button variant="secondary">Sauvegarder</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ USER API SECTION (personal key + webhook) ============
function UserApiSection() {
  const { token } = useAuthStore();
  const { addToast } = useToastStore();
  const [apiKey, setApiKey] = useState<string>('');
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${ENGINE_BASE_URL}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        setApiKey(data?.api_key || '');
        setWebhookUrl(data?.webhook_url || '');
      })
      .catch(() => {});
  }, [token]);

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API publique & Webhook</CardTitle>
          <CardDescription>
            Connectez-vous en mode SaaS pour gérer vos clés API.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rotateKey = async () => {
    try {
      const res = await fetch(`${ENGINE_BASE_URL}/v1/auth/me/api-key/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setApiKey(data?.api_key || '');
      addToast({ type: 'success', title: 'Clé rotée', message: 'Nouvelle clé API générée.' });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'Rotation impossible.' });
    }
  };

  const saveWebhook = async () => {
    try {
      await fetch(`${ENGINE_BASE_URL}/v1/auth/me/webhook`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });
      addToast({ type: 'success', title: 'Webhook enregistré', message: 'URL mise à jour.' });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'Enregistrement impossible.' });
    }
  };

  const copyKey = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey).catch(() => {});
    addToast({ type: 'success', title: 'Copié' });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Clé API personnelle</CardTitle>
          <CardDescription>
            Pour l'API publique /v2/clips — gardez-la secrète.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              readOnly
              className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm font-mono"
            />
            <Button variant="secondary" size="sm" onClick={() => setShowApiKey(!showApiKey)}>
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button variant="secondary" size="sm" onClick={copyKey}>
              Copier
            </Button>
            <Button variant="secondary" size="sm" onClick={rotateKey}>
              Rotate
            </Button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Utilisation:{' '}
            <code className="bg-white/10 px-1 rounded">
              X-API-Key: {apiKey ? `${apiKey.slice(0, 8)}...` : '...'}
            </code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook de complétion</CardTitle>
          <CardDescription>URL appelée quand un job /v2/clips se termine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-server.com/hooks/forge"
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm"
          />
          <Button onClick={saveWebhook}>Enregistrer</Button>
        </CardContent>
      </Card>
    </>
  );
}

// ============ PERFORMANCE SECTION ============
function PerformanceSection({ 
  capabilities, 
  services, 
  connected,
  loadSettings 
}: { 
  capabilities: any; 
  services: any;
  connected: boolean;
  loadSettings: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Performances</h2>
        <p className="text-sm text-[var(--text-muted)]">Optimisez les performances de traitement</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>État du moteur</CardTitle>
          <CardDescription>Services et capacités système</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <StatusItem
              label="Moteur"
              status={connected}
              detail={connected ? 'Connecté' : 'Déconnecté'}
            />
            <StatusItem
              label="FFmpeg"
              status={services.ffmpeg}
              detail={capabilities?.ffmpeg?.version || 'Non détecté'}
            />
            <StatusItem
              label="NVENC (GPU)"
              status={services.nvenc}
              detail={capabilities?.gpu?.available ? capabilities.gpu.name : 'Non disponible'}
            />
            <StatusItem
              label="Whisper"
              status={services.whisper}
              detail={capabilities?.whisper?.currentModel || 'Non chargé'}
            />
          </div>

          <Button variant="secondary" className="mt-4" onClick={loadSettings}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accélération GPU</CardTitle>
          <CardDescription>Utiliser le GPU pour le rendu vidéo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="NVENC (NVIDIA)"
            description="Encodage matériel pour exports plus rapides"
            checked={services.nvenc}
            disabled
          />
          
          {capabilities?.gpu?.available && (
            <div className="p-3 bg-[var(--bg-secondary)] rounded-lg">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {capabilities.gpu.name}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                {capabilities.gpu.memoryTotal}GB VRAM
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualité proxy</CardTitle>
          <CardDescription>Résolution des previews pendant l'édition</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {['480p', '720p', '1080p'].map((quality) => (
              <button
                key={quality}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${quality === '720p'
                    ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                  }
                `}
              >
                <div className="font-medium text-[var(--text-primary)]">{quality}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {quality === '480p' ? 'Rapide' : quality === '720p' ? 'Équilibré' : 'Qualité'}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ EXPORT DEFAULTS SECTION ============
function ExportDefaultsSection() {
  const { style, presetName } = useSubtitleStyleStore();
  const { config: introConfig } = useIntroStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Export par défaut</h2>
        <p className="text-sm text-[var(--text-muted)]">Paramètres appliqués à tous les exports</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plateforme cible</CardTitle>
          <CardDescription>Format optimisé pour la plateforme choisie</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {['TikTok', 'YouTube Shorts', 'Instagram'].map((platform) => (
              <button
                key={platform}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${platform === 'TikTok'
                    ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-tertiary)]'
                  }
                `}
              >
                <div className="font-medium text-sm text-[var(--text-primary)]">{platform}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Options par défaut</CardTitle>
          <CardDescription>Inclus automatiquement dans les exports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Inclure les sous-titres"
            description="Brûler les sous-titres dans la vidéo"
            defaultChecked={true}
          />
          <ToggleSetting
            label="Inclure l'intro"
            description="Ajouter l'intro configurée au début"
            checked={introConfig.enabled}
          />
          <ToggleSetting
            label="Générer la cover"
            description="Créer une miniature automatiquement"
            defaultChecked={true}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Style de sous-titres</CardTitle>
          <CardDescription>Preset actuel : {presetName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-[var(--bg-secondary)] rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--text-primary)]">{style.fontFamily}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {style.fontSize}px • {style.animation} • {style.wordsPerLine} mots/ligne
                </div>
              </div>
              <div 
                className="w-6 h-6 rounded-full border-2 border-[var(--border-color)]"
                style={{ backgroundColor: style.highlightColor }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ EXPERIMENTAL SECTION ============
function ExperimentalSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">Expérimental</h2>
        <p className="text-sm text-[var(--text-muted)]">Fonctionnalités en développement</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Beta Features</CardTitle>
          <CardDescription>Fonctionnalités en cours de test</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Auto-reframe intelligent"
            description="Recadrage automatique basé sur la détection de visage"
            defaultChecked={false}
          />
          <ToggleSetting
            label="Génération de hooks IA"
            description="Suggère des accroches pour les clips"
            defaultChecked={false}
          />
          <ToggleSetting
            label="Mode batch avancé"
            description="Export parallèle de plusieurs clips"
            defaultChecked={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debug</CardTitle>
          <CardDescription>Outils pour le développement et diagnostic</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSetting
            label="Mode debug"
            description="Active les logs détaillés dans la console"
            defaultChecked={false}
          />
          
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Exporter les logs
            </Button>
            <Button variant="secondary" className="flex-1">
              <FolderOpen className="w-4 h-4 mr-2" />
              Ouvrir dossier logs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <p className="text-sm text-amber-400">
            ⚠️ Les fonctionnalités expérimentales peuvent être instables ou incomplètes.
            Utilisez-les à vos risques et périls.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ HELPER COMPONENTS ============

function ToggleSetting({ 
  label, 
  description, 
  checked, 
  defaultChecked,
  onChange,
  disabled = false
}: { 
  label: string; 
  description: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked ?? false);
  const isChecked = checked !== undefined ? checked : internalChecked;

  const handleChange = () => {
    if (disabled) return;
    if (onChange) {
      onChange(!isChecked);
    } else {
      setInternalChecked(!internalChecked);
    }
  };

  return (
    <div 
      className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}
      onClick={handleChange}
    >
      <div>
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        <div className="text-xs text-[var(--text-muted)]">{description}</div>
      </div>
      <button
        type="button"
        disabled={disabled}
        className={`
          relative w-10 h-5 rounded-full transition-colors cursor-pointer
          ${isChecked ? 'bg-[var(--accent-color)]' : 'bg-[var(--bg-tertiary)]'}
        `}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
          animate={{ left: isChecked ? '1.25rem' : '0.125rem' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

function StatusItem({ label, status, detail }: { label: string; status: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
      <div
        className={`w-3 h-3 rounded-full transition-all duration-300 ${
          status 
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' 
            : 'bg-[var(--text-muted)]'
        }`}
      />
      <div>
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        <div className={`text-xs ${status ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function ProviderOption({
  id,
  name,
  description,
  icon,
  available,
  selected,
  loading,
  onClick,
  badge,
  badgeColor,
}: {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  selected: boolean;
  loading: boolean;
  onClick: () => void;
  badge: string;
  badgeColor: 'emerald' | 'blue' | 'amber' | 'purple';
}) {
  const colorClasses = {
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };

  return (
    <div
      onClick={() => available && !loading && onClick()}
      className={`
        relative flex items-center gap-4 p-4 rounded-lg border-2 transition-all
        ${selected ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10' : 'border-[var(--border-color)]'}
        ${!available && id !== 'local' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-[var(--text-muted)]'}
      `}
    >
      <div className={`
        w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
        ${selected ? 'border-[var(--accent-color)] bg-[var(--accent-color)]' : 'border-[var(--text-muted)]'}
      `}>
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      
      <div className={`
        w-10 h-10 rounded-lg flex items-center justify-center
        ${selected ? 'bg-[var(--accent-color)]/20 text-[var(--accent-color)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}
      `}>
        {icon}
      </div>
      
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--text-primary)]">{name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${colorClasses[badgeColor]}`}>
            {badge}
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      
      {loading && selected && (
        <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-color)]" />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// ============ CLOUD GPU SECTION ============
function CloudGpuSection() {
  const [status, setStatus] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [estimate, setEstimate] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState('local');
  const [testDuration, setTestDuration] = useState(60);

  useEffect(() => {
    api.getCloudStatus().then((r: any) => setStatus(r?.data ?? r)).catch(() => {});
    api.listCloudProviders().then((r: any) => setProviders(r?.data?.providers ?? r?.providers ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    const computeEstimate = async () => {
      try {
        const r: any = await api.estimateCloudCost(testDuration, selectedProvider);
        setEstimate(r?.data ?? r);
      } catch {
        setEstimate(null);
      }
    };
    computeEstimate();
  }, [selectedProvider, testDuration]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Cloud className="w-5 h-5" /> Cloud GPU Processing</CardTitle>
        <CardDescription>
          Déléguez le traitement aux GPUs cloud quand votre machine est occupée. Coûts par clip.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-xs text-[var(--text-muted)]">Provider actuel</span>
          <p className="font-semibold">{status?.provider ?? 'Chargement...'}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Cloud {status?.cloud_enabled ? 'activé' : 'désactivé'} · Overflow {status?.overflow_enabled ? 'ON' : 'OFF'}
          </p>
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] uppercase">Provider</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {providers.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedProvider === p.id ? 'border-viral-medium bg-viral-medium/10' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  ${Number(p.rate_per_minute ?? 0).toFixed(5)}/min{p.requires_key ? ' · clé requise' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-[var(--text-muted)] uppercase">Durée test (secondes)</label>
          <input
            type="number"
            value={testDuration}
            onChange={(e) => setTestDuration(Number(e.target.value))}
            className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2"
          />
        </div>

        {estimate && (
          <div className="p-4 rounded-lg bg-viral-medium/10 border border-viral-medium/30">
            <p className="text-xs text-[var(--text-muted)]">Coût estimé</p>
            <p className="text-2xl font-bold">{estimate.cost_display ?? `$${estimate.cost_usd}`}</p>
            <p className="text-xs mt-1">~{estimate.estimated_seconds}s de traitement</p>
          </div>
        )}

        <p className="text-xs text-[var(--text-muted)] italic">
          Configurez les clés API via variables d'environnement FORGE_CLOUD_RUNPOD_API_KEY, FORGE_CLOUD_MODAL_TOKEN_ID, etc.
        </p>
      </CardContent>
    </Card>
  );
}

// ============ SOCIAL SECTION ============
function SocialSection() {
  const queryClient = useQueryClient();
  const { data: socialStatus, isLoading } = useSocialStatus();
  const accounts = socialStatus?.connected_accounts ?? [];
  const loading = isLoading;
  const { addToast } = useToastStore();

  const disconnect = async (platform: string) => {
    await api.disconnectSocial(platform);
    addToast({ type: 'success', title: 'Déconnecté', message: `${platform} déconnecté.` });
    // Invalidate the shared query so every subscriber refreshes in sync.
    queryClient.invalidateQueries({ queryKey: ['social-status'] });
  };

  const platformEmoji: Record<string, string> = {
    tiktok: '🎵',
    youtube: '▶️',
    instagram: '📸',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Comptes connectés</CardTitle>
          <CardDescription>Publiez vos clips directement sur vos plateformes.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Chargement...</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aucun compte connecté.</p>
          ) : (
            <div className="space-y-2">
              {accounts.map((acc: any) => {
                const platform = typeof acc === 'string' ? acc : acc.platform;
                const username = typeof acc === 'string' ? undefined : acc.username;
                return (
                  <div key={platform} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{platformEmoji[platform] ?? '🌐'}</span>
                      <div>
                        <p className="font-medium capitalize">{platform}</p>
                        <p className="text-xs text-[var(--text-muted)]">{username ?? '—'}</p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => disconnect(platform)}>
                      Déconnecter
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connecter un compte</CardTitle>
          <CardDescription>
            OAuth2 flow à venir. En attendant, configurez les tokens via l'API backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Utilisez <code className="bg-white/10 px-1 rounded">POST /v1/social/accounts/connect</code> avec votre token OAuth.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {['tiktok', 'youtube', 'instagram'].map((p) => (
              <div key={p} className="p-3 rounded-lg bg-white/5 border border-white/10 text-center">
                <span className="text-2xl">{platformEmoji[p]}</span>
                <p className="text-xs mt-1 capitalize">{p}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ ENTERPRISE SECTION ============
function EnterpriseSection() {
  const [branding, setBranding] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const { addToast } = useToastStore();

  useEffect(() => {
    api.getBranding().then((r: any) => setBranding(r?.data ?? r ?? {})).catch(() => setBranding({}));
    api.getStorageStatus().then((r: any) => setStorage(r?.data ?? r)).catch(() => {});
  }, []);

  const save = async () => {
    await api.updateBranding(branding);
    addToast({ type: 'success', title: 'Enregistré', message: 'Branding mis à jour.' });
  };

  const testS3 = async () => {
    try {
      const r: any = await api.testS3Connection();
      const data = r?.data ?? r;
      if (data?.connected) {
        addToast({ type: 'success', title: 'S3 OK', message: `${data.buckets.length} buckets trouvés.` });
      } else {
        addToast({ type: 'error', title: 'S3 Error', message: 'Connexion échouée.' });
      }
    } catch {
      addToast({ type: 'error', title: 'S3 Error', message: 'Connexion échouée.' });
    }
  };

  if (!branding) return <p className="text-sm text-[var(--text-muted)]">Chargement...</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Branding</CardTitle>
          <CardDescription>Personnalisez l'apparence pour votre équipe ou client.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[var(--text-muted)]">Nom de l'app</label>
            <input
              type="text"
              value={branding.app_name || ''}
              onChange={(e) => setBranding({ ...branding, app_name: e.target.value })}
              className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-[var(--text-muted)]">Couleur principale</label>
              <input
                type="color"
                value={branding.primary_color || '#00D4FF'}
                onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
                className="w-full mt-1 h-10 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Secondaire</label>
              <input
                type="color"
                value={branding.secondary_color || '#8B5CF6'}
                onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })}
                className="w-full mt-1 h-10 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)]">Accent</label>
              <input
                type="color"
                value={branding.accent_color || '#F59E0B'}
                onChange={(e) => setBranding({ ...branding, accent_color: e.target.value })}
                className="w-full mt-1 h-10 rounded cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)]">Watermark (optionnel)</label>
            <input
              type="text"
              value={branding.watermark_text || ''}
              onChange={(e) => setBranding({ ...branding, watermark_text: e.target.value })}
              placeholder="@votre_marque"
              className="w-full mt-1 bg-white/5 border border-white/10 rounded px-3 py-2"
            />
          </div>
          <Button onClick={save}>Enregistrer le branding</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5" /> Stockage S3</CardTitle>
          <CardDescription>S3 compatible (AWS, MinIO, Wasabi, Cloudflare R2...)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Activer S3</span>
            <input
              type="checkbox"
              checked={branding.s3_enabled || false}
              onChange={(e) => setBranding({ ...branding, s3_enabled: e.target.checked })}
            />
          </div>
          {branding.s3_enabled && (
            <>
              <input
                type="text"
                placeholder="Bucket"
                value={branding.s3_bucket || ''}
                onChange={(e) => setBranding({ ...branding, s3_bucket: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
              />
              <input
                type="text"
                placeholder="Région"
                value={branding.s3_region || 'us-east-1'}
                onChange={(e) => setBranding({ ...branding, s3_region: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
              />
              <input
                type="text"
                placeholder="Endpoint custom (MinIO/R2, optionnel)"
                value={branding.s3_endpoint || ''}
                onChange={(e) => setBranding({ ...branding, s3_endpoint: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
              />
              <input
                type="text"
                placeholder="Access key"
                value={branding.s3_access_key || ''}
                onChange={(e) => setBranding({ ...branding, s3_access_key: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
              />
              <input
                type="password"
                placeholder="Secret key"
                value={branding.s3_secret_key || ''}
                onChange={(e) => setBranding({ ...branding, s3_secret_key: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2"
              />
              <div className="flex gap-2">
                <Button onClick={save}>Enregistrer</Button>
                <Button variant="secondary" onClick={testS3}>Tester la connexion</Button>
              </div>
              {storage && (
                <p className="text-xs text-[var(--text-muted)]">
                  {storage.s3_configured ? '✅ S3 configuré' : '⚠️ S3 non configuré'}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

