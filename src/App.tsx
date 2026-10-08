import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { Database, RefreshCw } from 'lucide-react';

const AppContent: React.FC = () => {
  const { session, loading, isDemoMode } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md mb-4 animate-pulse">
          <Database className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-stone-700 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Iniciando sesión segura...</span>
        </div>
        <p className="text-xs text-stone-400 mt-1">Cargando datos de la empresa</p>
      </div>
    );
  }

  if (!session && !isDemoMode) {
    return <LoginView />;
  }

  return <DashboardView />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
