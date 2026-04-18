/**
 * Audio Mixer Component
 * 
 * Multi-track audio mixing with volume, pan, and effects
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Volume2, VolumeX, Headphones, Music,
  Trash2, Upload
} from 'lucide-react';

export interface AudioTrack {
  id: string;
  name: string;
  type: 'main' | 'music' | 'sfx' | 'voiceover';
  source?: string;
  volume: number; // 0-100
  pan: number; // -100 to 100 (left to right)
  muted: boolean;
  solo: boolean;
  startTime: number;
  duration: number;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
}

interface AudioMixerProps {
  tracks: AudioTrack[];
  onTracksChange: (tracks: AudioTrack[]) => void;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onAddTrack: (type: AudioTrack['type']) => void;
  onRemoveTrack: (trackId: string) => void;
  onImportAudio: (trackId: string) => void;
}

const TRACK_TYPE_CONFIG = {
  main: { icon: Volume2, color: '#10B981', label: 'Main Audio' },
  music: { icon: Music, color: '#EC4899', label: 'Music' },
  sfx: { icon: Headphones, color: '#F59E0B', label: 'SFX' },
  voiceover: { icon: Volume2, color: '#8B5CF6', label: 'Voiceover' },
};

export function AudioMixer({
  tracks,
  onTracksChange,
  currentTime: _currentTime,
  duration: _duration,
  isPlaying,
  onAddTrack,
  onRemoveTrack,
  onImportAudio
}: AudioMixerProps) {
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  
  const updateTrack = useCallback((trackId: string, updates: Partial<AudioTrack>) => {
    const newTracks = tracks.map(t => 
      t.id === trackId ? { ...t, ...updates } : t
    );
    onTracksChange(newTracks);
  }, [tracks, onTracksChange]);
  
  const toggleMute = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      updateTrack(trackId, { muted: !track.muted });
    }
  };
  
  const toggleSolo = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      updateTrack(trackId, { solo: !track.solo });
    }
  };
  
  // Check if any track is soloed
  const hasSolo = tracks.some(t => t.solo);
  
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/50 border-b border-gray-700">
        <h3 className="font-medium text-white flex items-center gap-2">
          <Headphones className="w-4 h-4 text-cyan-400" />
          Audio Mixer
        </h3>
        
        <div className="flex gap-2">
          <button
            onClick={() => onAddTrack('music')}
            className="px-2 py-1 text-xs bg-pink-600/20 text-pink-400 rounded hover:bg-pink-600/30 transition-colors flex items-center gap-1"
          >
            <Music className="w-3 h-3" />
            Music
          </button>
          <button
            onClick={() => onAddTrack('sfx')}
            className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded hover:bg-amber-600/30 transition-colors flex items-center gap-1"
          >
            <Headphones className="w-3 h-3" />
            SFX
          </button>
        </div>
      </div>
      
      {/* Track List */}
      <div className="divide-y divide-gray-800">
        {tracks.map(track => {
          const config = TRACK_TYPE_CONFIG[track.type];
          const Icon = config.icon;
          const isEffectivelyMuted = track.muted || (hasSolo && !track.solo);
          
          return (
            <motion.div
              key={track.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 ${selectedTrack === track.id ? 'bg-gray-800/50' : ''}`}
              onClick={() => setSelectedTrack(track.id)}
            >
              {/* Track header */}
              <div className="flex items-center gap-3 mb-2">
                <div 
                  className="w-2 h-8 rounded"
                  style={{ backgroundColor: config.color, opacity: isEffectivelyMuted ? 0.3 : 1 }}
                />
                
                <Icon 
                  className="w-4 h-4" 
                  style={{ color: config.color, opacity: isEffectivelyMuted ? 0.3 : 1 }}
                />
                
                <span className={`text-sm flex-1 ${isEffectivelyMuted ? 'text-gray-500' : 'text-white'}`}>
                  {track.name}
                </span>
                
                {/* Mute/Solo buttons */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
                  className={`p-1.5 rounded text-xs font-bold transition-colors
                    ${track.muted 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  M
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }}
                  className={`p-1.5 rounded text-xs font-bold transition-colors
                    ${track.solo 
                      ? 'bg-amber-500 text-white' 
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >
                  S
                </button>
                
                {/* Remove button (not for main) */}
                {track.type !== 'main' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.id); }}
                    className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              
              {/* Volume slider */}
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
                  className="text-gray-400 hover:text-white"
                >
                  {track.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={track.volume}
                  onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) })}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 accent-cyan-500"
                  style={{ 
                    accentColor: config.color,
                    opacity: isEffectivelyMuted ? 0.3 : 1 
                  }}
                />
                <span className="text-xs text-gray-400 w-8 text-right">
                  {track.volume}%
                </span>
              </div>
              
              {/* Pan slider */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">L</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={track.pan}
                  onChange={(e) => updateTrack(track.id, { pan: parseInt(e.target.value) })}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 accent-gray-500"
                />
                <span className="text-gray-500">R</span>
                <span className="text-gray-400 w-8 text-right">
                  {track.pan > 0 ? `R${track.pan}` : track.pan < 0 ? `L${Math.abs(track.pan)}` : 'C'}
                </span>
              </div>
              
              {/* Source info / Import button */}
              {track.type !== 'main' && (
                <div className="mt-2 flex items-center gap-2">
                  {track.source ? (
                    <span className="text-xs text-gray-500 truncate flex-1">
                      {track.source.split('/').pop()}
                    </span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onImportAudio(track.id); }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      Import audio file
                    </button>
                  )}
                </div>
              )}
              
              {/* Fade controls (expanded view) */}
              {selectedTrack === track.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-3"
                >
                  <div>
                    <label className="text-xs text-gray-500">Fade In</label>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={track.fadeIn}
                      onChange={(e) => updateTrack(track.id, { fadeIn: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                    <span className="text-xs text-gray-400">{track.fadeIn.toFixed(1)}s</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Fade Out</label>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={track.fadeOut}
                      onChange={(e) => updateTrack(track.id, { fadeOut: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                    <span className="text-xs text-gray-400">{track.fadeOut.toFixed(1)}s</span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
        
        {tracks.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Headphones className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No audio tracks</p>
          </div>
        )}
      </div>
      
      {/* Master output */}
      <div className="p-3 bg-gray-800/50 border-t border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider">Master</span>
          <div className="flex-1 h-2 bg-gray-700 rounded overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
              style={{ width: isPlaying ? '60%' : '0%', transition: 'width 0.1s' }}
            />
          </div>
          <span className="text-xs text-gray-400">-6 dB</span>
        </div>
      </div>
    </div>
  );
}

export default AudioMixer;
