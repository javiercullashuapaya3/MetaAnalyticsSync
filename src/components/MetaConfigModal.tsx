import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { X, Key, Facebook, Check, AlertCircle, RefreshCw, Eye, EyeOff, Database, Building2, Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import { testMetaConnection, MetaConnectionTestResult, testLlmConnection } from '../services/metaSyncService';

interface MetaConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const MetaConfigModal: React.FC<MetaConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { company, updateCompanyConfig, refreshCompanyData } = useAuth();
  const [pageId, setPageId] = useState(company?.meta_page_id ? String(company.meta_page_id) : '');
  const [token, setToken] = useState(company?.meta_token || '');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (company) {
      setPageId(company.meta_page_id ? String(company.meta_page_id) : '');
      setToken(company.meta_token || '');
    }
  }, [company]);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MetaConnectionTestResult | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    const cleanId = pageId.trim().replace(/\D/g, '');
    const cleanTok = token.trim();
    if (!cleanId || !cleanTok) {
      setTestResult({
        success: false,
        error: 'Ingresa Page ID y Token para probar.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const result = await testMetaConnection(cleanId, cleanTok);
      setTestResult(result);
      if (result.success && result.detectedPageId && result.detectedPageId !== cleanId) {
        setPageId(result.detectedPageId);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Error de conexión con Meta API.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus(null);

    try {
      if (updateCompanyConfig) {
        const currentLlmKey = company?.llm_local_apikey || 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';
        const res = await updateCompanyConfig(pageId, token, company?.kie_apikey, currentLlmKey);
        setSaveStatus({
          success: res.success,
          message: res.message,
        });

        if (res.success) {
          if (refreshCompanyData) {
            await refreshCompanyData();
          }
          if (onSaved) {
            onSaved();
          }
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      }
    } catch (err: any) {
      setSaveStatus({
        success: false,
        message: `Error al guardar: ${err.message || err}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Facebook className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">Configuración de Meta Graph API</h3>
              <p className="text-[11px] text-stone-500">
                Guardar credenciales de conexión
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
          {/* Empresa asignada (Fija / No editable) */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-stone-500" />
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-400 block">
                  Empresa asignada
                </span>
                <span className="text-xs font-bold text-stone-800">
                  {company?.name || 'Mi Empresa'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-stone-500">
              <span className="text-[11px] font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-emerald-700">
                Conectada
              </span>
              <span title="No editable">
                <Lock className="w-3.5 h-3.5 text-stone-400" />
              </span>
            </div>
          </div>

          {saveStatus && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                saveStatus.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {saveStatus.success ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{saveStatus.message}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
              Meta Page ID (ID de Fan Page)
            </label>
            <input
              type="text"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="Ej. 995284600341040"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[11px] text-stone-500 mt-1 block">
              Identificador numérico de la página de Facebook de la empresa.
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold uppercase text-stone-600 flex items-center gap-1">
                <Key className="w-3 h-3 text-stone-400" />
                Meta Access Token (Page Token)
              </label>
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="text-[11px] font-semibold text-stone-600 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 bg-stone-50 hover:bg-stone-100 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {showToken ? <EyeOff className="w-3 h-3 text-stone-500" /> : <Eye className="w-3 h-3 text-stone-500" />}
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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-500 pr-20"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-stone-400 select-none">
                {token.trim().length > 0 ? `${token.trim().length} chars` : 'vacío'}
              </span>
            </div>
            <span className="text-[11px] text-stone-500 mt-1 block">
              Permisos requeridos: <code>pages_read_engagement</code>, <code>pages_manage_posts</code>.
            </span>
          </div>

          {/* Test connection helper */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !pageId.trim() || !token.trim()}
              className="w-full py-2 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors border border-stone-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Comprobando con Meta Graph API...' : 'Probar Conexión con Meta API'}</span>
            </button>

            {testResult && (
              <div
                className={`mt-2 p-3 rounded-xl text-xs space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="font-semibold">
                      {testResult.success ? (
                        <span>Conexión exitosa con Meta Graph API (v22.0)</span>
                      ) : (
                        <span>Error al verificar credenciales con Meta</span>
                      )}
                    </div>
                    {testResult.success ? (
                      <div className="text-[11px] text-emerald-800 space-y-0.5">
                        <p><strong>Página:</strong> {testResult.pageName} (ID: {testResult.pageId})</p>
                        {testResult.idMismatchWarning && (
                          <div className="bg-amber-100/90 text-amber-900 p-2 rounded-lg border border-amber-300 text-[11px] font-medium mt-1">
                            {testResult.idMismatchWarning}
                          </div>
                        )}
                        {testResult.postsAccessible ? (
                          <p className="flex items-center gap-1 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            <span>Acceso a publicaciones confirmado (encontradas {testResult.postsSampleCount} publicaciones recientes).</span>
                          </p>
                        ) : (
                          <p className="text-amber-700">Lectura de datos de página verificada.</p>
                        )}
                        {testResult.samplePostSnippet && (
                          <p className="italic text-[10px] text-emerald-700 bg-emerald-100/60 p-1.5 rounded mt-1">
                            Último post: &ldquo;{testResult.samplePostSnippet}...&rdquo;
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-red-800 space-y-1">
                        <p className="font-mono bg-red-100/70 p-1.5 rounded text-red-950 break-words">
                          {testResult.errorCode ? `[Código ${testResult.errorCode}${testResult.errorSubcode ? ` / Subcódigo ${testResult.errorSubcode}` : ''}] ` : ''}
                          {testResult.error}
                        </p>
                        {testResult.suggestion && (
                          <p className="text-stone-700 bg-white/70 p-1.5 rounded border border-red-200/50">
                            <strong>Sugerencia:</strong> {testResult.suggestion}
                          </p>
                        )}
                        {testResult.detectedPageId && testResult.detectedPageId !== pageId.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setPageId(testResult.detectedPageId!);
                              handleTest();
                            }}
                            className="mt-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold cursor-pointer transition-colors"
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

          <div className="pt-2 flex justify-end gap-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 rounded-lg border border-stone-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>{isSaving ? 'Guardando credenciales...' : 'Guardar Credenciales'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
