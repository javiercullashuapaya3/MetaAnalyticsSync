import React from 'react';
import { SyncLogEntry, SyncResult } from '../types';
import { X, Terminal, CheckCircle2, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react';

interface SyncLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: SyncLogEntry[];
  lastResult: SyncResult | null;
  onClearLogs: () => void;
}

export const SyncLogsModal: React.FC<SyncLogsModalProps> = ({
  isOpen,
  onClose,
  logs,
  lastResult,
  onClearLogs,
}) => {
  if (!isOpen) return null;

  const getLogIcon = (level: SyncLogEntry['level']) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />;
      case 'warn':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-stone-950 w-full max-w-3xl rounded-2xl shadow-2xl border border-stone-800 text-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/80">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white text-base">Registro de Actividad</h3>
            <span className="text-xs text-stone-400">Actualizaciones en tiempo real</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClearLogs}
              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title="Limpiar registro"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Summary Card if available */}
        {lastResult && (
          <div className="p-4 bg-stone-900 border-b border-stone-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-stone-950/80 p-2.5 rounded-lg border border-stone-800">
              <span className="text-stone-400 block text-[10px] uppercase font-semibold">Posts analizados</span>
              <span className="text-lg font-bold text-white">{lastResult.posts_count}</span>
              <div className="text-[10px] text-stone-500">
                +{lastResult.posts_created} nuev. / {lastResult.posts_updated} act.
              </div>
            </div>

            <div className="bg-stone-950/80 p-2.5 rounded-lg border border-stone-800">
              <span className="text-stone-400 block text-[10px] uppercase font-semibold">Comentarios</span>
              <span className="text-lg font-bold text-emerald-400">{lastResult.comments_count}</span>
              <div className="text-[10px] text-stone-500">
                +{lastResult.comments_created} nuevos / {lastResult.comments_updated} actualizados
              </div>
            </div>

            <div className="bg-stone-950/80 p-2.5 rounded-lg border border-stone-800">
              <span className="text-stone-400 block text-[10px] uppercase font-semibold">Modo de sincronización</span>
              <span className="text-lg font-bold text-indigo-400">Inteligente</span>
              <div className="text-[10px] text-stone-500">Solo cambios recientes</div>
            </div>

            <div className="bg-stone-950/80 p-2.5 rounded-lg border border-stone-800">
              <span className="text-stone-400 block text-[10px] uppercase font-semibold">Estado</span>
              <span className="text-lg font-bold text-emerald-400">Completado</span>
              <div className="text-[10px] text-stone-500 truncate">Sincronización al día</div>
            </div>
          </div>
        )}

        {/* Terminal logs list */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1 font-mono text-xs max-h-[55vh]">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-stone-500">
              <p>No hay registros de sincronización aún.</p>
              <p className="text-[11px] text-stone-600 mt-1">
                Haz clic en "Sincronizar Meta" en la barra superior para actualizar las publicaciones.
              </p>
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-2.5 py-1 px-2 rounded hover:bg-stone-900 transition-colors"
              >
                {getLogIcon(log.level)}
                <span className="text-[10px] text-stone-500 shrink-0 mt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`leading-relaxed break-all ${
                    log.level === 'error'
                      ? 'text-red-400 font-medium'
                      : log.level === 'success'
                      ? 'text-emerald-300'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-stone-300'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-800 bg-stone-900 text-stone-400 text-xs flex items-center justify-between">
          <span>Sincronización optimizada e inteligente</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-white rounded text-xs transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
