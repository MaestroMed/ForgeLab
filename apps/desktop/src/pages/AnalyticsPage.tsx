/**
 * Analytics Dashboard Page
 * 
 * Performance tracking and insights for exported clips
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  Trophy,
  RefreshCw,
  Filter,
  Download,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { api } from '@/lib/api';

interface ClipStats {
  id: string;
  name: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  publishedAt: string;
  thumbnailUrl?: string;
}

interface OverviewStats {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagement: number;
  totalClips: number;
  viewsTrend: number; // percentage change
  likeTrend: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [topClips, setTopClips] = useState<ClipStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [sortBy, setSortBy] = useState<'views' | 'engagement' | 'recent'>('views');

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, sortBy]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch overview stats
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const dashboardRes = await api.request<any>(`/analytics/dashboard?days=${days}`);
      
      if (dashboardRes) {
        setOverview({
          totalViews: dashboardRes.total_views || 0,
          totalLikes: dashboardRes.total_likes || 0,
          totalComments: dashboardRes.total_comments || 0,
          totalShares: dashboardRes.total_shares || 0,
          avgEngagement: dashboardRes.avg_engagement || 0,
          totalClips: dashboardRes.total_clips || 0,
          viewsTrend: dashboardRes.views_trend || 0,
          likeTrend: dashboardRes.likes_trend || 0,
        });
      }
      
      // Fetch top clips
      const clipsRes = await api.request<any>(`/analytics/top-clips?limit=10&metric=${sortBy}&days=${days}`);
      if (clipsRes?.clips) {
        setTopClips(clipsRes.clips.map((c: any) => ({
          id: c.id,
          name: c.name || 'Clip sans nom',
          platform: c.platform || 'unknown',
          views: c.views || 0,
          likes: c.likes || 0,
          comments: c.comments || 0,
          shares: c.shares || 0,
          engagementRate: c.engagement_rate || 0,
          publishedAt: c.published_at || '',
          thumbnailUrl: c.thumbnail_url,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      // Set mock data for demo
      setOverview({
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        avgEngagement: 0,
        totalClips: 0,
        viewsTrend: 0,
        likeTrend: 0,
      });
      setTopClips([]);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    trend, 
    color 
  }: { 
    icon: any;
    label: string;
    value: number;
    trend?: number;
    color: string;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10"
    >
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${
            trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400'
          }`}>
            {trend > 0 ? <ArrowUp className="w-3 h-3" /> : trend < 0 ? <ArrowDown className="w-3 h-3" /> : null}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-white">{formatNumber(value)}</p>
        <p className="text-sm text-gray-400 mt-1">{label}</p>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-cyan-400" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-400 mt-1">Suivez les performances de vos clips</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date range selector */}
          <div className="flex bg-white/5 rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  dateRange === range
                    ? 'bg-cyan-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {range === '7d' ? '7 jours' : range === '30d' ? '30 jours' : '90 jours'}
              </button>
            ))}
          </div>
          
          <button
            onClick={fetchAnalytics}
            className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Eye}
          label="Total Vues"
          value={overview?.totalViews || 0}
          trend={overview?.viewsTrend}
          color="bg-blue-500"
        />
        <StatCard
          icon={Heart}
          label="Total Likes"
          value={overview?.totalLikes || 0}
          trend={overview?.likeTrend}
          color="bg-pink-500"
        />
        <StatCard
          icon={MessageCircle}
          label="Commentaires"
          value={overview?.totalComments || 0}
          color="bg-purple-500"
        />
        <StatCard
          icon={Share2}
          label="Partages"
          value={overview?.totalShares || 0}
          color="bg-green-500"
        />
      </div>

      {/* Additional metrics */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl p-5 border border-cyan-500/20"
        >
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <p className="text-2xl font-bold text-white">{overview?.totalClips || 0}</p>
              <p className="text-sm text-gray-400">Clips publiés</p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-5 border border-purple-500/20"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-purple-400" />
            <div>
              <p className="text-2xl font-bold text-white">{overview?.avgEngagement?.toFixed(1) || 0}%</p>
              <p className="text-sm text-gray-400">Engagement moyen</p>
            </div>
          </div>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-xl p-5 border border-green-500/20"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-2xl font-bold text-white">-</p>
              <p className="text-sm text-gray-400">Durée moyenne visionnée</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Top Clips */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10"
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Top Clips</h2>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              <option value="views">Par vues</option>
              <option value="engagement">Par engagement</option>
              <option value="recent">Récents</option>
            </select>
          </div>
        </div>
        
        <div className="divide-y divide-white/5">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
              <p className="text-gray-400 mt-2">Chargement...</p>
            </div>
          ) : topClips.length === 0 ? (
            <div className="p-8 text-center">
              <BarChart3 className="w-12 h-12 text-gray-600 mx-auto" />
              <p className="text-gray-400 mt-4">Aucun clip publié pour le moment</p>
              <p className="text-gray-500 text-sm mt-1">
                Publiez vos clips sur TikTok, YouTube ou Instagram pour voir les stats
              </p>
            </div>
          ) : (
            topClips.map((clip, index) => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold">
                  {index + 1}
                </div>
                
                <div className="w-16 h-10 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                  {clip.thumbnailUrl ? (
                    <img src={clip.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{clip.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{clip.platform}</p>
                </div>
                
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-white font-semibold">{formatNumber(clip.views)}</p>
                    <p className="text-xs text-gray-500">vues</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold">{formatNumber(clip.likes)}</p>
                    <p className="text-xs text-gray-500">likes</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold">{clip.engagementRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">engage</p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>

      {/* Export button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={() => api.request('/analytics/export?format=csv')}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-300 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exporter les données
        </button>
      </div>
    </div>
  );
}
