import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { Header } from './Header';
import { PostCard } from './PostCard';
import { PostDetailModal } from './PostDetailModal';
import { SyncLogsModal } from './SyncLogsModal';
import { MetaConfigModal } from './MetaConfigModal';
import { CompanyConfigView } from './CompanyConfigView';
import { AiReportsView } from './AiReportsView';
import {
  MetaPost,
  SyncResult,
  SyncLogEntry,
} from '../types';
import {
  syncCompany,
  fetchCompanyPosts,
  fetchSinglePostFromDb,
  fetchMetaPageInfo,
  analyze_company_comments_ai,
  analyze_single_post_comments_ai,
  sync_single_post_comments,
  getFreshCompanyMetaToken,
  getLlmInternalCurlExample,
  sanitizeUserLogMessage,
  MetaPageInfo,
  triggerMetaPostsWebhook,
  getMetaPostsWebhookCurl,
  getPageInfoCurl,
} from '../services/metaSyncService';
import {
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Layers,
  MessageSquare,
  Clock,
  AlertCircle,
  BarChart3,
  Sliders,
  Settings,
  ArrowRight,
  ShieldAlert,
  Facebook,
  ExternalLink,
  CheckCircle2,
  Terminal,
  Copy,
  Check,
  X,
  Database,
  Globe,
  Phone,
  Mail,
  MapPin,
  Users,
  BadgeCheck,
  MessageCircle,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { company, refreshCompanyData } = useAuth();
  const clientId = company?.client_id || 1;

  // Active navigation tab: 'feed', 'reports' or 'config'
  const [activeTab, setActiveTab] = useState<'feed' | 'reports' | 'config'>('feed');

  const [posts, setPosts] = useState<MetaPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingDb, setIsRefreshingDb] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [analyzingPostId, setAnalyzingPostId] = useState<string | number | null>(null);
  const [syncingPostId, setSyncingPostId] = useState<string | number | null>(null);
  const [refreshingPostId, setRefreshingPostId] = useState<string | number | null>(null);
  const [refreshingDbPostId, setRefreshingDbPostId] = useState<string | number | null>(null);
  const [selectedPost, setSelectedPost] = useState<MetaPost | null>(null);
  const [pageInfo, setPageInfo] = useState<MetaPageInfo | null>(null);

  // Modals state
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isShowPageCurlModal, setIsShowPageCurlModal] = useState(false);
  const [copiedPageCurl, setCopiedPageCurl] = useState(false);
  const [activeProcessAlert, setActiveProcessAlert] = useState<{ message: string; startedAt: string } | null>(null);

  // Filtro de fecha para análisis de IA (Último año por defecto)
  const [aiDateFilter, setAiDateFilter] = useState<'1year' | 'all'>('1year');

  // Sync execution state
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSort, setFilterSort] = useState<'recent' | 'comments' | 'updated'>('recent');

  useEffect(() => {
    loadPosts();
  }, [clientId, company?.meta_page_id]);

  // Fetch page info whenever credentials are present
  useEffect(() => {
    if (company?.meta_page_id) {
      fetchMetaPageInfo(company.meta_page_id, company.meta_token).then((info) => {
        if (info) setPageInfo(info);
      });
    } else {
      setPageInfo(null);
    }
  }, [company?.meta_page_id, company?.meta_token]);

  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCompanyPosts(clientId, company?.meta_page_id);
      setPosts(data);
    } catch (err) {
      console.error('Error cargando posts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLog = (log: SyncLogEntry) => {
    const sanitized = sanitizeUserLogMessage(log.message);
    if (!sanitized) return;
    setSyncLogs((prev) => [{ ...log, message: sanitized }, ...prev].slice(0, 100));
  };

  const handleAnalyzeAi = async (force: boolean = false, dateFilter: '1year' | 'all' = aiDateFilter) => {
    setIsAnalyzingAi(true);
    setIsLogsOpen(true);
    try {
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Iniciando análisis inteligente de comentarios (${dateFilter === '1year' ? 'comentarios del último año' : 'todos los comentarios'})...`,
      });

      const result = await analyze_company_comments_ai(clientId, handleLog, force, dateFilter);
      if (result.reason) {
        handleLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: result.reason,
        });
      }
      await loadPosts();
    } catch (err: any) {
      console.error('Error analizando con IA:', err);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `No se pudo completar el análisis inteligente: ${err.message || err}`,
      });
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleAnalyzeSinglePostAi = async (post: MetaPost) => {
    const targetId = post.id || post.meta_post_id;
    setAnalyzingPostId(targetId);
    setIsLogsOpen(true);
    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Iniciando análisis de comentarios para la publicación seleccionada (${aiDateFilter === '1year' ? 'último año' : 'todo el historial'})...`,
    });

    try {
      // Analizar comentarios con filtro del último año (por defecto)
      const res = await analyze_single_post_comments_ai(clientId, targetId, handleLog, false, aiDateFilter);
      await loadPosts();

      // Si el post analizado está abierto en el modal, refrescarlo
      if (selectedPost && (selectedPost.id === post.id || selectedPost.meta_post_id === post.meta_post_id)) {
        setSelectedPost((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            raw_data: {
              ...prev.raw_data,
              sentiment_distribution: res.sentiment_distribution || prev.raw_data?.sentiment_distribution,
              interest_distribution: res.interest_distribution || prev.raw_data?.interest_distribution,
              priority_distribution: res.priority_distribution || prev.raw_data?.priority_distribution,
            },
          };
        });
      }
    } catch (err: any) {
      console.error('Error analizando post con IA:', err);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `No se pudo completar el análisis de la publicación: ${err.message || err}`,
      });
    } finally {
      setAnalyzingPostId(null);
    }
  };

  // Handler para el único botón por tarjeta: "Refrescar Post con IA"
  const handleRefreshPostAi = async (post: MetaPost) => {
    const targetId = post.id || post.meta_post_id;
    setRefreshingPostId(targetId);
    setIsLogsOpen(true);

    const cleanPageId = company?.meta_page_id
      ? String(company.meta_page_id).trim().replace(/\D/g, '')
      : post.meta_page_id
      ? String(post.meta_page_id).trim().replace(/\D/g, '')
      : '995284600341040';

    let cleanPostId = String(post.meta_post_id || '').trim();
    if (cleanPostId && !cleanPostId.includes('_') && cleanPageId) {
      cleanPostId = `${cleanPageId}_${cleanPostId}`;
    }

    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Invocando webhook oficial "Refrescar Post con IA" para la publicación ${cleanPostId}...`,
    });

    try {
      const res = await triggerMetaPostsWebhook(clientId, cleanPageId, cleanPostId, handleLog);

      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Servicio de IA iniciado para la publicación (${cleanPostId}): "${res.message}". Actualizando...`,
      });

      // Recargar datos para reflejar comentarios y análisis
      setTimeout(async () => {
        await loadPosts();
      }, 1500);

      setTimeout(async () => {
        await loadPosts();
      }, 4500);
    } catch (err: any) {
      if (err.isActiveProcess) {
        setActiveProcessAlert({
          message: err.message,
          startedAt: err.startedAtGmt5,
        });
      } else {
        console.error('Error refrescando post con IA:', err);
        handleLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `No se pudo completar el refresco de la publicación con IA: ${err.message || err}`,
        });
      }
    } finally {
      setRefreshingPostId(null);
    }
  };

  // Handler para refrescar exclusivamente un post específico desde la Base de Datos (sin llamar a la IA)
  const handleRefreshSinglePostDb = async (post: MetaPost) => {
    const targetId = post.id || post.meta_post_id;
    setRefreshingDbPostId(targetId);
    setIsLogsOpen(true);

    const postLabel = post.meta_post_id || String(post.id || '');
    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Consultando la Base de Datos para el post ${postLabel} (sin llamar a la IA)...`,
    });

    try {
      const updatedPost = await fetchSinglePostFromDb(clientId, post.id, post.meta_post_id);
      if (updatedPost) {
        setPosts((prevPosts) =>
          prevPosts.map((p) =>
            (p.id && updatedPost.id && p.id === updatedPost.id) ||
            (p.meta_post_id && updatedPost.meta_post_id && p.meta_post_id === updatedPost.meta_post_id)
              ? updatedPost
              : p
          )
        );

        if (
          selectedPost &&
          ((selectedPost.id && updatedPost.id && selectedPost.id === updatedPost.id) ||
            (selectedPost.meta_post_id && updatedPost.meta_post_id && selectedPost.meta_post_id === updatedPost.meta_post_id))
        ) {
          setSelectedPost(updatedPost);
        }

        handleLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `Post ${postLabel} actualizado con éxito desde la BD (${updatedPost.comments_count} comentarios registrados).`,
        });
      } else {
        handleLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: `No se encontraron datos nuevos en la BD para el post ${postLabel}.`,
        });
      }
    } catch (err: any) {
      console.error('Error refrescando post individual desde la BD:', err);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Error al leer el post ${postLabel} desde la BD: ${err.message || err}`,
      });
    } finally {
      setRefreshingDbPostId(null);
    }
  };

  // Handler para el único botón de arriba: "Sincronizar Meta con IA" (post_id: "")
  const handleSync = async () => {
    setIsSyncing(true);
    setIsLogsOpen(true);

    const cleanPageId = company?.meta_page_id
      ? String(company.meta_page_id).trim().replace(/\D/g, '')
      : '995284600341040';

    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Invocando webhook oficial "Sincronizar Meta con IA" (client_id: ${clientId}, page_id: "${cleanPageId}", post_id: "")...`,
    });

    try {
      // Invocación al webhook n8n con post_id vacío
      const result = await triggerMetaPostsWebhook(clientId, cleanPageId, '', handleLog);

      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Sincronización con IA en marcha: "${result.message}". Actualizando publicaciones...`,
      });

      // Recargar posts del tablero
      setTimeout(async () => {
        await loadPosts();
        if (refreshCompanyData) await refreshCompanyData();
      }, 1500);

      setTimeout(async () => {
        await loadPosts();
      }, 4500);
    } catch (err: any) {
      if (err.isActiveProcess) {
        setActiveProcessAlert({
          message: err.message,
          startedAt: err.startedAtGmt5,
        });
      } else {
        console.error('Error al sincronizar Meta con IA:', err);
        handleLog({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `No se pudo completar la sincronización con IA: ${err.message || err}`,
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Handler para "Refrescar desde BD": Recarga únicamente desde PostgreSQL/Supabase sin llamar a IA ni a Meta
  const handleRefreshFromDb = async () => {
    setIsRefreshingDb(true);
    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Recargando publicaciones y métricas directamente desde la Base de Datos...`,
    });

    try {
      await loadPosts();
      if (refreshCompanyData) {
        await refreshCompanyData();
      }
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Datos sincronizados exitosamente desde la Base de Datos.`,
      });
    } catch (err: any) {
      console.error('Error refrescando desde la BD:', err);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Error al recargar desde la BD: ${err.message || err}`,
      });
    } finally {
      setIsRefreshingDb(false);
    }
  };

  const handleSyncSinglePostComments = async (post: MetaPost) => {
    const targetId = post.id || post.meta_post_id;
    setSyncingPostId(targetId);
    setIsLogsOpen(true);
    handleLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Descargando comentarios de la publicación seleccionada...`,
    });

    try {
      const res = await sync_single_post_comments(clientId, post.id, post.meta_post_id, handleLog);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Comentarios sincronizados correctamente (${res.created} nuevos, ${res.updated} actualizados).`,
      });
      await loadPosts();

      if (selectedPost && (selectedPost.id === post.id || selectedPost.meta_post_id === post.meta_post_id)) {
        if (res.post) {
          setSelectedPost(res.post);
        }
      }
    } catch (err: any) {
      console.error('Error sincronizando comentarios del post:', err);
      handleLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `No se pudieron descargar los comentarios: ${err?.message || err}`,
      });
    } finally {
      setSyncingPostId(null);
    }
  };

  // Filter & Sort Posts
  const filteredPosts = posts
    .filter((p) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.message?.toLowerCase().includes(q) ||
        p.meta_post_id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (filterSort === 'comments') {
        return (b.comments_count || 0) - (a.comments_count || 0);
      }
      if (filterSort === 'updated') {
        const timeA = new Date(a.updated_time || a.created_time || 0).getTime();
        const timeB = new Date(b.updated_time || b.created_time || 0).getTime();
        return timeB - timeA;
      }
      // default: recent
      const timeA = new Date(a.created_time || 0).getTime();
      const timeB = new Date(b.created_time || 0).getTime();
      return timeB - timeA;
    });

  const totalComments = posts.reduce((acc, p) => acc + (p.comments_count || 0), 0);
  const isMetaConfigured = Boolean(company?.meta_page_id && company?.meta_token);

  return (
    <div id="dashboard-container" className="min-h-screen bg-stone-50 text-stone-900 flex flex-col">
      {/* Top Header */}
      <Header
        onSync={handleSync}
        isSyncing={isSyncing}
        onRefreshDb={handleRefreshFromDb}
        isRefreshingDb={isRefreshingDb}
        onAnalyzeAi={() => handleAnalyzeAi(false)}
        isAnalyzingAi={isAnalyzingAi}
        onOpenConfig={() => setIsConfigOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        syncStats={{
          posts: posts.length,
          comments: totalComments,
          lastSync: lastSyncResult?.finished_at,
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner de Aviso de Proceso Activo en Ejecución (si status = 'EN PROCESO' en sync_process_logs) */}
        {activeProcessAlert && (
          <div className="mb-6 p-4 sm:p-5 bg-amber-50/95 border-2 border-amber-300 rounded-2xl flex items-start justify-between gap-3 text-amber-950 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5 border border-amber-200">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm sm:text-base text-amber-950">
                    Proceso actualmente en ejecución
                  </h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/90 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                    EN PROCESO
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-semibold">
                  {activeProcessAlert.message}
                </p>
                <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-800">
                  <span className="bg-white/90 px-2 py-0.5 rounded-md border border-amber-200 font-mono font-semibold">
                    Hora de inicio: {activeProcessAlert.startedAt}
                  </span>
                  <span>• Por favor, espera a que termine el proceso para iniciar uno nuevo.</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveProcessAlert(null)}
              className="p-1.5 text-amber-600 hover:text-amber-950 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer shrink-0"
              title="Cerrar aviso"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {activeTab === 'config' ? (
          /* ======================================================== */
          /* PESTAÑA DE CONFIGURACIÓN DE EMPRESA Y CREDENCIALES META   */
          /* ======================================================== */
          <CompanyConfigView
            onGoToFeedAndSync={async () => {
              setActiveTab('feed');
              await handleSync();
            }}
          />
        ) : activeTab === 'reports' ? (
          /* ======================================================== */
          /* PESTAÑA DE REPORTE Y DASHBOARD DE ANÁLISIS CON IA         */
          /* ======================================================== */
          <AiReportsView
            posts={posts}
            clientId={clientId}
            onSelectPost={(post) => setSelectedPost(post)}
            onAnalyzePostAi={handleAnalyzeSinglePostAi}
            onAnalyzeAllAi={() => handleAnalyzeAi(false)}
            isAnalyzingAi={isAnalyzingAi || Boolean(analyzingPostId)}
            onRefresh={handleRefreshFromDb}
            onSyncPostComments={handleSyncSinglePostComments}
            syncingPostId={syncingPostId}
          />
        ) : (
          /* ======================================================== */
          /* PESTAÑA PRINCIPAL: TABLERO Y FEED DE PUBLICACIONES       */
          /* ======================================================== */
          <>
            {/* Banner if credentials are not configured yet */}
            {!isMetaConfigured && (
              <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-amber-900">
                      Configura el Page ID y Access Token de Meta
                    </h4>
                    <p className="text-xs text-amber-800/90 mt-0.5">
                      Ingresa tus credenciales en la pestaña de configuración para sincronizar y descargar publicaciones y comentarios reales de Facebook.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setActiveTab('config')}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Configurar Meta</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Tarjeta con el Nombre de la Fan Page de Facebook al inicio */}
            {company?.meta_page_id && (
              <div className="mb-6 p-4 sm:p-5 bg-white border border-stone-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {pageInfo?.picture ? (
                    <img
                      src={pageInfo.picture}
                      alt={pageInfo.name || 'Página'}
                      className="w-12 h-12 rounded-2xl object-cover border border-stone-200 shadow-2xs shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
                      <Facebook className="w-6 h-6" />
                    </div>
                  )}

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                        {pageInfo?.name || `Página Facebook (${company.meta_page_id})`}
                      </h2>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                        <Facebook className="w-3 h-3 text-blue-600" />
                        Página Conectada
                      </span>
                    </div>

                    <div className="text-xs text-stone-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      <span>
                        Page ID: <code className="font-mono text-stone-900 font-bold">{company.meta_page_id}</code>
                      </span>
                      {pageInfo?.category && (
                        <span>• Categoría: <strong className="text-stone-700">{pageInfo.category}</strong></span>
                      )}
                      {pageInfo?.fan_count !== undefined && (
                        <span>• <strong className="text-stone-700">{pageInfo.fan_count.toLocaleString()}</strong> seguidores</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pageInfo?.link && (
                    <a
                      href={pageInfo.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 flex items-center gap-1.5 transition-colors"
                    >
                      <Facebook className="w-3.5 h-3.5" />
                      <span>Ver en Facebook</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  <button
                    onClick={() => setActiveTab('config')}
                    className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl border border-stone-200 transition-colors"
                    title="Editar credenciales de conexión"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* KPI / Stats Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-stone-500 tracking-wider">
                    Publicaciones
                  </span>
                  <p className="text-2xl font-bold text-stone-900 mt-1">{posts.length}</p>
                  <span className="text-[11px] text-stone-500">Publicaciones registradas</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-stone-500 tracking-wider">
                    Comentarios Totales
                  </span>
                  <p className="text-2xl font-bold text-indigo-600 mt-1">{totalComments}</p>
                  <span className="text-[11px] text-stone-500">Con jerarquía e hilos</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-stone-500 tracking-wider">
                    Última Sincronización
                  </span>
                  <p className="text-sm font-semibold text-stone-900 mt-2 truncate">
                    {lastSyncResult?.finished_at
                      ? new Date(lastSyncResult.finished_at).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : 'Pendiente'}
                  </p>
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                    {lastSyncResult ? '• Delta sincronizado' : '• Esperando primera sinc.'}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-stone-500 tracking-wider">
                    Estado de Conexión
                  </span>
                  <p className="text-sm font-semibold text-stone-900 mt-2 flex items-center gap-1.5">
                    {isMetaConfigured ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-emerald-700">Meta Conectado</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-amber-700">Falta Token</span>
                      </>
                    )}
                  </p>
                  <span className="text-[11px] text-stone-500">Graph API v26.0</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Search and Filters toolbar */}
            <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar en el contenido o ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Filter className="w-4 h-4 text-stone-400" />
                <select
                  value={filterSort}
                  onChange={(e) => setFilterSort(e.target.value as any)}
                  className="bg-stone-50 border border-stone-200 text-stone-700 text-xs rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="recent">Más recientes</option>
                  <option value="comments">Más comentadas</option>
                  <option value="updated">Actualizadas recientemente</option>
                </select>

                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  title="Ver Dashboard y Reporte de Sentimiento IA"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                  <span className="hidden sm:inline">Ver Reporte IA</span>
                  <span className="sm:hidden">Reporte</span>
                </button>

                {/* Selector de Filtro de Tiempo para Análisis IA (Último año por defecto) */}
                <div
                  className="flex items-center gap-1.5 bg-purple-50 border border-purple-200/80 px-2 py-1.5 rounded-lg text-xs"
                  title="Filtro de comentarios al analizar con IA: Por defecto evalúa los comentarios del último año"
                >
                  <span className="text-[10px] uppercase font-bold text-purple-700 hidden xl:inline">
                    Filtro IA:
                  </span>
                  <select
                    value={aiDateFilter}
                    onChange={(e) => setAiDateFilter(e.target.value as '1year' | 'all')}
                    className="bg-transparent text-purple-900 font-semibold text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="1year">Último año (por defecto)</option>
                    <option value="all">Todo el historial</option>
                  </select>
                </div>

                <button
                  id="btn-analyze-ai-toolbar"
                  onClick={() => handleAnalyzeAi(false)}
                  disabled={isAnalyzingAi || isSyncing}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer shrink-0"
                  title="Analizar comentarios pendientes con Inteligencia Artificial (filtro por defecto: último año)"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAnalyzingAi ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">
                    {isAnalyzingAi ? 'Analizando con IA...' : 'Analizar con IA'}
                  </span>
                </button>

                <button
                  id="btn-refresh-db-toolbar"
                  onClick={handleRefreshFromDb}
                  disabled={isLoading || isRefreshingDb}
                  className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  title="Recargar publicaciones y comentarios actualizados directamente desde la base de datos (PostgreSQL/Supabase)"
                >
                  <Database className={`w-3.5 h-3.5 text-stone-600 ${isRefreshingDb || isLoading ? 'animate-spin text-indigo-600' : ''}`} />
                  <span className="hidden sm:inline">
                    {isRefreshingDb || isLoading ? 'Recargando BD...' : 'Refrescar desde BD'}
                  </span>
                  <span className="sm:hidden">
                    {isRefreshingDb || isLoading ? 'BD...' : 'Refrescar BD'}
                  </span>
                </button>
              </div>
            </div>

            {/* Posts Grid */}
            {isLoading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                <p className="text-sm font-medium text-stone-700">Cargando publicaciones de la empresa...</p>
                <p className="text-xs text-stone-400 mt-1">Consultando publicaciones guardadas...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-stone-300 p-8 sm:p-12 text-center max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-stone-900">No hay publicaciones para mostrar</h3>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                  {searchQuery
                    ? 'No se encontraron resultados con ese criterio de búsqueda.'
                    : 'Inicia la sincronización para descargar las publicaciones y comentarios de Facebook.'}
                </p>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Sincronizando con IA...' : 'Sincronizar Meta con IA'}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('config')}
                    className="w-full sm:w-auto px-4 py-2 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 text-stone-500" />
                    <span>Configuración</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredPosts.map((post) => (
                  <PostCard
                    key={post.meta_post_id || post.id}
                    post={post}
                    onSelect={(p) => setSelectedPost(p)}
                    onRefreshPostAi={handleRefreshPostAi}
                    isRefreshing={refreshingPostId === (post.id || post.meta_post_id)}
                    onRefreshPostDb={handleRefreshSinglePostDb}
                    isRefreshingDb={refreshingDbPostId === (post.id || post.meta_post_id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-stone-200 py-4 px-4 sm:px-8 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Sincronizador de Publicaciones y Comentarios de Facebook</span>
          <span className="text-[11px] text-stone-400">
            Sincronización inteligente de cambios recientes
          </span>
        </div>
      </footer>

      {/* Modals */}
      <PostDetailModal
        post={selectedPost}
        clientId={clientId}
        onClose={() => setSelectedPost(null)}
        onSyncPostComments={handleSyncSinglePostComments}
        onAnalyzePostAi={handleAnalyzeSinglePostAi}
        onPostUpdated={loadPosts}
        onRefreshPostDb={handleRefreshSinglePostDb}
        isRefreshingDb={Boolean(selectedPost && refreshingDbPostId === (selectedPost.id || selectedPost.meta_post_id))}
      />

      <SyncLogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        logs={syncLogs}
        lastResult={lastSyncResult}
        onClearLogs={() => setSyncLogs([])}
      />

      <MetaConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onSaved={async () => {
          setIsConfigOpen(false);
          await loadPosts();
        }}
      />
    </div>
  );
};
