import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import {
  Facebook,
  Key,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Lock,
  Sparkles,
  Bot,
  Zap,
} from 'lucide-react';
import { fetchMetaPageInfo, MetaPageInfo, testMetaConnection, MetaConnectionTestResult, testLlmConnection, resolvePageAccessToken } from '../services/metaSyncService';

interface CompanyConfigViewProps {
  onGoToFeedAndSync?: () => void;
}

export const CompanyConfigView: React.FC<CompanyConfigViewProps> = ({
  onGoToFeedAndSync,
}) => {
  const { company, companiesList, selectCompany, updateCompanyConfig, refreshCompanyData } = useAuth();

  const [pageId, setPageId] = useState(company?.meta_page_id ? String(company.meta_page_id) : '');
  const [token, setToken] = useState(company?.meta_token || '');
  const [showToken, setShowToken] = useState(false);
  const [showCurrentDbToken, setShowCurrentDbToken] = useState(false);
  const [showCurrentDbKieKey, setShowCurrentDbKieKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pageInfo, setPageInfo] = useState<MetaPageInfo | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Test live Meta API connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<MetaConnectionTestResult | null>(null);

  // Sync state with company changes & resolve page name
  useEffect(() => {
    if (company) {
      const pid = company.meta_page_id ? String(company.meta_page_id) : '';
      setPageId(pid);
      setToken(company.meta_token || '');

      if (pid) {
        fetchMetaPageInfo(pid, company.meta_token).then((info) => {
          if (info) setPageInfo(info);
        });
      }
    }
  }, [company]);

  // Test live connection against Meta Graph API
  const handleTestConnection = async () => {
    const cleanId = pageId.trim().replace(/\D/g, '');
    const cleanToken = token.trim();

    if (!cleanId) {
      setTestResult({
        success: false,
        error: 'Por favor ingresa un Meta Page ID numérico para probar.',
      });
      return;
    }

    if (!cleanToken) {
      setTestResult({
        success: false,
        error: 'Por favor ingresa el Meta Access Token (Page o User Token) para probar.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testMetaConnection(cleanId, cleanToken);
      setTestResult(result);
      if (result.success) {
        if (result.resolvedPageToken && result.resolvedPageToken !== cleanToken) {
          setToken(result.resolvedPageToken);
        }
        if (result.detectedPageId && result.detectedPageId !== cleanId) {
          setPageId(result.detectedPageId);
        }
        if (result.pageName) {
          setPageInfo({
            id: result.pageId || cleanId,
            name: result.pageName,
            picture: result.picture,
            category: result.category,
          });
        }
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: `Error al probar conexión con Meta API: ${err?.message || 'Error de red'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Guardar configuración para la empresa del usuario
  const handleSave = async (e?: React.FormEvent, runSyncAfter = false) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveFeedback(null);

    const targetCompanyId = Number(company?.client_id || company?.id || 1);
    const cleanId = pageId.trim().replace(/\D/g, '');
    let tokenToSave = token.trim();
    const currentLlmKey = company?.llm_local_apikey || 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';

    try {
      // Si el usuario ingresó un User Access Token, resolver automáticamente el Page Access Token
      if (cleanId && tokenToSave) {
        try {
          const resolved = await resolvePageAccessToken(cleanId, tokenToSave);
          if (resolved.wasExchanged && resolved.token) {
            tokenToSave = resolved.token;
            setToken(resolved.token);
          }
        } catch {}
      }

      if (updateCompanyConfig) {
        const res = await updateCompanyConfig(pageId, tokenToSave, company?.kie_apikey, currentLlmKey, targetCompanyId);
        setSaveFeedback({
          type: res.success ? 'success' : 'error',
          message: res.message,
          details: res.success
            ? `Credenciales guardadas en la base de datos (tabla 'companies', id=${targetCompanyId}): Page ID = ${res.savedPageId || pageId.trim() || 'vacío'}, Token = ${
                res.savedToken ? `•••••••••••••••• (${res.savedToken.length} carácteres)` : 'vacío'
              }. Cualquier sincronización obtendrá inmediatamente este nuevo token de página.`
            : undefined,
        });

        // Intentar actualizar la info de la página
        if (res.success && pageId.trim()) {
          fetchMetaPageInfo(pageId, tokenToSave).then((info) => {
            if (info) setPageInfo(info);
          });
        }

        if (res.success && runSyncAfter && onGoToFeedAndSync) {
          setTimeout(() => {
            onGoToFeedAndSync();
          }, 800);
        }
      }

      if (refreshCompanyData) {
        await refreshCompanyData();
      }
    } catch (err: any) {
      setSaveFeedback({
        type: 'error',
        message: `Error al intentar guardar: ${err.message || err}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="company-config-container" className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Facebook className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold text-stone-900 tracking-tight">
              Configuración de Conexión de Meta
            </h2>
          </div>
          <p className="text-xs text-stone-500">
            Ingresa tu <strong className="text-stone-700">Meta Page ID</strong> y el{' '}
            <strong className="text-stone-700">Meta Access Token</strong> para sincronizar automáticamente las publicaciones y comentarios de tu página de Facebook.
          </p>
        </div>

        {/* Empresa activa para la configuración */}
        <div className="shrink-0 flex items-center gap-2.5 bg-stone-50 px-3.5 py-2.5 rounded-xl border border-stone-200">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <label className="text-[10px] text-stone-500 font-semibold block uppercase tracking-wider">
              Empresa activa:
            </label>
            {companiesList && companiesList.length > 1 ? (
              <select
                value={company?.client_id || 1}
                onChange={async (e) => {
                  const targetId = Number(e.target.value);
                  if (selectCompany) {
                    await selectCompany(targetId);
                  }
                }}
                className="font-bold text-stone-900 bg-white border border-stone-300 rounded px-2 py-0.5 mt-0.5 text-xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                title="Selecciona la empresa que deseas configurar"
              >
                {companiesList.map((c) => (
                  <option key={c.id} value={c.client_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-stone-900">{company?.name || 'Mi Empresa'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tarjeta con el Nombre de la Fan Page Oficial (si está configurada) */}
      {pageInfo && pageInfo.name && (
        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/50 p-4 rounded-xl border border-blue-200/80 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Facebook className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-stone-900 text-sm">{pageInfo.name}</span>
                <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                  Página de Facebook Conectada
                </span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Page ID: <code className="font-mono text-stone-800 font-semibold">{pageInfo.id}</code>
                {pageInfo.category && ` • ${pageInfo.category}`}
                {pageInfo.fan_count !== undefined && ` • ${pageInfo.fan_count.toLocaleString()} seguidores`}
              </p>
            </div>
          </div>

          {pageInfo.link && (
            <a
              href={pageInfo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors shrink-0"
            >
              Visitar Página
            </a>
          )}
        </div>
      )}

      {/* Estado actual de credenciales guardadas (con token enmascarado por defecto) */}
      <div className="bg-stone-100/70 p-4 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-semibold text-stone-700">
            Estado de credenciales para <span className="text-stone-900 font-bold">{company?.name}</span>:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-stone-500">Page ID:</span>
            {company?.meta_page_id ? (
              <code className="font-mono bg-white px-2 py-0.5 rounded border border-stone-200 text-stone-900 font-bold">
                {company.meta_page_id}
              </code>
            ) : (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                Sin configurar
              </span>
            )}
          </span>

          <span className="flex items-center gap-1.5">
            <span className="text-stone-500">Token:</span>
            {company?.meta_token ? (
              <div className="inline-flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-stone-200">
                <code className="font-mono text-stone-900 font-bold">
                  {showCurrentDbToken
                    ? `${company.meta_token.slice(0, 10)}...`
                    : '••••••••••••••••••••'}
                </code>
                <span className="text-[10px] text-stone-400">
                  ({company.meta_token.length} carácteres)
                </span>
                <button
                  type="button"
                  onClick={() => setShowCurrentDbToken(!showCurrentDbToken)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer ml-1"
                >
                  {showCurrentDbToken ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            ) : (
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                Sin configurar
              </span>
            )}
          </span>

          <span className="flex items-center gap-1.5">
            <span className="text-stone-500">Motor IA:</span>
            {company?.kie_apikey ? (
              <div className="inline-flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-stone-200">
                <code className="font-mono text-stone-900 font-bold">
                  {showCurrentDbKieKey
                    ? `${company.kie_apikey.slice(0, 8)}...`
                    : '••••••••••••'}
                </code>
                <span className="text-[10px] text-purple-700 bg-purple-50 px-1 rounded font-semibold">
                  Activo
                </span>
                <button
                  type="button"
                  onClick={() => setShowCurrentDbKieKey(!showCurrentDbKieKey)}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium underline cursor-pointer ml-1"
                >
                  {showCurrentDbKieKey ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            ) : (
              <span className="text-stone-500 bg-stone-50 px-2 py-0.5 rounded border border-stone-200 font-medium">
                Opcional / Sin clave
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Feedback Alert */}
      {saveFeedback && (
        <div
          className={`p-4 rounded-xl border flex flex-col gap-1 text-xs ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {saveFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{saveFeedback.message}</span>
          </div>
          {saveFeedback.details && (
            <p className="text-[11px] text-emerald-700 pl-6 font-mono">{saveFeedback.details}</p>
          )}
        </div>
      )}

      {/* Formulario Principal */}
      <form onSubmit={(e) => handleSave(e, false)} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-xs space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Nombre de la Empresa (SOLO LECTURA, NO EDITABLE) */}
          <div>
            <label className="block text-xs font-bold uppercase text-stone-500 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-stone-400" />
                Empresa Asignada
              </span>
              <span className="text-[10px] font-semibold text-stone-400 flex items-center gap-1 uppercase tracking-wider">
                <Lock className="w-3 h-3 text-stone-400" />
                No editable
              </span>
            </label>
            <div className="w-full border border-stone-200 bg-stone-100/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span className="text-stone-900">{company?.name || 'Mi Empresa'}</span>
              </div>
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                Activa
              </span>
            </div>
            <span className="text-[11px] text-stone-400 mt-1 block">
              Tu cuenta de usuario está vinculada a esta empresa.
            </span>
          </div>

          {/* Meta Page ID */}
          <div>
            <label className="block text-xs font-bold uppercase text-stone-700 mb-1.5 flex items-center gap-1.5">
              <Facebook className="w-3.5 h-3.5 text-blue-600" />
              Meta Page ID (ID Numérico de la Fan Page)
            </label>
            <input
              type="text"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="Ej. 995284600341040"
              className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold text-stone-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-stone-50/50"
            />
            <span className="text-[11px] text-stone-500 mt-1 block">
              Número de identificación de tu página de Facebook.
            </span>
          </div>
        </div>

        {/* Meta Access Token (ENMASCARADO POR DEFECTO CON BOTÓN "VER TOKEN") */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold uppercase text-stone-700 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-500" />
              Meta Access Token (Token de la Fan Page)
            </label>
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {showToken ? <EyeOff className="w-3.5 h-3.5 text-stone-500" /> : <Eye className="w-3.5 h-3.5 text-stone-500" />}
              <span>{showToken ? 'Ocultar token' : 'Ver token'}</span>
            </button>
          </div>

          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAA..."
              autoComplete="off"
              spellCheck={false}
              className="w-full border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-stone-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-stone-50/50 pr-24"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-stone-400 select-none">
              {token.trim().length > 0 ? `${token.trim().length} chars` : 'vacío'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-stone-500 mt-1 gap-1">
            <span>
              Permisos requeridos en Meta: <code>pages_read_engagement</code>, <code>pages_manage_posts</code>.
            </span>
            <span className="text-stone-400">
              {showToken ? 'El token está visible' : 'El token está protegido y oculto'}
            </span>
          </div>
        </div>

        {/* Botón de Prueba en Vivo de Meta Graph API */}
        <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Validar credenciales con Meta Graph API
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Verifica de forma inmediata que el Page ID y el Token sean correctos y tengan permisos activos.
              </p>
            </div>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !pageId.trim() || !token.trim()}
              className="px-4 py-2 bg-white hover:bg-stone-100 disabled:opacity-50 text-stone-800 rounded-lg text-xs font-semibold border border-stone-300 flex items-center justify-center gap-2 transition-colors shrink-0 shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Verificando...' : 'Probar Conexión con Meta API'}</span>
            </button>
          </div>

          {/* Resultado de la prueba */}
          {testResult && (
            <div
              className={`mt-3 p-3.5 rounded-xl text-xs space-y-2 ${
                testResult.success
                  ? 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                  : 'bg-red-50 text-red-950 border border-red-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <p className="font-bold">
                    {testResult.success
                      ? '¡Conexión verificada con éxito con Meta Graph API (v22.0)!'
                      : 'Fallo al verificar con Meta Graph API:'}
                  </p>
                  {testResult.success ? (
                    <div className="text-[11px] text-emerald-800 space-y-1">
                      <p>
                        Página: <strong className="font-semibold">{testResult.pageName}</strong> • ID:{' '}
                        <code className="font-mono font-bold bg-emerald-100/70 px-1 py-0.5 rounded text-emerald-900">{testResult.pageId}</code>
                        {testResult.category && ` • Categoría: ${testResult.category}`}
                      </p>
                      {testResult.tokenTypeNote && (
                        <div className="bg-blue-50 text-blue-900 p-2 rounded-lg border border-blue-200 text-[11px] font-medium mt-1">
                          {testResult.tokenTypeNote}
                        </div>
                      )}
                      {testResult.idMismatchWarning && (
                        <div className="bg-amber-100/90 text-amber-900 p-2 rounded-lg border border-amber-300 text-[11px] font-medium mt-1">
                          {testResult.idMismatchWarning}
                        </div>
                      )}
                      {testResult.postsAccessible ? (
                        <p className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          <span>Lectura de publicaciones confirmada (se recuperaron {testResult.postsSampleCount} publicaciones de prueba).</span>
                        </p>
                      ) : (
                        <p className="text-amber-700">Lectura de datos de página verificada.</p>
                      )}
                      {testResult.samplePostSnippet && (
                        <p className="italic text-[10px] text-emerald-800 bg-emerald-100/60 p-2 rounded-lg mt-1 border border-emerald-200/50">
                          Última publicación detectada: &ldquo;{testResult.samplePostSnippet}...&rdquo;
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-red-800 space-y-1.5">
                      <p className="font-mono bg-red-100/80 p-2 rounded-lg text-red-950 break-words border border-red-200/60">
                        {testResult.errorCode ? `[Error ${testResult.errorCode}${testResult.errorSubcode ? ` / Subcódigo ${testResult.errorSubcode}` : ''}] ` : ''}
                        {testResult.error}
                      </p>
                      {testResult.suggestion && (
                        <p className="text-stone-700 bg-white/80 p-2 rounded-lg border border-red-200/60 leading-relaxed">
                          <strong>Sugerencia de solución:</strong> {testResult.suggestion}
                        </p>
                      )}
                      {testResult.detectedPageId && testResult.detectedPageId !== pageId.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setPageId(testResult.detectedPageId!);
                            handleTestConnection();
                          }}
                          className="mt-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-2xs"
                        >
                          Usar Page ID detectado ({testResult.detectedPageId}) y reintentar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Botones de Acción */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-stone-100">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isSaving ? 'Guardando credenciales...' : 'Guardar Credenciales'}</span>
          </button>

          {onGoToFeedAndSync && (
            <button
              type="button"
              onClick={() => handleSave(undefined, true)}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Guardar y Sincronizar Feed Ahora</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
