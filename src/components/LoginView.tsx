import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { ShieldCheck, Sparkles, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { handleLogin, isLoggingIn, loginError, handleSignUp, enterDemoMode } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpStatus, setSignUpStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  const onSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleSignUp) return;
    setIsSigningUp(true);
    setSignUpStatus(null);
    const res = await handleSignUp(signUpEmail, signUpPassword, signUpName);
    setSignUpStatus(res);
    setIsSigningUp(false);
    if (res.success) {
      setTimeout(() => {
        setShowSignUp(false);
      }, 2000);
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-stone-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200 mb-4">
          <Building2 className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Meta Analytics &amp; Sync
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Portal empresarial de gestión de publicaciones y comentarios
        </p>

        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Sistema en Línea • Conexión Segura
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm border border-stone-200 rounded-2xl sm:px-10">
          {!showSignUp ? (
            <form onSubmit={handleLogin} className="space-y-4 max-w-sm mx-auto p-2 sm:p-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-stone-900">Iniciar Sesión</h2>
                <span className="text-xs text-stone-500 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Acceso Seguro
                </span>
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>{loginError}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Correo Electrónico
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  className="w-full border border-stone-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Contraseña
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full border border-stone-300 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                />
              </div>

              <button
                id="btn-login-submit"
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isLoggingIn ? 'Iniciando sesión...' : 'Ingresar'}
              </button>

              <div className="pt-2 flex items-center justify-center text-xs border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowSignUp(true)}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                >
                  ¿No tienes usuario? Registrarse
                </button>
              </div>

              {/* Demo Mode Quick Access */}
              <div className="mt-4 pt-4 border-t border-stone-100">
                <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 text-center">
                  <p className="text-xs text-stone-600 mb-2.5">
                    ¿Deseas acceder directamente para explorar el portal empresarial?
                  </p>
                  <button
                    id="btn-demo-mode"
                    type="button"
                    onClick={() => enterDemoMode && enterDemoMode(1)}
                    className="w-full py-2 px-3 bg-stone-900 text-white hover:bg-stone-800 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Ingresar en Modo Demostración
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={onSignUpSubmit} className="space-y-4 max-w-sm mx-auto p-2 sm:p-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-stone-900">Crear Cuenta</h2>
                <button
                  type="button"
                  onClick={() => setShowSignUp(false)}
                  className="text-xs text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  Volver a login
                </button>
              </div>

              {signUpStatus && (
                <div
                  className={`p-3 text-sm rounded-lg border flex items-start gap-2 ${
                    signUpStatus.success
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {signUpStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>{signUpStatus.message}</div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={signUpName}
                  onChange={(e) => setSignUpName(e.target.value)}
                  placeholder="Ej. Ana García"
                  className="w-full border border-stone-300 px-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="ana@empresa.com"
                  className="w-full border border-stone-300 px-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-stone-600 mb-1">
                  Contraseña (mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-stone-300 px-3 py-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningUp}
                className="w-full py-2.5 px-4 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {isSigningUp ? 'Creando cuenta...' : 'Crear Cuenta'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
