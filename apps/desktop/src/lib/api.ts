import { ENGINE_API_URL, ENGINE_BASE_URL } from './config';
import type { ApiResponse, ApiProject, ApiSegment, ApiJob, PaginatedList } from './types';

const API_BASE = ENGINE_API_URL;

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  // Public request method for dynamic endpoints
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Projects
  async createProject(name: string, sourcePath: string, profileId?: string) {
    return this.request<ApiResponse<ApiProject>>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, source_path: sourcePath, profile_id: profileId }),
    });
  }

  async listProjects(page = 1, pageSize = 20, search?: string) {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
    });
    if (search) params.set('search', search);
    
    return this.request<ApiResponse<PaginatedList<ApiProject>>>(`/projects?${params}`);
  }

  async getProject(id: string) {
    return this.request<ApiResponse<ApiProject>>(`/projects/${id}`);
  }

  async ingestProject(id: string, options: {
    createProxy?: boolean;
    extractAudio?: boolean;
    audioTrack?: number;
    normalizeAudio?: boolean;
    autoAnalyze?: boolean;
  } = {}) {
    return this.request<ApiResponse<{ jobId: string }>>(`/projects/${id}/ingest`, {
      method: 'POST',
      body: JSON.stringify({
        create_proxy: options.createProxy ?? true,
        extract_audio: options.extractAudio ?? true,
        audio_track: options.audioTrack ?? 0,
        normalize_audio: options.normalizeAudio ?? true,
        auto_analyze: options.autoAnalyze ?? true,
      }),
    });
  }

  async analyzeProject(id: string, options: {
    transcribe?: boolean;
    whisperModel?: string;
    language?: string;
    detectScenes?: boolean;
    analyzeAudio?: boolean;
    detectFaces?: boolean;
    scoreSegments?: boolean;
    customDictionary?: string[];
  } = {}) {
    return this.request<ApiResponse<{ jobId: string }>>(`/projects/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({
        transcribe: options.transcribe ?? true,
        whisper_model: options.whisperModel ?? 'large-v3',
        language: options.language,
        detect_scenes: options.detectScenes ?? true,
        analyze_audio: options.analyzeAudio ?? true,
        detect_faces: options.detectFaces ?? true,
        score_segments: options.scoreSegments ?? true,
        custom_dictionary: options.customDictionary,
      }),
    });
  }

  async getTimeline(projectId: string) {
    return this.request<ApiResponse<ApiSegment[]>>(`/projects/${projectId}/timeline`);
  }

  async listSegments(projectId: string, options: {
    page?: number;
    pageSize?: number;
    sortBy?: 'score' | 'startTime' | 'duration';
    sortOrder?: 'asc' | 'desc';
    minScore?: number;
    minDuration?: number;
    maxDuration?: number;
    search?: string;
    tags?: string[];
  } = {}) {
    const params = new URLSearchParams({
      page: (options.page ?? 1).toString(),
      page_size: (options.pageSize ?? 20).toString(),
      sort_by: options.sortBy ?? 'score',
      sort_order: options.sortOrder ?? 'desc',
    });
    if (options.minScore !== undefined) {
      params.set('min_score', options.minScore.toString());
    }
    if (options.minDuration !== undefined) {
      params.set('min_duration', options.minDuration.toString());
    }
    if (options.maxDuration !== undefined) {
      params.set('max_duration', options.maxDuration.toString());
    }
    if (options.search) {
      params.set('search', options.search);
    }
    if (options.tags && options.tags.length > 0) {
      params.set('tags', options.tags.join(','));
    }
    
    return this.request<ApiResponse<PaginatedList<ApiSegment>>>(`/projects/${projectId}/segments?${params}`);
  }

  async getSegmentTags(projectId: string) {
    return this.request<ApiResponse<{
      tags: string[];
      count: number;
    }>>(`/projects/${projectId}/segments/tags`);
  }

  // Alias for getSegments
  async getSegments(projectId: string, options: {
    page?: number;
    pageSize?: number;
    sortBy?: 'score' | 'startTime' | 'duration';
    sortOrder?: 'asc' | 'desc';
    minScore?: number;
    minDuration?: number;
    maxDuration?: number;
  } = {}) {
    return this.listSegments(projectId, options);
  }

  async getSegmentStats(projectId: string) {
    return this.request<ApiResponse<{
      total: number;
      avgScore: number;
      maxScore: number;
      minScore: number;
      avgDuration: number;
      maxDuration: number;
      minDuration: number;
      scoreDistribution: number[];
      durationDistribution: number[];
      monetizable: number;
      highScore: number;
    }>>(`/projects/${projectId}/segments/stats`);
  }

  async getSegmentSuggestions(projectId: string, count: number = 5) {
    return this.request<ApiResponse<{
      suggestions: ApiSegment[];
      reasons: Record<string, string>;
    }>>(`/projects/${projectId}/segments/suggestions?count=${count}`);
  }

  async getSegment(projectId: string, segmentId: string) {
    return this.request<ApiResponse<ApiSegment>>(`/projects/${projectId}/segments/${segmentId}`);
  }

  async updateTranscript(projectId: string, segmentId: string, data: {
    words?: { word: string; start: number; end: number; confidence?: number }[];
    text?: string;
  }) {
    return this.request<ApiResponse<any>>(`/projects/${projectId}/segments/${segmentId}/transcript`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async generateVariants(projectId: string, segmentId: string, variants: any[], renderProxy = true) {
    return this.request<ApiResponse<{ jobId: string }>>(`/projects/${projectId}/segments/${segmentId}/variants`, {
      method: 'POST',
      body: JSON.stringify({ variants, render_proxy: renderProxy }),
    });
  }

  async exportSegment(projectId: string, options: {
    segmentId: string;
    variant?: string;
    templateId?: string;
    platform?: string;
    includeCaptions?: boolean;
    burnSubtitles?: boolean;
    includeCover?: boolean;
    includeMetadata?: boolean;
    includePost?: boolean;
    useNvenc?: boolean;
    captionStyle?: {
      fontFamily: string;
      fontSize: number;
      fontWeight: number;
      color: string;
      backgroundColor: string;
      outlineColor: string;
      outlineWidth: number;
      position: 'bottom' | 'center' | 'top';
      positionY?: number;
      animation: string;
      highlightColor: string;
      wordsPerLine: number;
    };
    layoutConfig?: {
      facecam?: { x: number; y: number; width: number; height: number; sourceCrop?: { x: number; y: number; width: number; height: number } };
      content?: { x: number; y: number; width: number; height: number; sourceCrop?: { x: number; y: number; width: number; height: number } };
      facecamRatio?: number;
    };
    introConfig?: {
      enabled: boolean;
      duration: number;
      title: string;
      badgeText: string;
      backgroundBlur: number;
      titleFont: string;
      titleSize: number;
      titleColor: string;
      badgeColor: string;
      animation: string;
    };
    jumpCutConfig?: {
      enabled: boolean;
      sensitivity: 'light' | 'normal' | 'aggressive';
      transition: 'hard' | 'zoom' | 'crossfade';
      min_silence_ms?: number;
      padding_ms?: number;
    };
    languages?: string[];
  }) {
    return this.request<ApiResponse<{ jobId: string }>>(`/projects/${projectId}/export`, {
      method: 'POST',
      body: JSON.stringify({
        segment_id: options.segmentId,
        variant: options.variant ?? 'A',
        template_id: options.templateId,
        platform: options.platform ?? 'tiktok',
        include_captions: options.includeCaptions ?? true,
        burn_subtitles: options.burnSubtitles ?? true,
        include_cover: options.includeCover ?? false,
        include_metadata: options.includeMetadata ?? false,
        include_post: options.includePost ?? false,
        use_nvenc: options.useNvenc ?? true,
        caption_style: options.captionStyle,
        layout_config: options.layoutConfig,
        intro_config: options.introConfig,
        jump_cut_config: options.jumpCutConfig,
        languages: options.languages ?? [],
      }),
    });
  }

  async analyzeJumpCuts(projectId: string, segmentId: string, options: {
    sensitivity?: 'light' | 'normal' | 'aggressive';
    min_silence_ms?: number;
  } = {}) {
    return this.request<ApiResponse<{
      original_duration: number;
      new_duration: number;
      cuts_count: number;
      time_saved: number;
      time_saved_percent: number;
      keep_ranges: { start: number; end: number; duration: number }[];
    }>>(`/projects/${projectId}/segments/${segmentId}/analyze-jump-cuts`, {
      method: 'POST',
      body: JSON.stringify({
        sensitivity: options.sensitivity ?? 'normal',
        min_silence_ms: options.min_silence_ms,
      }),
    });
  }

  async exportAllVariants(
    projectId: string,
    options: {
      segmentId: string;
      styles?: string[];  // Default: ["viral", "clean", "impact"]
      platform?: string;
      includeCaptions?: boolean;
      burnSubtitles?: boolean;
      useNvenc?: boolean;
      layoutConfig?: any;
      introConfig?: any;
      musicConfig?: any;
    }
  ) {
    return this.request<ApiResponse<{ jobId: string; variants: string[] }>>(`/projects/${projectId}/export-variants`, {
      method: 'POST',
      body: JSON.stringify({
        segment_id: options.segmentId,
        styles: options.styles ?? ['viral', 'clean', 'impact'],
        platform: options.platform ?? 'tiktok',
        include_captions: options.includeCaptions ?? true,
        burn_subtitles: options.burnSubtitles ?? true,
        use_nvenc: options.useNvenc ?? true,
        layout_config: options.layoutConfig,
        intro_config: options.introConfig,
        music_config: options.musicConfig,
      }),
    });
  }

  async listArtifacts(projectId: string) {
    return this.request<ApiResponse<any[]>>(`/projects/${projectId}/artifacts`);
  }

  /**
   * WORLD CLASS BATCH EXPORT - Export all high-scoring clips in one click
   */
  async batchExportAll(
    projectId: string,
    options: {
      minScore?: number;
      maxClips?: number;
      style?: string;
      platform?: string;
      includeCaptions?: boolean;
      burnSubtitles?: boolean;
      includeCover?: boolean;
      includeMetadata?: boolean;
      useNvenc?: boolean;
    } = {}
  ) {
    return this.request<ApiResponse<{
      jobId: string;
      availableCount: number;
      willExport: number;
      style: string;
      minScore: number;
    }>>(`/projects/${projectId}/export-all`, {
      method: 'POST',
      body: JSON.stringify({
        min_score: options.minScore ?? 70,
        max_clips: options.maxClips ?? 500,
        style: options.style ?? 'viral_pro',
        platform: options.platform ?? 'tiktok',
        include_captions: options.includeCaptions ?? true,
        burn_subtitles: options.burnSubtitles ?? true,
        include_cover: options.includeCover ?? true,
        include_metadata: options.includeMetadata ?? true,
        use_nvenc: options.useNvenc ?? true,
      }),
    });
  }

  // Jobs
  async getJob(jobId: string) {
    return this.request<ApiResponse<ApiJob>>(`/jobs/${jobId}`);
  }

  async getProjectJobs(projectId: string) {
    return this.request<ApiResponse<ApiJob[]>>(`/jobs?project_id=${projectId}`);
  }

  async cancelJob(jobId: string) {
    return this.request<ApiResponse<{ cancelled: boolean }>>(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  // Templates
  async listTemplates() {
    return this.request<ApiResponse<any[]>>('/templates');
  }

  async createTemplate(template: any) {
    return this.request<ApiResponse<any>>('/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }

  // Profiles
  async listProfiles() {
    return this.request<ApiResponse<any[]>>('/profiles');
  }

  async createProfile(profile: any) {
    return this.request<ApiResponse<any>>('/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  // URL Import
  async getUrlInfo(url: string) {
    return this.request<ApiResponse<any>>('/projects/url-info', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async importFromUrl(
    url: string, 
    quality = 'best', 
    autoIngest = true, 
    autoAnalyze = true,
    dictionaryName?: string
  ) {
    return this.request<ApiResponse<{ project: any; jobId: string; videoInfo: any }>>('/projects/import-url', {
      method: 'POST',
      body: JSON.stringify({
        url,
        quality,
        auto_ingest: autoIngest,
        auto_analyze: autoAnalyze,
        dictionary_name: dictionaryName,
      }),
    });
  }

  // System
  async getCapabilities() {
    return this.request<any>('/capabilities');
  }

  async checkHealth() {
    return fetch(`${ENGINE_BASE_URL}/health`).then(r => r.json());
  }
  
  // Transcription Providers
  async getTranscriptionProviders() {
    return this.request<{
      success: boolean;
      current: string;
      available: string[];
      providers: Record<string, {
        name: string;
        description: string;
        available: boolean;
        configured?: boolean;
        cost_per_hour: number;
        icon: string;
      }>;
      error?: string;
    }>('/transcription/providers');
  }
  
  async setTranscriptionProvider(provider: string) {
    return this.request<{
      success: boolean;
      provider: string;
      message: string;
      error?: string;
    }>('/transcription/provider', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  // Dictionaries
  async listDictionaries() {
    return this.request<{
      success: boolean;
      data: Array<{
        id: string;
        name: string;
        description: string;
        author: string;
        corrections_count: number;
        hotwords_count: number;
      }>;
      count: number;
    }>('/dictionaries');
  }

  async getDictionary(id: string) {
    return this.request<{
      success: boolean;
      data: {
        id: string;
        name: string;
        description: string;
        hotwords: string[];
        corrections_count: number;
        whisper_prompt: string;
      };
    }>(`/dictionaries/${id}`);
  }

  // ========================
  // NEW AI/ML ENDPOINTS
  // ========================

  // Emotion Detection
  async analyzeEmotions(videoPath: string, startTime: number, endTime: number, duration: number) {
    return this.request<any>('/emotion/analyze', {
      method: 'POST',
      body: JSON.stringify({
        video_path: videoPath,
        start_time: startTime,
        end_time: endTime,
        duration,
      }),
    });
  }

  async getEmotionStatus() {
    return this.request<{ available: boolean; backend: string | null }>('/emotion/status');
  }

  // Audio Analysis
  async analyzeAudio(audioPath: string) {
    return this.request<any>('/audio/analyze', {
      method: 'POST',
      body: JSON.stringify({ audio_path: audioPath }),
    });
  }

  async getAudioStatus() {
    return this.request<{ available: boolean; sample_rate: number }>('/audio/status');
  }

  // ML Scoring
  async predictMLScore(segment: any, audioData?: any, emotionData?: any) {
    return this.request<any>('/ml-scoring/predict', {
      method: 'POST',
      body: JSON.stringify({
        segment,
        audio_data: audioData,
        emotion_data: emotionData,
        blend_with_heuristic: true,
      }),
    });
  }

  async addMLFeedback(segment: any, rating: number) {
    return this.request<any>('/ml-scoring/feedback', {
      method: 'POST',
      body: JSON.stringify({ segment, rating }),
    });
  }

  async trainMLModel(force = false) {
    return this.request<any>('/ml-scoring/train', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  }

  async getMLStatus() {
    return this.request<any>('/ml-scoring/status');
  }

  // Content Generation
  async generateTitles(transcript: string, count = 5, style?: string) {
    return this.request<{ titles: string[]; llm_generated: boolean }>('/content/title', {
      method: 'POST',
      body: JSON.stringify({ transcript, count, style }),
    });
  }

  async generateDescription(transcript: string, title?: string, platform = 'tiktok') {
    return this.request<{ description: string; llm_generated: boolean }>('/content/description', {
      method: 'POST',
      body: JSON.stringify({ transcript, title, platform }),
    });
  }

  async generateHashtags(transcript: string, count = 10, platform = 'tiktok') {
    return this.request<{ hashtags: string[]; llm_generated: boolean }>('/content/hashtags', {
      method: 'POST',
      body: JSON.stringify({ transcript, count, platform }),
    });
  }

  async generateFullContent(transcript: string, platform = 'tiktok') {
    return this.request<{
      titles: string[];
      description: string;
      hashtags: string[];
      llm_generated: boolean;
    }>('/content/full', {
      method: 'POST',
      body: JSON.stringify({ transcript, platform }),
    });
  }

  async generateSegmentContent(
    transcript: string,
    tags: string[] = [],
    platform = 'tiktok',
    channelName?: string,
  ) {
    return this.request<ApiResponse<{
      titles: string[];
      description: string;
      hashtags: string[];
      hook_suggestion: string | null;
      language: string;
      platform: string;
    }>>('/content/segment', {
      method: 'POST',
      body: JSON.stringify({
        transcript,
        tags,
        platform,
        channel_name: channelName,
      }),
    });
  }

  async generateSegmentPreview(projectId: string, segmentId: string) {
    return this.request<ApiResponse<{
      preview_path: string;
      cached: boolean;
      width: number;
      height: number;
      duration: number;
    }>>(`/projects/${projectId}/segments/${segmentId}/preview`, {
      method: 'POST',
    });
  }

  // ========================
  // Virality Predictor — Similar stats & Performance tracking
  // ========================

  async getSimilarStats(predictedScore: number, platform = 'tiktok', tolerance = 15) {
    return this.request<{
      count: number;
      avg_views: number;
      avg_likes: number;
      avg_completion: number;
    }>(`/virality/similar-stats?predicted_score=${predictedScore}&platform=${platform}&tolerance=${tolerance}`);
  }

  async recordPerformance(data: {
    segmentId: string;
    predictedScore: number;
    platform: string;
    views: number;
    likes?: number;
    completionRate?: number;
  }) {
    return this.request<{ status: string; total_records: number }>('/virality/performance', {
      method: 'POST',
      body: JSON.stringify({
        segment_id: data.segmentId,
        predicted_score: data.predictedScore,
        platform: data.platform,
        views: data.views,
        likes: data.likes ?? 0,
        completion_rate: data.completionRate ?? 0,
      }),
    });
  }

  // Translation
  async translateText(text: string, targetLang: string, sourceLang = 'fr') {
    return this.request<{ original: string; translated: string }>('/translation/text', {
      method: 'POST',
      body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
    });
  }

  async translateSubtitles(words: any[], targetLang: string, sourceLang = 'fr') {
    return this.request<{ words: any[] }>('/translation/subtitles', {
      method: 'POST',
      body: JSON.stringify({
        words,
        source_lang: sourceLang,
        target_lang: targetLang,
        preserve_timing: true,
      }),
    });
  }

  async getTranslationLanguages() {
    return this.request<{ languages: Record<string, string> }>('/translation/languages');
  }

  // Virality Prediction
  async predictVirality(segment: any, includeSuggestions = true) {
    return this.request<any>('/virality/predict', {
      method: 'POST',
      body: JSON.stringify({ segment, include_suggestions: includeSuggestions }),
    });
  }

  async predictViralityBatch(segments: any[]) {
    return this.request<{ predictions: any[]; count: number }>('/virality/batch', {
      method: 'POST',
      body: JSON.stringify({ segments, sort_by_score: true }),
    });
  }

  // Compilation
  async createCompilation(
    projectId: string,
    options: {
      segmentIds?: string[];
      maxDuration?: number;
      minSegmentScore?: number;
      title?: string;
      includeTransitions?: boolean;
      transitionType?: string;
    }
  ) {
    return this.request<{ job_id: string; status: string }>('/compilation/create', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        segment_ids: options.segmentIds,
        max_duration: options.maxDuration || 60,
        min_segment_score: options.minSegmentScore || 60,
        title: options.title,
        include_transitions: options.includeTransitions ?? true,
        transition_type: options.transitionType || 'crossfade',
      }),
    });
  }

  async getCompilationStatus(jobId: string) {
    return this.request<any>(`/compilation/job/${jobId}`);
  }

  async autoSelectSegments(projectId: string, maxDuration = 60, minScore = 60) {
    return this.request<{ segments: any[]; count: number; total_duration: number }>(
      `/compilation/auto-select?project_id=${projectId}&max_duration=${maxDuration}&min_score=${minScore}`,
      { method: 'POST' }
    );
  }

  // Social Publishing
  async getSocialStatus() {
    return this.request<{
      available: boolean;
      connected_accounts: string[];
      supported_platforms: string[];
    }>('/social/status');
  }

  async getSocialAccounts() {
    return this.request<{ accounts: string[]; count: number }>('/social/accounts');
  }

  async connectSocialAccount(platform: string, credentials: Record<string, string>) {
    return this.request<{ success: boolean }>('/social/accounts/connect', {
      method: 'POST',
      body: JSON.stringify({ platform, credentials }),
    });
  }

  async publishToSocial(
    platform: string,
    videoPath: string,
    title: string,
    description?: string,
    hashtags?: string[]
  ) {
    return this.request<{ job_id: string; status: string; platform: string }>('/social/publish', {
      method: 'POST',
      body: JSON.stringify({
        platform,
        video_path: videoPath,
        title,
        description,
        hashtags,
        visibility: 'public',
      }),
    });
  }

  async getPublishStatus(jobId: string) {
    return this.request<any>(`/social/publish/${jobId}`);
  }

  // ========================
  // Social Publishing (extensions: disconnect, publish artifact)
  // ========================

  async disconnectSocial(platform: string) {
    return this.request<{ status: string; platform: string }>(`/social/accounts/${platform}`, {
      method: 'DELETE',
    });
  }

  async publishArtifactToSocial(data: {
    artifactId: string;
    projectId: string;
    platform: string;
    title: string;
    description?: string;
    hashtags?: string[];
    scheduleTime?: string;
    visibility?: string;
  }) {
    return this.request<{
      success: boolean;
      platform: string;
      status: string;
      video_url: string | null;
      video_id: string | null;
      error: string | null;
      published_at: string | null;
    }>('/social/publish/artifact', {
      method: 'POST',
      body: JSON.stringify({
        artifact_id: data.artifactId,
        project_id: data.projectId,
        platform: data.platform,
        title: data.title,
        description: data.description ?? '',
        hashtags: data.hashtags ?? [],
        schedule_time: data.scheduleTime ?? null,
        visibility: data.visibility ?? 'public',
      }),
    });
  }

  // Analytics
  async getAnalyticsDashboard(projectId?: string, days = 30) {
    const params = new URLSearchParams({ days: days.toString() });
    if (projectId) params.set('project_id', projectId);
    return this.request<any>(`/analytics/dashboard?${params}`);
  }

  async getAnalyticsOverview() {
    return this.request<any>('/analytics/overview');
  }

  async getClipStats(clipId: string) {
    return this.request<any>(`/analytics/clips/${clipId}/stats`);
  }

  async getTopClips(limit = 10, metric = 'views', days = 30) {
    return this.request<{ clips: any[]; metric: string; period_days: number }>(
      `/analytics/top-clips?limit=${limit}&metric=${metric}&days=${days}`
    );
  }

  async recordAnalyticsEvent(
    eventType: string,
    data: { projectId?: string; segmentId?: string; clipId?: string; metadata?: any }
  ) {
    return this.request<{ success: boolean }>('/analytics/events', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType,
        project_id: data.projectId,
        segment_id: data.segmentId,
        clip_id: data.clipId,
        metadata: data.metadata,
      }),
    });
  }

  async updateClipPerformance(
    clipId: string,
    platform: string,
    metrics: { views?: number; likes?: number; comments?: number; shares?: number }
  ) {
    return this.request<{ success: boolean }>('/analytics/clips/performance', {
      method: 'POST',
      body: JSON.stringify({
        clip_id: clipId,
        platform,
        ...metrics,
      }),
    });
  }

  async exportAnalytics(projectId?: string, format = 'json', days = 90) {
    const params = new URLSearchParams({ format, days: days.toString() });
    if (projectId) params.set('project_id', projectId);
    return this.request<any>(`/analytics/export?${params}`);
  }

  // ========================
  // Analytics Summary & Performance Trends
  // ========================

  async getAnalyticsSummary(platform = 'tiktok', limit = 5) {
    return this.request<{
      platform: string;
      total_clips: number;
      total_views: number;
      avg_views: number;
      avg_completion_rate: number;
      top_clips: Array<{
        segment_id: string;
        views: number;
        likes: number;
        predicted_score: number;
        actual_score: number;
        timestamp: number;
      }>;
      prediction_accuracy_pct: number | null;
    }>(`/analytics/summary?platform=${platform}&limit=${limit}`);
  }

  async getPerformanceTrends(platform = 'tiktok', weeks = 8) {
    return this.request<{
      platform: string;
      weeks: number;
      data: Array<{ week: number; views: number; clips: number; avg_score: number }>;
    }>(`/analytics/trends/performance?platform=${platform}&weeks=${weeks}`);
  }

  // ========================
  // Template Marketplace & Import/Export
  // ========================

  async listMarketplaceTemplates() {
    return this.request<{
      templates: Array<{
        id: string;
        name: string;
        description: string;
        preview_emoji: string;
        caption_style: any;
        layout: any;
      }>;
      count: number;
    }>('/templates/marketplace/list');
  }

  async installMarketplaceTemplate(templateId: string) {
    return this.request<{ id: string; name: string; installed: boolean }>(
      `/templates/marketplace/${templateId}/install`,
      { method: 'POST' }
    );
  }

  async exportTemplate(templateId: string) {
    return this.request<{
      forge_template_version: string;
      template: any;
      signature: string;
    }>(`/templates/${templateId}/export`);
  }

  async importTemplate(bundle: any) {
    return this.request<{ id: string; name: string; imported: boolean }>('/templates/import', {
      method: 'POST',
      body: JSON.stringify(bundle),
    });
  }

  // ========================
  // Translation Multi (batch target languages) & Supported
  // ========================

  async translateSubtitlesMulti(
    words: Array<{ word: string; start: number; end: number }>,
    sourceLang: string,
    targetLangs: string[]
  ) {
    return this.request<{
      results: Record<string, { words: any[]; success: boolean }>;
      source_lang: string;
      languages_processed: number;
    }>('/translation/multi', {
      method: 'POST',
      body: JSON.stringify({
        words,
        source_lang: sourceLang,
        target_langs: targetLangs,
      }),
    });
  }

  async getSupportedLanguages() {
    return this.request<{
      pairs: Array<{ source: string; target: string }>;
      by_source: Record<string, string[]>;
      backend: string;
    }>('/translation/supported');
  }

  // ========================
  // Cloud GPU / Overflow
  // ========================

  async getCloudStatus() {
    return this.request<{
      cloud_enabled: boolean;
      provider: string;
      overflow_enabled: boolean;
    }>('/cloud/status');
  }

  async estimateCloudCost(durationSeconds: number, provider = 'local') {
    return this.request<{
      provider: string;
      cost_usd: number;
      cost_display?: string;
      estimated_seconds: number;
      rate_per_minute?: number;
    }>(`/cloud/estimate?duration_seconds=${durationSeconds}&provider=${provider}`);
  }

  async listCloudProviders() {
    return this.request<{
      providers: Array<{ id: string; name: string; rate_per_minute: number; requires_key: boolean }>;
    }>('/cloud/providers');
  }

  // ========================
  // Enterprise / White-label (branding & storage)
  // ========================

  async getBranding() {
    return this.request<any>('/enterprise/branding');
  }

  async updateBranding(config: any) {
    return this.request<any>('/enterprise/branding', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async getStorageStatus() {
    return this.request<{
      s3_enabled: boolean;
      s3_configured: boolean;
      s3_bucket: string | null;
      s3_region: string;
    }>('/enterprise/storage/status');
  }

  async testS3Connection() {
    return this.request<{ connected: boolean; buckets: string[] }>('/enterprise/storage/test', {
      method: 'POST',
    });
  }

  // ========================
  // Auth (SaaS mode)
  // ========================

  async login(email: string, password: string) {
    return this.request<{
      user: any;
      access_token: string;
      refresh_token: string;
      token_type: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, username?: string) {
    return this.request<{
      user: any;
      access_token: string;
      refresh_token: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, username }),
    });
  }

  async getMe(token: string) {
    return this.request<any>('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getQuota(token: string) {
    return this.request<{ plan: string; exports_this_month: number; limit: number | null; can_export: boolean }>('/auth/me/quota', {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // LLM / Assistant
  async chatWithAssistant(message: string, projectId?: string, context?: any[]) {
    return this.request<{ response: string; action?: any }>('/llm/chat', {
      method: 'POST',
      body: JSON.stringify({ message, project_id: projectId, context }),
    });
  }

  async getLLMStatus() {
    return this.request<{ available: boolean; model: string }>('/llm/status');
  }
}

export const api = new ApiClient();

// Re-export types for convenience
export type { ApiResponse, ApiProject, ApiSegment, ApiSegmentScore, ApiTranscriptWord, ApiJob, JobStatus, PaginatedList } from './types';


