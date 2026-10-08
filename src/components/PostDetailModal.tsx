import React, { useState, useEffect } from 'react';
import { MetaPost, MetaComment } from '../types';
import { fetchPostComments, addTestComment, analyze_single_post_comments_ai } from '../services/metaSyncService';
import {
  X,
  MessageSquare,
  CornerDownRight,
  ExternalLink,
  Calendar,
  Clock,
  Send,
  User,
  RefreshCw,
  Facebook,
  Info,
  UserCheck,
  ThumbsUp,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Database,
} from 'lucide-react';

interface PostDetailModalProps {
  post: MetaPost | null;
  clientId: number;
  onClose: () => void;
  onSyncPostComments?: (post: MetaPost) => Promise<void>;
  onAnalyzePostAi?: (post: MetaPost) => Promise<void>;
  onPostUpdated?: () => Promise<void>;
  onRefreshPostDb?: (post: MetaPost) => Promise<void> | void;
  isRefreshingDb?: boolean;
}

// Funciones helper para renderizar los 3 niveles obligatorios de IA en MAYÚSCULAS
const renderSentimentBadge = (level?: string | null) => {
  const l = String(level || '').trim().toLowerCase();
  if (!level || l === 'pending' || l === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 border border-stone-200 uppercase">
        ⏳ SENTIMIENTO: PENDIENTE
      </span>
    );
  }
  if (l.includes('muy pos')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
        ✨ MUY POSITIVO
      </span>
    );
  }
  if (l.includes('pos')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
        😊 POSITIVO
      </span>
    );
  }
  if (l.includes('muy neg')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 uppercase">
        😡 MUY NEGATIVO
      </span>
    );
  }
  if (l.includes('neg')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 uppercase">
        🙁 NEGATIVO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-200 uppercase">
      😐 NEUTRO
    </span>
  );
};

const renderInterestBadge = (level?: string | null) => {
  const l = String(level || '').trim().toLowerCase();
  if (!level || l === 'pending' || l === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 border border-stone-200 uppercase">
        ⏳ INTERÉS: PENDIENTE
      </span>
    );
  }
  if (l.includes('muy alt')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 uppercase">
        <Sparkles className="w-2.5 h-2.5 text-purple-700" /> INTERÉS: MUY ALTO
      </span>
    );
  }
  if (l.includes('alt')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200 uppercase">
        <Sparkles className="w-2.5 h-2.5 text-purple-600" /> INTERÉS: ALTO
      </span>
    );
  }
  if (l.includes('med')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 uppercase">
        💡 INTERÉS: MEDIO
      </span>
    );
  }
  if (l.includes('muy baj') || l.includes('ningun') || l.includes('none')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-normal bg-stone-100 text-stone-600 border border-stone-200 uppercase">
        ⚪ INTERÉS: MUY BAJO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 uppercase">
      👀 INTERÉS: BAJO
    </span>
  );
};

