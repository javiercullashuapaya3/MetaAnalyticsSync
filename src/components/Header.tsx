import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import {
  RefreshCw,
  LogOut,
  Settings,
  FileText,
  Radio,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Facebook,
  Sparkles,
  BarChart3,
  Database,
  Users,
  BadgeCheck,
} from 'lucide-react';
import { fetchMetaPageInfo, MetaPageInfo } from '../services/metaSyncService';

interface HeaderProps {
  onSync: () => void;
  isSyncing: boolean;
  onRefreshDb?: () => void;
  isRefreshingDb?: boolean;
  onAnalyzeAi?: () => void;
  isAnalyzingAi?: boolean;
  onOpenConfig: () => void;
  onOpenLogs: () => void;
  onOpenSql?: () => void;
  activeTab?: 'feed' | 'reports' | 'config';
  onTabChange?: (tab: 'feed' | 'reports' | 'config') => void;
  syncStats?: { posts: number; comments: number; lastSync?: string };
}

export const Header: React.FC<HeaderProps> = ({
  onSync,
  isSyncing,
  onRefreshDb,
  isRefreshingDb = false,
  onAnalyzeAi,
  isAnalyzingAi = false,
  onOpenConfig,
  onOpenLogs,
  activeTab = 'feed',
  onTabChange,
  syncStats,
}) => {
  const { userName, company, companiesList, selectCompany, handleLogout, isDemoMode } = useAuth();
  const [pageInfo, setPageInfo] = useState<MetaPageInfo | null>(null);

  const isConfigured = Boolean(company?.meta_page_id && company?.meta_token);

  useEffect(() => {
    if (company?.meta_page_id) {
      fetchMetaPageInfo(company.meta_page_id, company.meta_token).then((info) => {
        if (info) setPageInfo(info);
      });
    } else {
      setPageInfo(null);
    }
  }, [company?.meta_page_id, company?.meta_token]);

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Company branding and tenant indicator */}
          <div className="flex items-center gap-3">
            {company?.logo ? (
              <img
                src={company.logo}
                alt={company.name}
                className="w-9 h-9 rounded-xl object-cover border border-stone-200"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                {company?.name ? company.name.charAt(0).toUpperCase() : 'M'}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                {companiesList && companiesList.length > 1 ? (
                  <select
                    value={company?.client_id || 1}
                    onChange={(e) => selectCompany?.(Number(e.target.value))}
                    className="font-semibold text-stone-900 text-xs sm:text-sm bg-stone-50 border border-stone-300 rounded-lg px-2 py-0.5 focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[170px] sm:max-w-xs truncate"
                    title="Cambiar empresa activa"
                  >
                    {companiesList.map((c) => (
                      <option key={c.id} value={c.client_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-semibold text-stone-900 text-sm sm:text-base tracking-tight truncate max-w-[140px] sm:max-w-xs">
                    {company?.name || 'Mi Empresa'}
                  </span>
                )}
                {isDemoMode && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <Radio className="w-2.5 h-2.5 text-amber-600 animate-pulse" /> Demo
                  </span>
                )}
              </div>

              <div className="text-xs text-stone-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <span>
                  Usuario: <strong className="text-stone-700 font-medium">{userName || 'Comercial'}</strong>
                </span>

                <span className="text-stone-300 hidden sm:inline">•</span>

                {/* Mostrar nombre de la página de Facebook al inicio con datos enriquecidos */}
                <div className="flex items-center gap-1.5">
                  {pageInfo?.name ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-semibold text-[11px] border border-blue-200 max-w-[200px] sm:max-w-[280px] truncate"
                        title={`Página de Facebook: ${pageInfo.name} (ID: ${pageInfo.id})${pageInfo.username ? ` • @${pageInfo.username}` : ''}${pageInfo.category ? ` • ${pageInfo.category}` : ''}`}
                      >
                        <Facebook className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate">{pageInfo.name}</span>
                        {pageInfo.username && (
                          <span className="text-blue-500 font-normal">(@{pageInfo.username})</span>
                        )}
                        {(pageInfo.verification_status === 'blue_verified' || pageInfo.verification_status === 'verified') && (
                          <span title="Página Verificada">
                            <BadgeCheck className="w-3 h-3 text-blue-600 shrink-0" />
                          </span>
                        )}
                      </span>

                      {pageInfo.followers_count !== undefined && (
                        <span
                          className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200"
                          title={`${pageInfo.followers_count.toLocaleString()} seguidores en Facebook`}
                        >
                          <Users className="w-2.5 h-2.5 text-stone-400" />
                          <span>{pageInfo.followers_count.toLocaleString()}</span>
                        </span>
                      )}

                      {pageInfo.category && (
                        <span
                          className="hidden lg:inline-flex items-center text-[10px] text-stone-500 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-200 max-w-[130px] truncate"
                          title={`Categoría: ${pageInfo.category}`}
                        >
                          {pageInfo.category}
                        </span>
                      )}
                    </div>
                  ) : company?.meta_page_id ? (
                    <span className="inline-flex items-center gap-1 text-stone-700 bg-stone-100 px-2 py-0.5 rounded font-mono text-[11px] border border-stone-200">
                      <Facebook className="w-3 h-3 text-blue-600 shrink-0" />
                      <span>Page ID: {company.meta_page_id}</span>
                    </span>
                  ) : (
                    <span className="text-amber-600 text-[11px] font-medium">Sin página configurada</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Central Navigation Tabs */}
          {onTabChange && (
            <nav className="hidden md:flex items-center gap-1 bg-stone-100/80 p-1 rounded-xl border border-stone-200/80">
              <button
                type="button"
                id="nav-tab-feed"
                onClick={() => onTabChange('feed')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Publicaciones</span>
                {syncStats?.posts !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === 'feed'
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'bg-stone-200 text-stone-700'
                    }`}
                  >
                    {syncStats.posts}
                  </span>
                )}
              </button>

              <button
                type="button"
                id="nav-tab-reports"
                onClick={() => onTabChange('reports')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                <span>Reporte IA</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                  Dashboard
                </span>
              </button>

              <button
                type="button"
                id="nav-tab-config"
                onClick={() => onTabChange('config')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'config'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Configuración de Meta</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConfigured ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                  }`}
                  title={isConfigured ? 'Credenciales configuradas' : 'Requiere configuración'}
                />
              </button>
            </nav>
          )}

          {/* Right actions: Sync trigger & User Controls */}
          <div className="flex items-center gap-2">
            {/* Único botón: Sincronizar Meta con IA */}
            <button
              id="btn-sync-meta-header"
              onClick={onSync}
              disabled={isSyncing}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs ${
                isConfigured
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white cursor-pointer'
                  : 'bg-stone-200 text-stone-500 cursor-not-allowed'
              }`}
              title={
                isConfigured
                  ? 'Sincronizar publicaciones y comentarios desde Meta con IA (post_id: "")'
                  : 'Debes configurar tu Meta Page ID y Token primero'
              }
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isSyncing ? 'Sincronizando con IA...' : 'Sincronizar Meta con IA'}
              </span>
              <span className="sm:hidden">
                {isSyncing ? 'Sincronizando...' : 'Sincronizar con IA'}
              </span>
            </button>

            {/* Botón: Refrescar BD (sin llamar a IA ni a Meta) */}
            {onRefreshDb && (
              <button
                id="btn-refresh-db-header"
                onClick={onRefreshDb}
                disabled={isRefreshingDb || isSyncing}
                className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 shadow-2xs cursor-pointer disabled:opacity-50"
                title="Recargar datos de la BD directamente (sin llamar a IA ni a Meta API)"
              >
                <Database className={`w-3.5 h-3.5 text-stone-600 ${isRefreshingDb ? 'animate-spin text-indigo-600' : ''}`} />
                <span className="hidden md:inline">
                  {isRefreshingDb ? 'Recargando BD...' : 'Refrescar BD'}
                </span>
              </button>
            )}

            {/* Config modal quick toggle */}
            <button
              onClick={onOpenConfig}
              className={`p-2 rounded-lg transition-colors border ${
                isConfigured
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 border-stone-200'
                  : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-300'
              }`}
              title="Configuración rápida de credenciales"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Sync Logs */}
            <button
              onClick={onOpenLogs}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors border border-stone-200"
              title="Ver registros de sincronización"
            >
              <FileText className="w-4 h-4" />
            </button>

            {/* Logout */}
            <button
              id="btn-logout"
              onClick={handleLogout}
              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile secondary tab bar */}
        {onTabChange && (
          <div className="flex md:hidden border-t border-stone-100 py-2 gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => onTabChange('feed')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-stone-50 text-stone-600'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Posts ({syncStats?.posts ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('reports')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : 'bg-stone-50 text-stone-600'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
              <span>Reporte IA</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('config')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                activeTab === 'config'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-stone-50 text-stone-600'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configuración</span>
              <span
                className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
