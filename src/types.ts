export interface TenantCompany {
  id: string | number;
  client_id: number;
  name: string;
  logo?: string;
  public_client_id?: string;
  api_key?: string;
  hubspot_token?: string;
  meta_page_id?: string | number;
  meta_token?: string;
  kie_apikey?: string | null;
  llm_local_apikey?: string | null;
}

export interface MetaAttachment {
  media?: {
    image?: {
      src?: string;
      height?: number;
      width?: number;
    };
  };
  type?: string;
  title?: string;
  description?: string;
  url?: string;
}

export interface SentimentDistribution {
  positivo: number;
  negativo: number;
  neutral: number;
  total: number;
}

export interface InterestDistribution {
  muy_alto?: number;
  alto: number;
  medio: number;
  bajo: number;
  muy_bajo?: number;
  ninguno: number;
}

export interface PriorityDistribution {
  muy_alta?: number;
  alta: number;
  media: number;
  baja: number;
  muy_baja?: number;
}

export interface MetaPost {
  id?: number | string;
  client_id: number;
  meta_page_id: string | number;
  meta_post_id: string;
  message: string | null;
  created_time: string | null;
  updated_time: string | null;
  permalink_url: string | null;
  raw_data?: {
    attachments?: {
      data?: MetaAttachment[];
    };
    sentiment_distribution?: SentimentDistribution;
    interest_distribution?: InterestDistribution;
    priority_distribution?: PriorityDistribution;
    [key: string]: any;
  } | null;
  last_comment_sync_at?: string | null;
  last_comment_updated_time?: string | null;
  analysis_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
  // Computed / UI helpers
  comments_count?: number;
  is_new_delta?: boolean;
}

export type SentimentLevel =
  | 'MUY NEGATIVO'
  | 'NEGATIVO'
  | 'NEUTRO'
  | 'POSITIVO'
  | 'MUY POSITIVO';

export type InterestLevel =
  | 'MUY BAJO'
  | 'BAJO'
  | 'MEDIO'
  | 'ALTO'
  | 'MUY ALTO';

export type PriorityLevel =
  | 'MUY BAJA'
  | 'BAJA'
  | 'MEDIA'
  | 'ALTA'
  | 'MUY ALTA';

export interface DimensionCategory {
  id: number;
  dimension: 'INTERES' | 'SENTIMIENTO' | 'PRIORIDAD';
  category: string;
  sort_order: number;
}

export const DIMENSION_CATEGORIES: DimensionCategory[] = [
  { id: 1, dimension: 'INTERES', category: 'MUY BAJO', sort_order: 1 },
  { id: 2, dimension: 'INTERES', category: 'BAJO', sort_order: 2 },
  { id: 3, dimension: 'INTERES', category: 'MEDIO', sort_order: 3 },
  { id: 4, dimension: 'INTERES', category: 'ALTO', sort_order: 4 },
  { id: 5, dimension: 'INTERES', category: 'MUY ALTO', sort_order: 5 },

  { id: 11, dimension: 'SENTIMIENTO', category: 'MUY NEGATIVO', sort_order: 1 },
  { id: 12, dimension: 'SENTIMIENTO', category: 'NEGATIVO', sort_order: 2 },
  { id: 13, dimension: 'SENTIMIENTO', category: 'NEUTRO', sort_order: 3 },
  { id: 14, dimension: 'SENTIMIENTO', category: 'POSITIVO', sort_order: 4 },
  { id: 15, dimension: 'SENTIMIENTO', category: 'MUY POSITIVO', sort_order: 5 },

  { id: 6, dimension: 'PRIORIDAD', category: 'MUY BAJA', sort_order: 1 },
  { id: 7, dimension: 'PRIORIDAD', category: 'BAJA', sort_order: 2 },
  { id: 8, dimension: 'PRIORIDAD', category: 'MEDIA', sort_order: 3 },
  { id: 9, dimension: 'PRIORIDAD', category: 'ALTA', sort_order: 4 },
  { id: 10, dimension: 'PRIORIDAD', category: 'MUY ALTA', sort_order: 5 },
];

export interface CommentAiAnalysis {
  sentiment_level: SentimentLevel | string;
  interest_level: InterestLevel | string;
  priority_level: PriorityLevel | string;
  reason?: string;
  intent?: string;
}

export interface MetaPostCommentDistribution {
  id?: number;
  client_id: number;
  post_id: number;
  analysis_updated_at: string;
  dimension: 'SENTIMIENTO' | 'INTERES' | 'PRIORIDAD' | string;
  category: string;
  comment_count: number;
  percentage: number;
  sort_order?: number;
  created_at?: string;
}

export interface MetaComment {
  id?: number | string;
  client_id: number;
  post_id: number | string;
  meta_comment_id: string;
  meta_parent_comment_id: string | null;
  message: string | null;
  created_time: string | null;
  updated_time: string | null;
  author_id: string | null;
  author_name: string | null;
  raw_data?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
  // AI Analysis fields
  sentiment_level?: SentimentLevel | string | null;
  interest_level?: InterestLevel | string | null;
  priority_level?: PriorityLevel | string | null;
  reason?: string | null;
  intent?: string | null;
  analysis_updated_at?: string | null;
  analysis_message_hash?: string | null;
  // Computed / UI helpers
  replies?: MetaComment[];
  is_new_delta?: boolean;
}

export interface SyncResult {
  client_id: number;
  meta_page_id: string;
  posts_count: number;
  comments_count: number;
  posts_created: number;
  posts_updated: number;
  comments_created: number;
  comments_updated: number;
  comments_analyzed?: number;
  comments_skipped_ai?: number;
  ai_analysis_reason?: string;
  started_at: string;
  finished_at: string;
  error?: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: any;
}

export interface MetaPageInfo {
  id: string;
  name: string;
  username?: string;
  about?: string;
  bio?: string;
  description?: string;
  general_info?: string;
  impressum?: string;
  followers_count?: number;
  fan_count?: number;
  category?: string;
  category_list?: Array<{ id: string; name: string }>;
  phone?: string;
  whatsapp_number?: string;
  emails?: string[];
  website?: string;
  single_line_address?: string;
  link?: string;
  is_published?: boolean;
  verification_status?: string;
  picture?: string;
}

export interface ActiveSyncProcess {
  id: number;
  client_id: number;
  platform: string;
  process_name: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  error_message?: string | null;
  created_at?: string;
}