const renderPriorityBadge = (level?: string | null) => {
  const l = String(level || '').trim().toLowerCase();
  if (!level || l === 'pending' || l === 'pendiente') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-100 text-stone-500 border border-stone-200 uppercase">
        ⏳ PRIORIDAD: PENDIENTE
      </span>
    );
  }
  if (l.includes('muy alt') || l.includes('urgent')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-200 text-rose-950 border border-rose-400 uppercase">
        🚨 PRIORIDAD: MUY ALTA
      </span>
    );
  }
  if (l.includes('alt')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 uppercase">
        ⚡ PRIORIDAD: ALTA
      </span>
    );
  }
  if (l.includes('med')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 uppercase">
        ⏱️ PRIORIDAD: MEDIA
      </span>
    );
  }
  if (l.includes('muy baj')) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-normal bg-stone-100 text-stone-600 border border-stone-200 uppercase">
        PRIORIDAD: MUY BAJA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-normal bg-stone-100 text-stone-600 border border-stone-200 uppercase">
      PRIORIDAD: BAJA
    </span>
  );
};

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  clientId,
  onClose,
  onSyncPostComments,
  onAnalyzePostAi,
  onPostUpdated,
  onRefreshPostDb,
  isRefreshingDb = false,
}) => {
  const [comments, setComments] = useState<MetaComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<MetaComment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingPost, setIsSyncingPost] = useState(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

  // Expanded person details map
  const [expandedAuthorCommentId, setExpandedAuthorCommentId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!post) return;
    loadComments();
  }, [post]);

  const loadComments = async () => {
    if (!post?.id) return;
    setIsLoading(true);
    try {
      const data = await fetchPostComments(clientId, post.id);
      setComments(data);
    } catch (err) {
      console.error('Error cargando comentarios:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !post?.id) return;

    setIsSubmitting(true);
    try {
      await addTestComment(
        clientId,
        post.id,
        newCommentText.trim(),
        'Respuesta de Administrador',
        replyingTo ? replyingTo.meta_comment_id : null
      );
      setNewCommentText('');
      setReplyingTo(null);
      await loadComments();
    } catch (err) {
      console.error('Error agregando comentario:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualPostSync = async () => {
    if (!post || !onSyncPostComments) return;
    setIsSyncingPost(true);
    try {
      await onSyncPostComments(post);
      await loadComments();
    } finally {
      setIsSyncingPost(false);
    }
  };

  const handleAnalyzeThisPostAi = async () => {
    if (!post) return;
    setIsAnalyzingAi(true);
    setAiFeedback(null);
    try {
      if (onAnalyzePostAi) {
        await onAnalyzePostAi(post);
      } else {
        const targetId = post.id || post.meta_post_id;
        const res = await analyze_single_post_comments_ai(clientId, targetId, undefined, false);
        if (res.reason) {
          setAiFeedback({ message: res.reason, type: 'warn' });
        } else if (res.analyzed === 0) {
          setAiFeedback({
            message: `Todos los comentarios (${res.skipped}) ya están analizados y sin cambios recientes. No se requirió nuevo consumo de IA.`,
            type: 'info' as any,
          });
        } else {
          setAiFeedback({
            message: `¡Análisis completado! Se procesaron ${res.analyzed} comentarios nuevos/modificados con IA (${res.skipped} sin cambios omitidos).`,
            type: 'success',
          });
        }
      }
      await loadComments();
      if (onPostUpdated) {
        await onPostUpdated();
      }
    } catch (err: any) {
      setAiFeedback({
        message: `Error al analizar: ${err.message || err}`,
        type: 'error',
      });
    } finally {
      setIsAnalyzingAi(false);
      setTimeout(() => setAiFeedback(null), 6000);
    }
  };

  if (!post) return null;

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const formatFullDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-ES', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getRelativeTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return '';
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'hace un momento';
      if (mins < 60) return `hace ${mins} min`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `hace ${hours} h`;
      const days = Math.floor(hours / 24);
      return `hace ${days} d`;
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        id="post-detail-modal"
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in-50 zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
            <h3 className="font-semibold text-stone-900 text-base">Detalle de Publicación Meta</h3>
            <span className="text-xs text-stone-500 font-mono">ID: {post.meta_post_id}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAnalyzeThisPostAi}
              disabled={isAnalyzingAi}
              className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Analizar comentarios de este post con IA"
            >
              <Sparkles className={`w-3.5 h-3.5 text-purple-600 ${isAnalyzingAi ? 'animate-spin' : ''}`} />
              <span>{isAnalyzingAi ? 'Analizando con IA...' : 'Analizar Post con IA'}</span>
            </button>

            {onRefreshPostDb && (
              <button
                onClick={async () => {
                  if (post && onRefreshPostDb) {
                    await onRefreshPostDb(post);
                    await loadComments();
                  }
                }}
                disabled={isRefreshingDb}
                className="px-2.5 py-1 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 rounded-lg border border-stone-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Recargar este post y sus comentarios directamente de la Base de Datos (PostgreSQL/Supabase)"
              >
                <Database className={`w-3.5 h-3.5 text-stone-600 ${isRefreshingDb ? 'animate-spin text-indigo-600' : ''}`} />
                <span>{isRefreshingDb ? 'Leyendo BD...' : 'Refrescar BD'}</span>
              </button>
            )}

            {onSyncPostComments && (
              <button
                onClick={handleManualPostSync}
                disabled={isSyncingPost}
                className="px-2.5 py-1 text-xs font-medium text-stone-700 bg-white hover:bg-stone-100 rounded-lg border border-stone-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sincronizar comentarios delta de este post"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingPost ? 'animate-spin' : ''}`} />
                <span>Actualizar Comentarios</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {aiFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center justify-between gap-2 border ${
                aiFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : aiFeedback.type === 'warn'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-purple-600" />
                <span>{aiFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiFeedback(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {/* Post Message & Details */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
            <p className="text-stone-900 text-sm sm:text-base leading-relaxed whitespace-pre-line mb-3 font-normal">
              {post.message || <span className="italic text-stone-400">Sin texto descriptivo</span>}
            </p>

            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-stone-500 pt-3 border-t border-stone-200">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                Creado: {formatDate(post.created_time)}
              </span>
              {post.updated_time && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-stone-400" />
                  Actualizado: {formatDate(post.updated_time)}
                </span>
              )}
              {post.last_comment_sync_at && (
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <RefreshCw className="w-3 h-3" />
                  Última sinc.: {formatDate(post.last_comment_sync_at)}
                </span>
              )}
              {post.permalink_url && (
                <a
                  href={post.permalink_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline flex items-center gap-1 ml-auto"
                >
                  Ver en Facebook <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* AI Metrics Card for Post (if sentiment_distribution exists) */}
          {post.raw_data?.sentiment_distribution && (
            <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200/80 text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-purple-200/60 pb-2">
                <div className="flex items-center gap-1.5 font-bold text-purple-950">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Análisis Inteligente de Comentarios con IA</span>
                </div>
                {post.analysis_updated_at && (
                  <span className="text-[10px] text-purple-700 font-medium">
                    Actualizado: {formatDate(post.analysis_updated_at)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Sentimiento */}
                <div className="bg-white p-3 rounded-lg border border-purple-100">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                    Sentimiento
                  </span>
                  {post.raw_data?.detailed_distribution?.sentimiento ? (
                    <div className="flex flex-wrap gap-1 font-semibold text-[11px] uppercase">
                      {Number(post.raw_data.detailed_distribution.sentimiento['MUY POSITIVO']) > 0 && (
                        <span className="text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                          +{post.raw_data.detailed_distribution.sentimiento['MUY POSITIVO']} MUY POSITIVO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.sentimiento['POSITIVO']) > 0 && (
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          +{post.raw_data.detailed_distribution.sentimiento['POSITIVO']} POSITIVO
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.sentimiento['NEUTRAL']) > 0 || Number(post.raw_data.detailed_distribution.sentimiento['NEUTRO']) > 0) && (
                        <span className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                          ~{(post.raw_data.detailed_distribution.sentimiento['NEUTRAL'] || 0) + (post.raw_data.detailed_distribution.sentimiento['NEUTRO'] || 0)} NEUTRO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.sentimiento['NEGATIVO']) > 0 && (
                        <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          -{post.raw_data.detailed_distribution.sentimiento['NEGATIVO']} NEGATIVO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.sentimiento['MUY NEGATIVO']) > 0 && (
                        <span className="text-rose-900 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 font-bold">
                          -{post.raw_data.detailed_distribution.sentimiento['MUY NEGATIVO']} MUY NEGATIVO
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 font-bold text-xs uppercase">
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        +{post.raw_data?.sentiment_distribution?.positivo || 0} POSITIVO
                      </span>
                      <span className="text-stone-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                        ~{post.raw_data?.sentiment_distribution?.neutral || 0} NEUTRO
                      </span>
                      <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                        -{post.raw_data?.sentiment_distribution?.negativo || 0} NEGATIVO
                      </span>
                    </div>
                  )}
                </div>

                {/* Interés de Compra */}
                <div className="bg-white p-3 rounded-lg border border-purple-100">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                    Interés Comercial
                  </span>
                  {post.raw_data?.detailed_distribution?.interes ? (
                    <div className="flex flex-wrap gap-1 font-semibold text-[11px] uppercase">
                      {Number(post.raw_data.detailed_distribution.interes['MUY ALTO']) > 0 && (
                        <span className="text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-300 font-bold">
                          {post.raw_data.detailed_distribution.interes['MUY ALTO']} MUY ALTO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.interes['ALTO']) > 0 && (
                        <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                          {post.raw_data.detailed_distribution.interes['ALTO']} ALTO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.interes['MEDIO']) > 0 && (
                        <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {post.raw_data.detailed_distribution.interes['MEDIO']} MEDIO
                        </span>
                      )}
                      {Number(post.raw_data.detailed_distribution.interes['BAJO']) > 0 && (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          {post.raw_data.detailed_distribution.interes['BAJO']} BAJO
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.interes['MUY BAJO']) > 0 || Number(post.raw_data.detailed_distribution.interes['NINGUNO']) > 0) && (
                        <span className="text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                          {(post.raw_data.detailed_distribution.interes['MUY BAJO'] || 0) + (post.raw_data.detailed_distribution.interes['NINGUNO'] || 0)} MUY BAJO
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 font-bold text-xs flex-wrap uppercase">
                      {post.raw_data?.interest_distribution?.alto ? (
                        <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          {post.raw_data.interest_distribution.alto} ALTO
                        </span>
                      ) : null}
                      {post.raw_data?.interest_distribution?.medio ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {post.raw_data.interest_distribution.medio} MEDIO
                        </span>
                      ) : null}
                      {post.raw_data?.interest_distribution?.bajo ? (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {post.raw_data.interest_distribution.bajo} BAJO
                        </span>
                      ) : null}
                      {(!post.raw_data?.interest_distribution?.alto && !post.raw_data?.interest_distribution?.medio && !post.raw_data?.interest_distribution?.bajo) && (
                        <span className="text-stone-500 font-normal">MUY BAJO</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Prioridad de Atención */}
                <div className="bg-white p-3 rounded-lg border border-purple-100">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                    Prioridad de Atención
                  </span>
                  {post.raw_data?.detailed_distribution?.prioridad ? (
                    <div className="flex flex-wrap gap-1 font-semibold text-[11px] uppercase">
                      {(Number(post.raw_data.detailed_distribution.prioridad['MUY ALTA']) > 0 || Number(post.raw_data.detailed_distribution.prioridad['MUY ALTO']) > 0) && (
                        <span className="text-rose-900 bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 font-bold">
                          {(post.raw_data.detailed_distribution.prioridad['MUY ALTA'] || 0) + (post.raw_data.detailed_distribution.prioridad['MUY ALTO'] || 0)} MUY ALTA
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.prioridad['ALTA']) > 0 || Number(post.raw_data.detailed_distribution.prioridad['ALTO']) > 0) && (
                        <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          {(post.raw_data.detailed_distribution.prioridad['ALTA'] || 0) + (post.raw_data.detailed_distribution.prioridad['ALTO'] || 0)} ALTA
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.prioridad['MEDIA']) > 0 || Number(post.raw_data.detailed_distribution.prioridad['MEDIO']) > 0) && (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          {(post.raw_data.detailed_distribution.prioridad['MEDIA'] || 0) + (post.raw_data.detailed_distribution.prioridad['MEDIO'] || 0)} MEDIA
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.prioridad['BAJA']) > 0 || Number(post.raw_data.detailed_distribution.prioridad['BAJO']) > 0) && (
                        <span className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                          {(post.raw_data.detailed_distribution.prioridad['BAJA'] || 0) + (post.raw_data.detailed_distribution.prioridad['BAJO'] || 0)} BAJA
                        </span>
                      )}
                      {(Number(post.raw_data.detailed_distribution.prioridad['MUY BAJA']) > 0 || Number(post.raw_data.detailed_distribution.prioridad['MUY BAJO']) > 0) && (
                        <span className="text-stone-500 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200">
                          {(post.raw_data.detailed_distribution.prioridad['MUY BAJA'] || 0) + (post.raw_data.detailed_distribution.prioridad['MUY BAJO'] || 0)} MUY BAJA
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 font-bold text-xs uppercase">
                      {post.raw_data?.priority_distribution?.alta ? (
                        <span className="text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                          {post.raw_data.priority_distribution.alta} ALTA
                        </span>
                      ) : null}
                      {post.raw_data?.priority_distribution?.media ? (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {post.raw_data.priority_distribution.media} MEDIA
                        </span>
                      ) : null}
                      {(!post.raw_data?.priority_distribution?.alta && !post.raw_data?.priority_distribution?.media) && (
                        <span className="text-stone-500 font-normal">AL DÍA</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comments Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  Comentarios ({comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)})
                </h4>
                <span className="text-[11px] text-stone-500">Haz clic en "Ver detalle" para consultar la ficha de cada persona</span>
              </div>

              <button
                type="button"
                onClick={handleAnalyzeThisPostAi}
                disabled={isAnalyzingAi || comments.length === 0}
                className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 rounded-lg border border-purple-200 flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
                title="Analizar estos comentarios con IA"
              >
                <Sparkles className={`w-3.5 h-3.5 text-purple-600 ${isAnalyzingAi ? 'animate-spin' : ''}`} />
                <span>{isAnalyzingAi ? 'Analizando comentarios...' : 'Analizar Comentarios con IA'}</span>
              </button>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-stone-500 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                Cargando comentarios...
              </div>
            ) : comments.length === 0 ? (
              <div className="py-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200">
                <p className="text-xs text-stone-500">Aún no hay comentarios sincronizados para esta publicación.</p>
                <p className="text-[11px] text-stone-400 mt-1">
                  Usa el formulario inferior para agregar un comentario o haz clic en "Delta Comentarios".
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => {
                  const isExpanded = expandedAuthorCommentId === comment.meta_comment_id;
                  const profileUrl = comment.raw_data?.from?.link || (comment.author_id ? `https://www.facebook.com/${comment.author_id}` : null);
                  const avatarUrl = comment.raw_data?.from?.picture?.data?.url;
                  const likeCount = comment.raw_data?.like_count || 0;

                  return (
                    <div
                      key={comment.meta_comment_id}
                      className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 transition-colors"
                    >
                      {/* Cabecera del Autor con Avatar y Botones de Detalle */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={comment.author_name || 'Avatar'}
                              className="w-8 h-8 rounded-full object-cover border border-stone-200 shrink-0 mt-0.5"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs shrink-0 mt-0.5">
                              {comment.author_name ? comment.author_name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                            </div>
                          )}

                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-stone-900">
                                {comment.author_name || 'Usuario de Facebook'}
                              </span>

                              {/* Botón interactivo para ver detalles completos de la persona */}
                              <button
                                type="button"
                                onClick={() => setExpandedAuthorCommentId(isExpanded ? null : comment.meta_comment_id)}
                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors flex items-center gap-1 cursor-pointer ${
                                  isExpanded
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                                }`}
                                title="Ver detalles de la persona que comentó"
                              >
                                <Info className="w-3 h-3" />
                                <span>{isExpanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
                              </button>

                              {/* Enlace directo a perfil de Facebook */}
                              {profileUrl && (
                                <a
                                  href={profileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 ml-0.5"
                                  title="Abrir perfil de Facebook en una nueva pestaña"
                                >
                                  <Facebook className="w-2.5 h-2.5" />
                                  <span>Perfil</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>

                            <div className="text-[10px] text-stone-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                              <span>{formatDate(comment.created_time)}</span>
                              {getRelativeTime(comment.created_time) && (
                                <>
                                  <span className="text-stone-300">•</span>
                                  <span className="text-stone-400">{getRelativeTime(comment.created_time)}</span>
                                </>
                              )}
                              {comment.updated_time && comment.updated_time !== comment.created_time && (
                                <span className="text-amber-600 font-medium">(editado)</span>
                              )}
                              {likeCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded font-medium">
                                  <ThumbsUp className="w-2.5 h-2.5" /> {likeCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setReplyingTo(comment)}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <CornerDownRight className="w-3 h-3" /> Responder
                        </button>
                      </div>

                      {/* Ficha Desplegable con Todos los Detalles de la Persona */}
                      {isExpanded && (
                        <div className="mt-3 p-3.5 bg-stone-50/90 rounded-xl border border-stone-200 text-xs space-y-2.5 animate-in fade-in-50 duration-150">
                          <div className="flex items-center justify-between border-b border-stone-200/80 pb-2">
                            <div className="flex items-center gap-1.5 font-bold text-stone-800">
                              <UserCheck className="w-4 h-4 text-indigo-600" />
                              <span>Ficha de la Persona que Comentó</span>
                            </div>
                            <span className="text-[10px] text-stone-500 font-medium bg-white px-2 py-0.5 rounded border border-stone-200">
                              Meta Profile Data
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                            <div className="bg-white p-2 rounded-lg border border-stone-200/80">
                              <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                                Nombre Completo
                              </span>
                              <span className="font-bold text-stone-900 text-xs">
                                {comment.author_name || 'Nombre no proporcionado'}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-stone-200/80">
                              <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                                ID de Usuario en Meta
                              </span>
                              <div className="flex items-center justify-between gap-1 mt-0.5">
                                <code className="font-mono text-stone-800 font-semibold truncate text-[11px]">
                                  {comment.author_id || 'ID no público'}
                                </code>
                                {comment.author_id && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopy(comment.author_id!, e)}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer shrink-0"
                                    title="Copiar ID de usuario"
                                  >
                                    {copiedId === comment.author_id ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-600" />
                                        <span className="text-emerald-600 font-bold">Copiado</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copiar</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-stone-200/80">
                              <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                                Fecha y Hora del Comentario
                              </span>
                              <span className="font-medium text-stone-700">
                                {formatFullDate(comment.created_time)}
                              </span>
                            </div>

                            <div className="bg-white p-2 rounded-lg border border-stone-200/80">
                              <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                                ID de Comentario Meta
                              </span>
                              <div className="flex items-center justify-between gap-1 mt-0.5">
                                <code className="font-mono text-stone-600 truncate text-[10px]">
                                  {comment.meta_comment_id}
                                </code>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopy(comment.meta_comment_id, e)}
                                  className="text-[10px] text-stone-500 hover:text-stone-800 font-semibold flex items-center gap-0.5 cursor-pointer shrink-0"
                                  title="Copiar ID del comentario"
                                >
                                  {copiedId === comment.meta_comment_id ? (
                                    <span className="text-emerald-600 font-bold">Copiado</span>
                                  ) : (
                                    <Copy className="w-2.5 h-2.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>

                          {profileUrl && (
                            <div className="pt-2 border-t border-stone-200/80 flex items-center justify-between">
                              <span className="text-[11px] text-stone-500">
                                ¿Deseas visitar el perfil de Facebook de esta persona?
                              </span>
                              <a
                                href={profileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                              >
                                <Facebook className="w-3.5 h-3.5" />
                                <span>Ver Perfil de Facebook</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Texto del comentario */}
                      <p className="mt-2 text-xs sm:text-sm text-stone-800 leading-relaxed pl-10.5">
                        {comment.message}
                      </p>

                      {/* Insignias de Clasificación por IA: OBLIGATORIAMENTE LOS 3 NIVELES */}
                      <div className="mt-2 pl-10.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {renderSentimentBadge(comment.sentiment_level)}
                        {renderInterestBadge(comment.interest_level)}
                        {renderPriorityBadge(comment.priority_level)}

                        {Boolean(comment.reason || comment.raw_data?.ai_analysis?.reason) && (
                          <span
                            className="text-stone-500 italic max-w-sm truncate"
                            title={String(comment.reason || comment.raw_data?.ai_analysis?.reason)}
                          >
                            • {comment.reason || comment.raw_data?.ai_analysis?.reason}
                          </span>
                        )}
                      </div>

                      {/* Respuestas anidadas (Replies) */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-3 pl-8 sm:pl-10 space-y-2 border-l-2 border-stone-200">
                          {comment.replies.map((reply) => {
                            const isReplyExpanded = expandedAuthorCommentId === reply.meta_comment_id;
                            const replyProfileUrl = reply.raw_data?.from?.link || (reply.author_id ? `https://www.facebook.com/${reply.author_id}` : null);

                            return (
                              <div
                                key={reply.meta_comment_id}
                                className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/80 text-xs"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-stone-900">
                                      {reply.author_name || 'Respuesta'}
                                    </span>
                                    {reply.author_id && (
                                      <code className="text-[10px] text-stone-500 bg-white px-1 py-0.2 rounded border border-stone-200 font-mono">
                                        ID: {reply.author_id}
                                      </code>
                                    )}
                                    {replyProfileUrl && (
                                      <a
                                        href={replyProfileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                                      >
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-stone-500">
                                    {formatDate(reply.created_time)}
                                  </span>
                                </div>
                                <p className="text-stone-800">{reply.message}</p>

                                {/* 3 Niveles Obligatorios en respuestas */}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px]">
                                  {renderSentimentBadge(reply.sentiment_level)}
                                  {renderInterestBadge(reply.interest_level)}
                                  {renderPriorityBadge(reply.priority_level)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Comment input form */}
        <div className="p-4 bg-stone-50 border-t border-stone-200">
          {replyingTo && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 flex items-center justify-between">
              <span>
                Respondiendo a: <strong>{replyingTo.author_name || 'Comentario'}</strong>
              </span>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-indigo-600 hover:text-indigo-900 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder={replyingTo ? 'Escribe tu respuesta...' : 'Escribe un comentario...'}
              className="flex-1 bg-white border border-stone-300 rounded-lg px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newCommentText.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Enviando...' : 'Publicar'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
