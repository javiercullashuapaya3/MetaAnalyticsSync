import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Database } from 'lucide-react';

interface SqlSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SQL_SCHEMA_CODE = `-- ============================================================
-- 1. TABLA: companies (Tenants / Empresas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY,
  client_id INT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo TEXT,
  public_client_id TEXT,
  api_key TEXT,
  hubspot_token TEXT,
  meta_page_id TEXT,
  meta_token TEXT,
  kie_apikey TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. TABLA: user_companies (Relación usuario auth y tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_companies (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  client_id INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. TABLA: profiles (Alternativa para client_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. TABLA: meta_posts (Publicaciones sincronizadas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_posts (
  id BIGSERIAL PRIMARY KEY,
  client_id INT NOT NULL,
  meta_page_id BIGINT,
  meta_post_id TEXT NOT NULL,
  message TEXT,
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  permalink_url TEXT,
  raw_data JSONB,
  last_comment_sync_at TIMESTAMPTZ,
  last_comment_updated_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_meta_posts UNIQUE (client_id, meta_post_id)
);

-- Índices para optimizar delta y filtros
CREATE INDEX IF NOT EXISTS idx_meta_posts_client ON public.meta_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_posts_updated ON public.meta_posts(updated_time DESC);

-- ============================================================
-- 5. TABLA: meta_comments (Comentarios e hilos jerárquicos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_comments (
  id BIGSERIAL PRIMARY KEY,
  client_id INT NOT NULL,
  post_id BIGINT REFERENCES public.meta_posts(id) ON DELETE CASCADE,
  meta_comment_id TEXT NOT NULL,
  meta_parent_comment_id TEXT,
  message TEXT,
  created_time TIMESTAMPTZ,
  updated_time TIMESTAMPTZ,
  author_id TEXT,
  author_name TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_meta_comments UNIQUE (client_id, meta_comment_id)
);

-- Índices para optimizar consultas de posts y deltas
CREATE INDEX IF NOT EXISTS idx_meta_comments_post ON public.meta_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_meta_comments_parent ON public.meta_comments(meta_parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_meta_comments_client_time ON public.meta_comments(client_id, updated_time DESC);

-- ============================================================
-- 6. TABLA: comment_analysis_categories (Dimensiones y Categorías)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comment_analysis_categories (
  id INT PRIMARY KEY,
  dimension TEXT NOT NULL,
  category TEXT NOT NULL,
  sort_order INT NOT NULL
);

INSERT INTO public.comment_analysis_categories (id, dimension, category, sort_order) VALUES
(1, 'INTERES', 'MUY BAJO', 1),
(2, 'INTERES', 'BAJO', 2),
(3, 'INTERES', 'MEDIO', 3),
(4, 'INTERES', 'ALTO', 4),
(5, 'INTERES', 'MUY ALTO', 5),
(11, 'SENTIMIENTO', 'MUY NEGATIVO', 1),
(12, 'SENTIMIENTO', 'NEGATIVO', 2),
(13, 'SENTIMIENTO', 'NEUTRO', 3),
(14, 'SENTIMIENTO', 'POSITIVO', 4),
(15, 'SENTIMIENTO', 'MUY POSITIVO', 5),
(6, 'PRIORIDAD', 'MUY BAJA', 1),
(7, 'PRIORIDAD', 'BAJA', 2),
(8, 'PRIORIDAD', 'MEDIA', 3),
(9, 'PRIORIDAD', 'ALTA', 4),
(10, 'PRIORIDAD', 'MUY ALTA', 5)
ON CONFLICT (id) DO UPDATE SET
  dimension = EXCLUDED.dimension,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;

-- ============================================================
-- 7. TABLA: meta_post_comment_distribution (Distribución por post)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meta_post_comment_distribution (
  id BIGSERIAL PRIMARY KEY,
  client_id INT NOT NULL,
  post_id BIGINT REFERENCES public.meta_posts(id) ON DELETE CASCADE,
  analysis_updated_at TIMESTAMPTZ DEFAULT NOW(),
  dimension TEXT NOT NULL,
  category TEXT NOT NULL,
  sort_order INT,
  comment_count INT DEFAULT 0,
  percentage NUMERIC(7,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_meta_post_dim_cat UNIQUE (post_id, dimension, category)
);

-- ============================================================
-- 8. POLÍTICAS ROW LEVEL SECURITY (RLS) RECOMENDADAS
-- ============================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_analysis_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_post_comment_distribution ENABLE ROW LEVEL SECURITY;

-- Permitir lectura y escritura a usuarios autenticados / clave anon
CREATE POLICY "Permitir todo a anon/authenticated para prototipo" ON public.companies FOR ALL USING (true);
CREATE POLICY "Permitir todo a user_companies" ON public.user_companies FOR ALL USING (true);
CREATE POLICY "Permitir todo a profiles" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Permitir todo a meta_posts" ON public.meta_posts FOR ALL USING (true);
CREATE POLICY "Permitir todo a meta_comments" ON public.meta_comments FOR ALL USING (true);
CREATE POLICY "Permitir todo a comment_analysis_categories" ON public.comment_analysis_categories FOR ALL USING (true);
CREATE POLICY "Permitir todo a meta_post_comment_distribution" ON public.meta_post_comment_distribution FOR ALL USING (true);
`;

export const SqlSchemaModal: React.FC<SqlSchemaModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCHEMA_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-stone-950 w-full max-w-3xl rounded-2xl shadow-2xl border border-stone-800 text-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between bg-stone-900/90">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-white text-base">Esquema SQL de Base de Datos</h3>
              <p className="text-xs text-stone-400">Estructura relacional de tablas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar SQL'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-emerald-400 bg-stone-950">
          <p className="text-stone-400 text-xs mb-3 font-sans">
            Script relacional para inicializar las tablas necesarias con claves foráneas, índices optimizados y soporte para multi-empresa:
          </p>
          <pre className="p-4 bg-black/60 rounded-xl border border-stone-800 leading-relaxed overflow-x-auto selection:bg-indigo-900 selection:text-white">
            {SQL_SCHEMA_CODE}
          </pre>
        </div>

        <div className="px-5 py-3 border-t border-stone-800 bg-stone-900 text-stone-400 text-xs flex items-center justify-between">
          <span>Incluye soporte para `companies`, `user_companies`, `profiles`, `meta_posts` y `meta_comments`</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-white rounded text-xs transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
