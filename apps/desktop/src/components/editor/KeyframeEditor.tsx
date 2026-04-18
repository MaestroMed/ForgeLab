/**
 * Keyframe Editor Component
 * 
 * Provides detailed keyframe editing with easing curves
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  ChevronRight, Diamond, Trash2, Copy, 
  ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';

import type { Keyframe } from './MultiTrackTimeline';

interface KeyframeEditorProps {
  keyframes: Keyframe[];
  trackName: string;
  trackColor: string;
  currentTime: number;
  duration: number;
  onKeyframeAdd: (time: number) => void;
  onKeyframeChange: (keyframeId: string, updates: Partial<Keyframe>) => void;
  onKeyframeDelete: (keyframeId: string) => void;
  onSeek: (time: number) => void;
}

type EasingType = Keyframe['easing'];

const EASING_OPTIONS: { value: EasingType; label: string; icon: React.ReactNode }[] = [
  { value: 'linear', label: 'Linear', icon: <ChevronRight className="w-4 h-4" /> },
  { value: 'ease-in', label: 'Ease In', icon: <ArrowUpRight className="w-4 h-4" /> },
  { value: 'ease-out', label: 'Ease Out', icon: <ArrowDownRight className="w-4 h-4" /> },
  { value: 'ease-in-out', label: 'Ease In-Out', icon: <Activity className="w-4 h-4" /> },
  { value: 'bounce', label: 'Bounce', icon: <Diamond className="w-4 h-4" /> },
];

export function KeyframeEditor({
  keyframes,
  trackName,
  trackColor,
  currentTime,
  duration,
  onKeyframeAdd,
  onKeyframeChange,
  onKeyframeDelete,
  onSeek
}: KeyframeEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
  const selectedKeyframe = keyframes.find(k => k.id === selectedId);
  
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };
  
  const handleAddAtCurrentTime = useCallback(() => {
    onKeyframeAdd(currentTime);
  }, [currentTime, onKeyframeAdd]);
  
  const handleDuplicate = useCallback(() => {
    if (!selectedKeyframe) return;
    // Add new keyframe at current time with same value
    onKeyframeAdd(currentTime);
  }, [selectedKeyframe, currentTime, onKeyframeAdd]);
  
  const handleValueChange = useCallback((value: number) => {
    if (!selectedId) return;
    onKeyframeChange(selectedId, { value });
  }, [selectedId, onKeyframeChange]);
  
  const handleEasingChange = useCallback((easing: EasingType) => {
    if (!selectedId) return;
    onKeyframeChange(selectedId, { easing });
  }, [selectedId, onKeyframeChange]);
  
  const handleTimeChange = useCallback((time: number) => {
    if (!selectedId) return;
    onKeyframeChange(selectedId, { time: Math.max(0, Math.min(duration, time)) });
  }, [selectedId, duration, onKeyframeChange]);
  
  // Generate curve preview SVG
  const renderCurvePreview = () => {
    if (sortedKeyframes.length < 2) {
      return null;
    }
    
    const width = 200;
    const height = 60;
    const padding = 10;
    
    const points = sortedKeyframes.map((k, _i) => ({
      x: padding + (k.time / duration) * (width - 2 * padding),
      y: height - padding - (k.value / 100) * (height - 2 * padding),
      easing: k.easing
    }));
    
    // Build path with easing curves
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      
      // Apply easing type to curve
      const easing = curr.easing;
      if (easing === 'linear') {
        path += ` L ${curr.x} ${curr.y}`;
      } else if (easing === 'ease-in') {
        path += ` Q ${curr.x} ${prev.y} ${curr.x} ${curr.y}`;
      } else if (easing === 'ease-out') {
        path += ` Q ${prev.x} ${curr.y} ${curr.x} ${curr.y}`;
      } else if (easing === 'ease-in-out') {
        path += ` C ${midX} ${prev.y} ${midX} ${curr.y} ${curr.x} ${curr.y}`;
      } else if (easing === 'bounce') {
        const bounceY = curr.y - 10;
        path += ` Q ${midX} ${bounceY} ${curr.x} ${curr.y}`;
      }
    }
    
    return (
      <svg width={width} height={height} className="bg-gray-800/50 rounded">
        {/* Grid */}
        <line x1={padding} y1={height/2} x2={width-padding} y2={height/2} 
          stroke="#374151" strokeWidth={1} strokeDasharray="4" />
        
        {/* Curve */}
        <path
          d={path}
          fill="none"
          stroke={trackColor}
          strokeWidth={2}
        />
        
        {/* Keyframe points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={sortedKeyframes[i].id === selectedId ? '#fff' : trackColor}
            stroke={trackColor}
            strokeWidth={2}
            className="cursor-pointer"
            onClick={() => setSelectedId(sortedKeyframes[i].id)}
          />
        ))}
        
        {/* Current time indicator */}
        <line
          x1={padding + (currentTime / duration) * (width - 2 * padding)}
          y1={0}
          x2={padding + (currentTime / duration) * (width - 2 * padding)}
          y2={height}
          stroke="#EF4444"
          strokeWidth={1}
          strokeDasharray="2"
        />
      </svg>
    );
  };
  
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: trackColor }}
          />
          <h3 className="font-medium text-white">{trackName} Keyframes</h3>
          <span className="text-xs text-gray-500">
            ({keyframes.length} keyframes)
          </span>
        </div>
        
        <button
          onClick={handleAddAtCurrentTime}
          className="px-3 py-1 bg-cyan-600/20 text-cyan-400 rounded text-sm 
            hover:bg-cyan-600/30 transition-colors flex items-center gap-1"
        >
          <Diamond className="w-3 h-3" />
          Add at {formatTime(currentTime)}
        </button>
      </div>
      
      {/* Curve Preview */}
      <div className="mb-4">
        {renderCurvePreview()}
      </div>
      
      {/* Keyframe List */}
      <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
        {sortedKeyframes.map((keyframe, index) => (
          <motion.div
            key={keyframe.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors
              ${selectedId === keyframe.id 
                ? 'bg-gray-700/50 ring-1 ring-cyan-500/50' 
                : 'bg-gray-800/50 hover:bg-gray-700/30'}`}
            onClick={() => setSelectedId(keyframe.id)}
          >
            {/* Keyframe number */}
            <span className="text-xs text-gray-500 w-4">#{index + 1}</span>
            
            {/* Diamond icon */}
            <Diamond 
              className="w-3 h-3" 
              style={{ color: trackColor, fill: selectedId === keyframe.id ? trackColor : 'transparent' }}
            />
            
            {/* Time */}
            <button
              onClick={(e) => { e.stopPropagation(); onSeek(keyframe.time); }}
              className="text-sm font-mono text-gray-300 hover:text-white"
            >
              {formatTime(keyframe.time)}
            </button>
            
            {/* Value */}
            <span className="text-sm text-gray-400">
              {Math.round(keyframe.value)}%
            </span>
            
            {/* Easing */}
            <span className="text-xs text-gray-500 capitalize">
              {keyframe.easing.replace('-', ' ')}
            </span>
            
            {/* Actions */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onKeyframeDelete(keyframe.id); }}
                className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-600/50"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
        
        {keyframes.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-4">
            No keyframes. Click "Add" to create one.
          </p>
        )}
      </div>
      
      {/* Selected Keyframe Editor */}
      {selectedKeyframe && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="border-t border-gray-700 pt-4 space-y-4"
        >
          <h4 className="text-sm font-medium text-gray-400">Edit Keyframe</h4>
          
          {/* Time input */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-12">Time:</label>
            <input
              type="number"
              step={0.1}
              min={0}
              max={duration}
              value={selectedKeyframe.time.toFixed(2)}
              onChange={(e) => handleTimeChange(parseFloat(e.target.value))}
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 
                text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-xs text-gray-500">sec</span>
          </div>
          
          {/* Value slider */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-12">Value:</label>
            <input
              type="range"
              min={0}
              max={100}
              value={selectedKeyframe.value}
              onChange={(e) => handleValueChange(parseInt(e.target.value))}
              className="flex-1 accent-cyan-500"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(selectedKeyframe.value)}
              onChange={(e) => handleValueChange(parseInt(e.target.value))}
              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 
                text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
          
          {/* Easing selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-12">Easing:</label>
            <div className="flex gap-1 flex-1">
              {EASING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleEasingChange(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded text-xs
                    transition-colors
                    ${selectedKeyframe.easing === opt.value
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  title={opt.label}
                >
                  {opt.icon}
                </button>
              ))}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleDuplicate}
              className="flex-1 flex items-center justify-center gap-2 py-2 
                bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
            <button
              onClick={() => onKeyframeDelete(selectedKeyframe.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 
                bg-red-900/30 hover:bg-red-900/50 rounded text-sm text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default KeyframeEditor;
