import React, { useState } from 'react';
import { MetaPost } from '../types';
import { MessageSquare, ExternalLink, Calendar, Clock, Sparkles, BarChart2, Database } from 'lucide-react';

interface PostCardProps {
  post: MetaPost;
  onSelect: (post: MetaPost) => void;
  onRefreshPostAi?: (post: MetaPost) => void;
  isRefreshing?: boolean;
  onRefreshPostDb?: (post: MetaPost) => void;
  isRefreshingDb?: boolean;
  // Propiedades opcionales para retrocompatibilidad
  onAnalyzeAi?: (post: MetaPost) => void;
  isAnalyzingAi?: boolean;
  onSyncComments?: (post: MetaPost) => void;
  isSyncingComments?: boolean;
}

type DimensionKey = 'SENTIMIENTO' | 'INTERES' | 'PRIORIDAD';

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onSelect,
  onRefreshPostAi,
  isRefreshing = false,
  onRefreshPostDb,
  isRefreshingDb = false,
  onAnalyzeAi,
  isAnalyzingAi = false,
  onSyncComments,
  isSyncingComments = false,
}) => {
  const [activeDimension, setActiveDimension] = useState<DimensionKey>('SENTIMIENTO');

  const attachment = post.raw_data?.attachments?.data?.[0];
  const imageUrl = attachment?.media?.image?.src;

  const detailed = post.raw_data?.detailed_distribution;
  const sentimentFallback = post.raw_data?.sentiment_distribution;
  const interestFallback = post.raw_data?.interest_distribution;
  const priorityFallback = post.raw_data?.priority_distribution;

  // 1. DIMENSIÓN: SENTIMIENTO (5 categorías exactas sin doble conteo por falsy 0)
  const sentimientoBars = detailed?.sentimiento
    ? [
        {
          category: 'MUY NEGATIVO',
          short: 'M.Neg',
          count: Number(detailed.sentimiento['MUY NEGATIVO'] ?? 0),
          color: 'bg-rose-700',
          textColor: 'text-rose-700',
        },
        {
          category: 'NEGATIVO',
          short: 'Neg',
          count: Number(detailed.sentimiento['NEGATIVO'] ?? 0),
          color: 'bg-rose-500',
          textColor: 'text-rose-600',
        },
        {
          category: 'NEUTRO',
          short: 'Neutro',
          count: Number(detailed.sentimiento['NEUTRO'] ?? detailed.sentimiento['NEUTRAL'] ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'POSITIVO',
          short: 'Pos',
          count: Number(detailed.sentimiento['POSITIVO'] ?? 0),
          color: 'bg-emerald-500',
          textColor: 'text-emerald-600',
        },
        {
          category: 'MUY POSITIVO',
          short: 'M.Pos',
          count: Number(detailed.sentimiento['MUY POSITIVO'] ?? 0),
          color: 'bg-emerald-700',
          textColor: 'text-emerald-700',
        },
      ]
    : [
        {
          category: 'MUY NEGATIVO',
          short: 'M.Neg',
          count: 0,
          color: 'bg-rose-700',
          textColor: 'text-rose-700',
        },
        {
          category: 'NEGATIVO',
          short: 'Neg',
          count: Number(sentimentFallback?.negativo ?? 0),
          color: 'bg-rose-500',
          textColor: 'text-rose-600',
        },
        {
          category: 'NEUTRO',
          short: 'Neutro',
          count: Number(sentimentFallback?.neutral ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'POSITIVO',
          short: 'Pos',
          count: Number(sentimentFallback?.positivo ?? 0),
          color: 'bg-emerald-500',
          textColor: 'text-emerald-600',
        },
        {
          category: 'MUY POSITIVO',
          short: 'M.Pos',
          count: 0,
          color: 'bg-emerald-700',
          textColor: 'text-emerald-700',
        },
      ];

  // 2. DIMENSIÓN: INTERÉS (5 categorías exactas sin doble conteo)
  const interesBars = detailed?.interes
    ? [
        {
          category: 'MUY BAJO',
          short: 'M.Bajo',
          count: Number(detailed.interes['MUY BAJO'] ?? detailed.interes['NINGUNO'] ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'BAJO',
          short: 'Bajo',
          count: Number(detailed.interes['BAJO'] ?? 0),
          color: 'bg-sky-400',
          textColor: 'text-sky-600',
        },
        {
          category: 'MEDIO',
          short: 'Medio',
          count: Number(detailed.interes['MEDIO'] ?? 0),
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
        },
        {
          category: 'ALTO',
          short: 'Alto',
          count: Number(detailed.interes['ALTO'] ?? 0),
          color: 'bg-indigo-600',
          textColor: 'text-indigo-600',
        },
        {
          category: 'MUY ALTO',
          short: 'M.Alto',
          count: Number(detailed.interes['MUY ALTO'] ?? 0),
          color: 'bg-purple-600',
          textColor: 'text-purple-700',
        },
      ]
    : [
        {
          category: 'MUY BAJO',
          short: 'M.Bajo',
          count: Number(interestFallback?.muy_bajo ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'BAJO',
          short: 'Bajo',
          count: Number(interestFallback?.bajo ?? 0),
          color: 'bg-sky-400',
          textColor: 'text-sky-600',
        },
        {
          category: 'MEDIO',
          short: 'Medio',
          count: Number(interestFallback?.medio ?? 0),
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
        },
        {
          category: 'ALTO',
          short: 'Alto',
          count: Number(interestFallback?.alto ?? 0),
          color: 'bg-indigo-600',
          textColor: 'text-indigo-600',
        },
        {
          category: 'MUY ALTO',
          short: 'M.Alto',
          count: Number(interestFallback?.muy_alto ?? 0),
          color: 'bg-purple-600',
          textColor: 'text-purple-700',
        },
      ];

  // 3. DIMENSIÓN: PRIORIDAD (5 categorías exactas sin doble conteo)
  const prioridadBars = detailed?.prioridad
    ? [
        {
          category: 'MUY BAJA',
          short: 'M.Baja',
          count: Number(detailed.prioridad['MUY BAJA'] ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'BAJA',
          short: 'Baja',
          count: Number(detailed.prioridad['BAJA'] ?? 0),
          color: 'bg-emerald-500',
          textColor: 'text-emerald-600',
        },
        {
          category: 'MEDIA',
          short: 'Media',
          count: Number(detailed.prioridad['MEDIA'] ?? 0),
          color: 'bg-amber-500',
          textColor: 'text-amber-600',
        },
        {
          category: 'ALTA',
          short: 'Alta',
          count: Number(detailed.prioridad['ALTA'] ?? 0),
          color: 'bg-orange-500',
          textColor: 'text-orange-600',
        },
        {
          category: 'MUY ALTA',
          short: 'M.Alta',
          count: Number(detailed.prioridad['MUY ALTA'] ?? 0),
          color: 'bg-rose-600',
          textColor: 'text-rose-700',
        },
      ]
    : [
        {
          category: 'MUY BAJA',
          short: 'M.Baja',
          count: Number(priorityFallback?.muy_baja ?? 0),
          color: 'bg-stone-400',
          textColor: 'text-stone-600',
        },
        {
          category: 'BAJA',
          short: 'Baja',
          count: Number(priorityFallback?.baja ?? 0),
          color: 'bg-emerald-500',
          textColor: 'text-emerald-600',
        },
        {
          category: 'MEDIA',
          short: 'Media',
          count: Number(priorityFallback?.media ?? 0),
          color: 'bg-amber-500',
          textColor: 'text-amber-600',
        },
        {
          category: 'ALTA',
          short: 'Alta',
          count: Number(priorityFallback?.alta ?? 0),
          color: 'bg-orange-500',
          textColor: 'text-orange-600',
        },
        {
          category: 'MUY ALTA',
          short: 'M.Alta',
          count: Number(priorityFallback?.muy_alta ?? 0),
          color: 'bg-rose-600',
          textColor: 'text-rose-700',
        },
      ];

  const totalSentimiento = sentimientoBars.reduce((acc, b) => acc + b.count, 0);
  const totalInteres = interesBars.reduce((acc, b) => acc + b.count, 0);
  const totalPrioridad = prioridadBars.reduce((acc, b) => acc + b.count, 0);

  const hasAnyAiData = totalSentimiento > 0 || totalInteres > 0 || totalPrioridad > 0;

  // Seleccionar barras de la dimensión activa
  const currentBars =
    activeDimension === 'SENTIMIENTO'
      ? sentimientoBars
      : activeDimension === 'INTERES'
      ? interesBars
      : prioridadBars;

  const currentTotal =
    activeDimension === 'SENTIMIENTO'
      ? totalSentimiento
      : activeDimension === 'INTERES'
      ? totalInteres
      : totalPrioridad;

  // El conteo total de comentarios para mostrar en el icono inferior:
  // Se sincroniza con el mayor valor verificado entre la base de datos y la evaluación
  const effectiveCommentsCount = Math.max(post.comments_count || 0, currentTotal);

  const maxVal = Math.max(...currentBars.map((b) => b.count), 1);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('es-ES', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const isRecentlyUpdated = () => {
    if (!post.updated_time || !post.created_time) return false;
    return new Date(post.updated_time).getTime() - new Date(post.created_time).getTime() > 60000;
  };

  // Acción unificada para el botón de la tarjeta con IA
  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshPostAi) {
      onRefreshPostAi(post);
    } else if (onAnalyzeAi) {
      onAnalyzeAi(post);
    } else if (onSyncComments) {
      onSyncComments(post);
    }
  };

  // Acción para refrescar únicamente de la base de datos (sin IA)
  const handleRefreshDbClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshPostDb) {
      onRefreshPostDb(post);
    }
  };

  const activeLoading = isRefreshing || isAnalyzingAi || isSyncingComments;

  return (
    <div
      id={`post-card-${post.meta_post_id}`}
      className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs hover:border-indigo-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
    >
      <div>
        {/* Attachment preview if image exists */}
        {imageUrl && (
          <div className="relative h-44 w-full bg-stone-100 overflow-hidden border-b border-stone-100">
            <img
              src={imageUrl}
              alt="Post attachment"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {attachment?.type && (
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-900/70 text-white backdrop-blur-xs uppercase">
                {attachment.type}
              </span>
            )}
          </div>
        )}

        <div className="p-4 sm:p-5">
          {/* Post ID & Status badges */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-mono text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
              ID: {post.meta_post_id.slice(-10)}
            </span>

            <div className="flex items-center gap-1.5">
              {hasAnyAiData && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                  <Sparkles className="w-2.5 h-2.5 text-purple-600" /> IA
                </span>
              )}
              {isRecentlyUpdated() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  Modificado
                </span>
              )}
              {post.permalink_url && (
                <a
                  href={post.permalink_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-stone-400 hover:text-indigo-600 transition-colors p-1"
                  title="Abrir publicación en Facebook"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Post message */}
          <p className="text-stone-800 text-sm line-clamp-3 leading-relaxed mb-3">
            {post.message || <span className="italic text-stone-400">Publicación sin texto</span>}
          </p>

          {/* ======================================================== */}
          {/* GRÁFICO DE BARRAS VERTICALES POR DIMENSIÓN Y CATEGORÍAS */}
          {/* ======================================================== */}
          <div className="mb-3 p-3 bg-stone-50/80 rounded-xl border border-stone-200/90">
            {/* Cabecera con selector de dimensión (Sentimiento, Interés, Prioridad) */}
            <div className="flex items-center justify-between gap-1 mb-2.5 pb-2 border-b border-stone-200/70">
              <span className="text-[10px] font-bold text-stone-500 uppercase flex items-center gap-1">
                <BarChart2 className="w-3 h-3 text-indigo-600" />
                <span>Dimensión:</span>
              </span>

              {/* Selector de pestañas para cambiar de dimensión */}
              <div className="flex items-center bg-stone-200/70 p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveDimension('SENTIMIENTO')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    activeDimension === 'SENTIMIENTO'
                      ? 'bg-white text-indigo-900 shadow-2xs font-extrabold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Ver gráfico de Sentimiento (5 categorías)"
                >
                  Sentimiento
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDimension('INTERES')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    activeDimension === 'INTERES'
                      ? 'bg-white text-indigo-900 shadow-2xs font-extrabold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Ver gráfico de Interés (5 categorías)"
                >
                  Interés
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDimension('PRIORIDAD')}
                  className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    activeDimension === 'PRIORIDAD'
                      ? 'bg-white text-indigo-900 shadow-2xs font-extrabold'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Ver gráfico de Prioridad (5 categorías)"
                >
                  Prioridad
                </button>
              </div>
            </div>

            {/* GRÁFICO TIPO BARRAS VERTICALES (5 columnas) */}
            <div className="pt-1">
              <div className="flex items-end justify-between gap-1.5 h-20 px-1">
                {currentBars.map((bar) => {
                  const pct = currentTotal > 0 ? (bar.count / currentTotal) * 100 : 0;
                  const barHeightPct =
                    maxVal > 0 ? Math.max((bar.count / maxVal) * 100, bar.count > 0 ? 15 : 4) : 4;

                  return (
                    <div
                      key={bar.category}
                      className="flex-1 flex flex-col items-center justify-end h-full group"
                    >
                      {/* Valor numérico encima de la barra vertical */}
                      <span
                        className={`text-[10px] font-bold mb-1 transition-transform group-hover:scale-110 ${
                          bar.count > 0 ? bar.textColor : 'text-stone-300'
                        }`}
                        title={`${bar.category}: ${bar.count} (${pct.toFixed(1)}%)`}
                      >
                        {bar.count}
                      </span>

                      {/* Contenedor y Pista de la barra vertical */}
                      <div className="w-full max-w-[28px] h-12 bg-stone-200/50 rounded-t-md overflow-hidden flex flex-col justify-end p-0.5">
                        <div
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full rounded-t-xs transition-all duration-300 shadow-2xs ${
                            bar.count > 0 ? bar.color : 'bg-stone-300/40'
                          }`}
                        />
                      </div>

                      {/* Etiqueta de la categoría abajo de la barra vertical */}
                      <span
                        className="text-[9px] font-semibold text-stone-600 tracking-tight mt-1 text-center truncate max-w-full block leading-none"
                        title={`${bar.category}: ${bar.count} comentarios`}
                      >
                        {bar.short}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Subtítulo informativo del gráfico */}
              <div className="mt-2 pt-1.5 border-t border-stone-200/50 flex items-center justify-between text-[10px] text-stone-500">
                <span>
                  Total evaluados:{' '}
                  <strong className="text-stone-800">{currentTotal}</strong>
                </span>
                <span className="text-[9px] text-stone-400 uppercase font-medium">
                  {activeDimension}
                </span>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="space-y-1 text-[11px] text-stone-500 pt-2 border-t border-stone-100">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-stone-400 shrink-0" />
              <span>Creado: {formatDate(post.created_time)}</span>
            </div>
            {post.updated_time && post.updated_time !== post.created_time && (
              <div className="flex items-center gap-1.5 text-stone-600">
                <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                <span>Modificado: {formatDate(post.updated_time)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* FOOTER: BOTONES "Refrescar BD" y "Refrescar Post con IA" */}
      {/* ======================================================== */}
      <div className="px-3.5 py-2.5 bg-stone-50/90 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Conteo de comentarios sincronizado */}
          <div
            className="flex items-center gap-1 text-xs font-bold text-stone-700 bg-white px-2 py-1.5 rounded-lg border border-stone-200 shadow-2xs"
            title={`${effectiveCommentsCount} comentarios`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{effectiveCommentsCount}</span>
          </div>

          {/* BOTÓN: "Refrescar BD" (sólo este post_id directamente de la Base de Datos) */}
          {onRefreshPostDb && (
            <button
              type="button"
              onClick={handleRefreshDbClick}
              disabled={activeLoading || isRefreshingDb}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 text-stone-700 bg-white hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Recargar datos y comentarios de este post directamente desde la Base de Datos (sin llamar a la IA)"
            >
              <Database className={`w-3.5 h-3.5 text-stone-500 ${isRefreshingDb ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{isRefreshingDb ? 'Leyendo BD...' : 'Refrescar BD'}</span>
            </button>
          )}

          {/* BOTÓN: "Refrescar Post con IA" */}
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={activeLoading || isRefreshingDb}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Refrescar comentarios y análisis de esta publicación con IA mediante el webhook oficial"
          >
            <Sparkles className={`w-3.5 h-3.5 text-purple-600 ${activeLoading ? 'animate-spin' : ''}`} />
            <span>{activeLoading ? 'Refrescando con IA...' : 'Refrescar Post con IA'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelect(post)}
          className="text-xs font-semibold text-stone-600 hover:text-indigo-600 hover:underline px-1.5 py-1 cursor-pointer shrink-0"
        >
          Ver detalle &rarr;
        </button>
      </div>
    </div>
  );
};
