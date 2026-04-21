/**
 * Clip History - All exports across projects
 */

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { History, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ENGINE_BASE_URL } from '@/lib/config';

type Artifact = {
  id: string;
  projectId: string;
  projectName?: string;
  filename: string;
  type: string;
  createdAt: string;
};

export default function ClipHistoryPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['all-artifacts'],
    queryFn: async () => {
      const projects = await api.listProjects(1, 100);
      const items = projects?.data?.items || [];
      const allArtifacts: Artifact[] = [];
      for (const p of items) {
        try {
          const arts = await api.listArtifacts(p.id);
          const list = arts?.data ?? [];
          if (Array.isArray(list)) {
            for (const a of list) {
              allArtifacts.push({ ...(a as Artifact), projectName: p.name });
            }
          }
        } catch {
          /* ignore per-project errors */
        }
      }
      return allArtifacts.filter((a) => a.type === 'video');
    },
    staleTime: 30_000,
  });

  const artifacts = (data || []).filter((a) => {
    if (search && !a.filename.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-6">
            <History className="w-6 h-6 text-viral-medium" />
            <h1 className="text-2xl font-bold">Historique des clips</h1>
          </div>

          <div className="mb-4 flex gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Rechercher un clip..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg"
              />
            </div>
          </div>

          {isLoading ? (
            <p className="text-center text-[var(--text-muted)] mt-12">Chargement...</p>
          ) : artifacts.length === 0 ? (
            <p className="text-center text-[var(--text-muted)] mt-12">Aucun clip exporté.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {artifacts.map((a) => (
                <div
                  key={a.id}
                  className="cv-auto-card bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
                >
                  <div className="aspect-[9/16] bg-black rounded mb-3 overflow-hidden">
                    <video
                      src={`${ENGINE_BASE_URL}/v1/projects/${a.projectId}/artifacts/${a.id}/file`}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  </div>
                  <p className="text-sm font-medium truncate">{a.filename}</p>
                  {a.projectName && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">{a.projectName}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
