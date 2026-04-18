/**
 * Templates Marketplace Page
 * 
 * Local marketplace for style templates
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutTemplate,
  Search,
  Plus,
  Download,
  Upload,
  Star,
  StarOff,
  Trash2,
  Eye,
  Check,
  Grid,
  List,
  Sparkles,
  Type,
  Layers,
  Palette,
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  category: 'layout' | 'subtitle' | 'intro' | 'full';
  preview?: string;
  createdAt: string;
  isBuiltIn: boolean;
  isFavorite: boolean;
  config: any;
}

const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'gaming-standard',
    name: 'Gaming Standard',
    description: 'Layout classique avec facecam en haut à droite',
    category: 'layout',
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
    isFavorite: false,
    config: { type: 'layout', layout: 'facecam-corner' },
  },
  {
    id: 'reaction-center',
    name: 'Reaction Center',
    description: 'Facecam centrée avec gameplay en arrière-plan',
    category: 'layout',
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
    isFavorite: false,
    config: { type: 'layout', layout: 'facecam-center' },
  },
  {
    id: 'karaoke-viral',
    name: 'Karaoke Viral',
    description: 'Sous-titres style TikTok avec animation pop',
    category: 'subtitle',
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
    isFavorite: true,
    config: { type: 'subtitle', style: 'karaoke' },
  },
  {
    id: 'minimal-clean',
    name: 'Minimal Clean',
    description: 'Sous-titres simples et élégants',
    category: 'subtitle',
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
    isFavorite: false,
    config: { type: 'subtitle', style: 'minimal' },
  },
  {
    id: 'esport-pack',
    name: 'Esport Pack',
    description: 'Pack complet pour le contenu esport',
    category: 'full',
    createdAt: new Date().toISOString(),
    isBuiltIn: true,
    isFavorite: false,
    config: { type: 'full', theme: 'esport' },
  },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  layout: { label: 'Layout', icon: Layers, color: 'text-blue-400 bg-blue-500/20' },
  subtitle: { label: 'Sous-titres', icon: Type, color: 'text-purple-400 bg-purple-500/20' },
  intro: { label: 'Intro', icon: Sparkles, color: 'text-amber-400 bg-amber-500/20' },
  full: { label: 'Pack Complet', icon: Palette, color: 'text-green-400 bg-green-500/20' },
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>(BUILT_IN_TEMPLATES);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Load custom templates from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('forge_custom_templates');
    if (saved) {
      try {
        const custom = JSON.parse(saved) as Template[];
        setTemplates([...BUILT_IN_TEMPLATES, ...custom]);
      } catch (e) {
        console.error('Failed to load custom templates');
      }
    }
  }, []);

  const filteredTemplates = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (categoryFilter && t.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const toggleFavorite = (id: string) => {
    setTemplates(prev => prev.map(t =>
      t.id === id ? { ...t, isFavorite: !t.isFavorite } : t
    ));
  };

  const deleteTemplate = (id: string) => {
    const template = templates.find(t => t.id === id);
    if (template?.isBuiltIn) return;
    
    setTemplates(prev => prev.filter(t => t.id !== id));
    
    // Update localStorage
    const custom = templates.filter(t => !t.isBuiltIn && t.id !== id);
    localStorage.setItem('forge_custom_templates', JSON.stringify(custom));
  };

  const applyTemplate = (template: Template) => {
    // TODO: Apply template config to respective stores
    alert(`Template "${template.name}" appliqué!`);
  };

  const exportTemplate = (template: Template) => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}.forge-template.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importTemplate = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.forge-template.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Template;
        
        const newTemplate: Template = {
          ...imported,
          id: `custom-${Date.now()}`,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
        };
        
        setTemplates(prev => [...prev, newTemplate]);
        
        // Save to localStorage
        const custom = templates.filter(t => !t.isBuiltIn);
        custom.push(newTemplate);
        localStorage.setItem('forge_custom_templates', JSON.stringify(custom));
      } catch (e) {
        alert('Erreur lors de l\'import du template');
      }
    };
    input.click();
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <LayoutTemplate className="w-7 h-7 text-purple-400" />
            Templates
          </h1>
          <p className="text-gray-400 mt-1">Gérez et appliquez des templates de style</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={importTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 
              rounded-lg text-gray-300 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importer
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500
              rounded-lg text-white font-medium hover:shadow-lg hover:shadow-purple-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Créer un template
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher un template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2
              text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Category filter */}
        <div className="flex bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              categoryFilter === null
                ? 'bg-purple-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Tous
          </button>
          {Object.entries(CATEGORY_LABELS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                categoryFilter === key
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View mode */}
        <div className="flex bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500'
            }`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      <div className={viewMode === 'grid' 
        ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
        : 'space-y-3'
      }>
        {filteredTemplates.map((template, i) => {
          const category = CATEGORY_LABELS[template.category];
          const CategoryIcon = category.icon;

          return (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-white/5 rounded-xl border border-white/10 overflow-hidden
                hover:border-purple-500/50 transition-all group ${
                viewMode === 'list' ? 'flex items-center p-4' : ''
              }`}
            >
              {/* Preview */}
              {viewMode === 'grid' && (
                <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 
                  flex items-center justify-center relative">
                  <CategoryIcon className={`w-12 h-12 ${category.color.split(' ')[0]} opacity-30`} />
                  
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 
                    transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-2 bg-white/10 rounded-lg hover:bg-white/20"
                    >
                      <Eye className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => applyTemplate(template)}
                      className="p-2 bg-purple-500 rounded-lg hover:bg-purple-400"
                    >
                      <Check className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className={viewMode === 'grid' ? 'p-4' : 'flex-1'}>
                <div className="flex items-start justify-between">
                  <div className={viewMode === 'list' ? 'flex items-center gap-4' : ''}>
                    {viewMode === 'list' && (
                      <div className={`p-2 rounded-lg ${category.color}`}>
                        <CategoryIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium text-white">{template.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => toggleFavorite(template.id)}
                    className="p-1"
                  >
                    {template.isFavorite ? (
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <StarOff className="w-4 h-4 text-gray-600 hover:text-yellow-400" />
                    )}
                  </button>
                </div>

                {viewMode === 'grid' && (
                  <div className="flex items-center justify-between mt-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${category.color}`}>
                      {category.label}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      {!template.isBuiltIn && (
                        <button
                          onClick={() => deleteTemplate(template.id)}
                          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => exportTemplate(template)}
                        className="p-1.5 text-gray-500 hover:text-white transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === 'list' && (
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs rounded-full ${category.color}`}>
                    {category.label}
                  </span>
                  <button
                    onClick={() => applyTemplate(template)}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-400 rounded-lg 
                      text-white text-sm font-medium transition-colors"
                  >
                    Appliquer
                  </button>
                  <button
                    onClick={() => exportTemplate(template)}
                    className="p-2 text-gray-500 hover:text-white transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredTemplates.length === 0 && (
        <div className="text-center py-16">
          <LayoutTemplate className="w-16 h-16 text-gray-600 mx-auto" />
          <p className="text-gray-400 mt-4">Aucun template trouvé</p>
          <p className="text-gray-500 text-sm mt-1">
            Essayez de modifier vos filtres ou créez un nouveau template
          </p>
        </div>
      )}

      {/* Preview Modal */}
      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
            onClick={() => setPreviewTemplate(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-gray-900 rounded-2xl overflow-hidden max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 
                flex items-center justify-center">
                <p className="text-gray-500">Aperçu du template</p>
              </div>
              
              <div className="p-6">
                <h2 className="text-xl font-bold text-white">{previewTemplate.name}</h2>
                <p className="text-gray-400 mt-2">{previewTemplate.description}</p>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      applyTemplate(previewTemplate);
                      setPreviewTemplate(null);
                    }}
                    className="flex-1 py-3 bg-purple-500 hover:bg-purple-400 rounded-lg 
                      text-white font-medium transition-colors"
                  >
                    Appliquer ce template
                  </button>
                  <button
                    onClick={() => setPreviewTemplate(null)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg 
                      text-gray-300 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
