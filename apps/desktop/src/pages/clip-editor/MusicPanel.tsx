import { useState, useEffect, useRef } from 'react';
import {
  Music,
  FolderOpen,
  Trash2,
  Volume2,
  SkipForward,
} from 'lucide-react';
import { useMusicStore } from '@/store';

interface MusicPanelProps {
  selectedMusic: string | null;
  musicList: string[];
  onMusicSelect: (path: string | null) => void;
  onMusicListUpdate: (list: string[]) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  musicRef: React.MutableRefObject<HTMLAudioElement | null>;
}

export function MusicPanel({
  selectedMusic,
  musicList,
  onMusicSelect,
  onMusicListUpdate,
  videoRef,
  musicRef,
}: MusicPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const { volume, startOffset, setVolume, setStartOffset } = useMusicStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync music with video playback
  useEffect(() => {
    if (!musicRef.current || !selectedMusic) return;

    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      if (musicRef.current) {
        musicRef.current.currentTime = startOffset;
        musicRef.current.play();
        setIsPlaying(true);
      }
    };

    const handlePause = () => {
      if (musicRef.current) {
        musicRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleSeek = () => {
      if (musicRef.current) {
        // Sync music position with video (with offset)
        musicRef.current.currentTime = Math.max(0, startOffset);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeek);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeked', handleSeek);
    };
  }, [selectedMusic, musicRef, videoRef, startOffset]);

  // Update volume
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.volume = volume;
    }
  }, [volume, musicRef]);

  const handleAddFiles = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newPaths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      newPaths.push((files[i] as any).path);
    }
    onMusicListUpdate([...musicList, ...newPaths]);
    e.target.value = ''; // Reset input
  };

  const selectMusic = (path: string) => {
    onMusicSelect(path);

    // Create audio element
    if (musicRef.current) {
      musicRef.current.pause();
    }
    const audio = new Audio(`file:///${path.replace(/\\/g, '/')}`);
    audio.volume = volume;
    musicRef.current = audio;
  };

  const removeMusic = (path: string) => {
    onMusicListUpdate(musicList.filter(m => m !== path));
    if (selectedMusic === path) {
      onMusicSelect(null);
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    }
  };

  const clearSelection = () => {
    onMusicSelect(null);
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
    setIsPlaying(false);
  };

  const getFileName = (path: string) => {
    return path.split(/[/\\]/).pop() || path;
  };

  // Preset sound effects (to be added to assets/sounds/)
  const SOUND_PRESETS = [
    { id: 'none', label: 'Aucun son', icon: '🔇' },
    { id: 'swoosh', label: 'Swoosh', icon: '💨', file: 'swoosh.mp3' },
    { id: 'pop', label: 'Pop', icon: '💥', file: 'pop.mp3' },
    { id: 'ding', label: 'Ding', icon: '🔔', file: 'ding.mp3' },
    { id: 'whoosh', label: 'Whoosh', icon: '🌊', file: 'whoosh.mp3' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Musique & Sons</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ajoute ta musique TikTok préférée</p>
        </div>
        <button
          onClick={handleAddFiles}
          className="px-3 py-1.5 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 rounded-lg text-xs font-medium text-white transition-all flex items-center gap-1.5"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Current selection */}
      {selectedMusic && (
        <div className="p-3 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 flex items-center justify-center ${isPlaying ? 'animate-pulse' : ''}`}>
              <Music className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{getFileName(selectedMusic)}</p>
              <p className="text-xs text-pink-400/70">Sélectionné - Joue avec la vidéo</p>
            </div>
            <button
              onClick={clearSelection}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-400" />
            </button>
          </div>

          {/* Volume control */}
          <div className="mt-3 flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-gray-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 accent-pink-500"
            />
            <span className="text-xs text-gray-400 w-8">{Math.round(volume * 100)}%</span>
          </div>

          {/* Start offset */}
          <div className="mt-3 flex items-center gap-3">
            <SkipForward className="w-4 h-4 text-gray-400" />
            <div className="flex-1">
              <label className="text-xs text-gray-500 block mb-1">Démarrer à</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={startOffset}
                onChange={(e) => setStartOffset(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs"
              />
            </div>
            <span className="text-xs text-gray-400">{startOffset}s</span>
          </div>
        </div>
      )}

      {/* Music library */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">
          Ma bibliothèque ({musicList.length})
        </label>

        {musicList.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-white/10 text-center">
            <Music className="w-8 h-8 mx-auto text-gray-500 mb-2" />
            <p className="text-sm text-gray-400">Pas encore de musique</p>
            <p className="text-xs text-gray-500 mt-1">Clique sur "Ajouter" pour importer tes MP3</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-auto">
            {musicList.map((path, index) => (
              <div
                key={index}
                onClick={() => selectMusic(path)}
                className={`p-2.5 rounded-lg cursor-pointer transition-all flex items-center gap-2.5 ${
                  selectedMusic === path
                    ? 'bg-pink-500/20 border border-pink-500/30'
                    : 'bg-white/5 hover:bg-white/10 border border-transparent'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  selectedMusic === path
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500'
                    : 'bg-white/10'
                }`}>
                  <Music className="w-4 h-4 text-white" />
                </div>
                <span className="flex-1 text-sm text-gray-300 truncate">{getFileName(path)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMusic(path);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Intro Sound Effects */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-2">
          Son d'intro
        </label>
        <p className="text-xs text-gray-600 mb-3">Ajoute des MP3 dans assets/sounds/ pour les voir ici</p>
        <div className="grid grid-cols-3 gap-2">
          {SOUND_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-center"
              title={preset.label}
            >
              <span className="text-lg">{preset.icon}</span>
              <p className="text-[10px] text-gray-400 mt-1">{preset.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <p className="text-xs text-blue-400">
          💡 <strong>Astuce:</strong> La musique se synchronise automatiquement avec la lecture vidéo.
          Elle sera incluse dans l'export final.
        </p>
      </div>
    </div>
  );
}
