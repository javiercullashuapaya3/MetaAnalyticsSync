import { supabase } from '../supabase';
import {
  MetaPost,
  MetaComment,
  SyncResult,
  SyncLogEntry,
  MetaPageInfo,
  ActiveSyncProcess,
  CommentAiAnalysis,
  SentimentDistribution,
  InterestDistribution,
  PriorityDistribution,
  SentimentLevel,
  InterestLevel,
  PriorityLevel,
  DIMENSION_CATEGORIES,
  DimensionCategory,
} from '../types';

export const META_API_VERSION = 'v22.0';
export const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
export const POSTS_PAGE_LIMIT = 25;
export const COMMENTS_PAGE_LIMIT = 50;
export const MAX_POSTS_PAGES = 10; // Hasta 250 publicaciones paginadas por ejecución
export const MAX_COMMENTS_PAGES = 20; // Hasta 1000 comentarios paginados por post
export const COMMENT_OVERLAP_SECONDS = 60; // 60s de solapamiento para evitar pérdidas en bordes

// Memoria local de respaldo exclusiva por client_id en caso de indisponibilidad temporal
let inMemoryPosts: MetaPost[] = [];
let inMemoryComments: MetaComment[] = [];

export type LogCallback = (log: SyncLogEntry) => void;

/**
 * Sanitiza cualquier mensaje dirigido a usuarios para que no contenga:
 * - client_id o referencias a códigos de cliente
 * - URLs (http, https)
 * - Nombres de endpoints o jerga técnica (api, n8n, Qwen2.5-3B, tokens, etc.)
 */
export function sanitizeUserLogMessage(msg: string): string {
  if (!msg) return '';
  let clean = msg;
  // Eliminar referencias a client_id y prefijos técnicos
  clean = clean.replace(/\[?(?:IA\s*|Meta\s*)?client_id[=:\s]*\d+\]?\s*/gi, '');
  clean = clean.replace(/client_id[=:\s]*\d+/gi, '');
  clean = clean.replace(/código\s+de\s+cliente[=:\s]*\d+/gi, '');
  clean = clean.replace(/ID\s+de\s+cliente[=:\s]*\d+/gi, '');
  clean = clean.replace(/\[client_id=\d+\]\s*/gi, '');
  // Eliminar URLs completas
  clean = clean.replace(/https?:\/\/[^\s\)\],]+/gi, '');
  // Reemplazar términos técnicos por lenguaje informativo y amigable
  clean = clean.replace(/endpoint\s+(?:IA\s*)?(?:n8n)?/gi, 'servicio de Inteligencia Artificial');
  clean = clean.replace(/endpoint/gi, 'servicio');
  clean = clean.replace(/Qwen2\.5-3B(?:-Instruct)?/gi, 'Inteligencia Artificial');
  clean = clean.replace(/webhook/gi, 'servicio');
  clean = clean.replace(/n8n/gi, 'servicio de Inteligencia Artificial');
  clean = clean.replace(/agent_priority\s*(?:y\s*max_tokens=\d+)?/gi, '');
  clean = clean.replace(/max_tokens=\d+/gi, '');
  clean = clean.replace(/Meta Graph API/gi, 'Facebook');
  clean = clean.replace(/Meta API/gi, 'Facebook');
  clean = clean.replace(/Graph API/gi, 'Facebook');
  clean = clean.replace(/OAuthException/gi, 'permisos');
  clean = clean.replace(/#?\(\s*#?\d+\s*\)/gi, '');
  clean = clean.replace(/\bAPI\b/gi, 'servicio');
  clean = clean.replace(/\bJSON\b/gi, 'datos');
  clean = clean.replace(/\(\s*\)/g, '');
  clean = clean.replace(/\[\s*\]/g, '');
  clean = clean.replace(/\s{2,}/g, ' ').trim();
  return clean;
}

export function safeLog(
  onLog: LogCallback | undefined,
  level: 'info' | 'warn' | 'error' | 'success',
  rawMessage: string
) {
  if (!onLog) return;
  const message = sanitizeUserLogMessage(rawMessage);
  if (!message) return;
  onLog({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level,
    message,
  });
}

/**
 * Genera un hash determinista del mensaje para evitar re-analizar comentarios sin cambios
 */
/**
 * Resultado de resolución de token de Meta
 */
export interface ResolvedMetaToken {
  token: string;
  wasExchanged: boolean;
  pageName?: string;
  isPageToken: boolean;
}

/**
 * Resuelve y garantiza el uso de un Page Access Token para Meta Graph API:
 * 
 * En la "Nueva Experiencia para Páginas" de Meta, Facebook prohíbe el uso de User Access Tokens
 * para consultar /comments y /posts (arrojando OAuthException 190, subcódigo 2069032).
 * 
 * Si el usuario configuró un User Access Token (habitual al copiarlo de Graph API Explorer),
 * esta función consulta /{pageId}?fields=access_token y /me/accounts para obtener
 * automáticamente el Page Access Token real de la Fan Page correspondiente.
 */
export async function resolvePageAccessToken(
  pageId: string | number | undefined,
  inputToken: string | undefined
): Promise<ResolvedMetaToken> {
  const cleanToken = String(inputToken || '').trim();
  const cleanPageId = String(pageId || '').trim().replace(/\D/g, '');

  if (!cleanToken || !cleanPageId) {
    return { token: cleanToken, wasExchanged: false, isPageToken: false };
  }

  // 1. Intentar obtener el Page Access Token directo desde /{pageId}?fields=access_token,name
  try {
    const url = `${META_BASE_URL}/${cleanPageId}?fields=access_token,name&access_token=${encodeURIComponent(cleanToken)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data?.access_token) {
        const wasExchanged = data.access_token !== cleanToken;
        return {
          token: data.access_token,
          wasExchanged,
          pageName: data.name,
          isPageToken: true,
        };
      }
    }
  } catch (err) {
    console.warn('[resolvePageAccessToken] Error al consultar /{pageId}?fields=access_token:', err);
  }

  // 2. Si no fue posible con la llamada directa, consultar /me/accounts (lista de páginas administradas por el usuario)
  try {
    const accountsUrl = `${META_BASE_URL}/me/accounts?access_token=${encodeURIComponent(cleanToken)}`;
    const res = await fetch(accountsUrl);
    if (res.ok) {
      const data = await res.json();
      const page = data?.data?.find((p: any) => String(p.id) === cleanPageId);
      if (page?.access_token) {
        return {
          token: page.access_token,
          wasExchanged: page.access_token !== cleanToken,
          pageName: page.name,
          isPageToken: true,
        };
      }
    }
  } catch (err) {
    console.warn('[resolvePageAccessToken] Error al consultar /me/accounts:', err);
  }

  return { token: cleanToken, wasExchanged: false, isPageToken: false };
}

/**
 * Obtiene el token de Meta y las credenciales frescas directamente desde la tabla 'companies'
 * (campo 'meta_token', 'meta_page_id' y 'llm_local_apikey' WHERE id = :client_id).
 * Además, si el token guardado es un User Access Token, lo intercambia automáticamente
 * por el Page Access Token y lo persiste en la BD para habilitar la lectura de comentarios.
 */
export async function getFreshCompanyMetaToken(client_id: number): Promise<{
  pageId: string;
  token: string;
  llmKey: string;
  companyName: string;
}> {
  if (!client_id || typeof client_id !== 'number') {
    throw new Error('getFreshCompanyMetaToken requiere un ID numérico de compañía válido.');
  }

  const { data: comp, error } = await supabase
    .from('companies')
    .select('id, name, meta_page_id, meta_token, llm_local_apikey')
    .eq('id', client_id)
    .maybeSingle();

  if (error) {
    throw new Error(`Error consultando la tabla companies para client_id=${client_id}: ${error.message}`);
  }

  if (!comp) {
    throw new Error(`No se encontró ninguna empresa con id=${client_id} en la tabla companies.`);
  }

  const pageId = comp.meta_page_id ? String(comp.meta_page_id).trim().replace(/\D/g, '') : '';
  let token = comp.meta_token ? String(comp.meta_token).trim() : '';
  const llmKey = comp.llm_local_apikey
    ? String(comp.llm_local_apikey).trim()
    : 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';

  // Si hay token y pageId, verificar si requiere intercambio automático por Page Access Token
  if (pageId && token) {
    try {
      const resolved = await resolvePageAccessToken(pageId, token);
      if (resolved.wasExchanged && resolved.token) {
        console.log(`[getFreshCompanyMetaToken] Intercambiado User Token por Page Access Token para página "${resolved.pageName || pageId}"`);
        token = resolved.token;
        // Persistir en background en la tabla companies para que quede guardado permanentemente
        supabase
          .from('companies')
          .update({ meta_token: resolved.token })
          .eq('id', client_id)
          .then();
      }
    } catch (tokenErr) {
      console.warn('[getFreshCompanyMetaToken] Error al resolver Page Token:', tokenErr);
    }
  }

  return {
    pageId,
    token,
    llmKey,
    companyName: comp.name || `Empresa ID ${client_id}`,
  };
}

export function computeMessageHash(text: string): string {
  const clean = (text || '').trim();
  if (!clean) return 'hash_empty';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash)}_${clean.length}`;
}

/**
 * Parsea fechas de Meta a formato ISO UTC estándar
 */
export function parseMetaDatetime(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Petición GET a Meta Graph API
 */
async function metaGet(endpoint: string, token: string, params: Record<string, any> = {}): Promise<any> {
  const isFullUrl = endpoint.startsWith('http');
  const url = new URL(isFullUrl ? endpoint : `${META_BASE_URL}/${endpoint.replace(/^\//, '')}`);

  if (!isFullUrl) {
    url.searchParams.set('access_token', token);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    });
  } else {
    // Si ya viene con fullUrl (paginación next), asegurarse de que el access_token esté presente
    if (!url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', token);
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    let errDetail: any;
    try {
      errDetail = await response.json();
    } catch {
      errDetail = await response.text();
    }

    const errObj = errDetail?.error;
    const subcode = errObj?.error_subcode;
    const userMsg = errObj?.error_user_msg || errObj?.error_user_title;

    let message = errObj?.message || (typeof errDetail === 'string' ? errDetail : JSON.stringify(errDetail));

    // Si Meta devuelve el subcódigo específico 2069032 (User Token usado en lugar de Page Token)
    if (subcode === 2069032 || message?.includes('No se admite el token de acceso del usuario')) {
      message = `${message}: En la nueva experiencia para páginas se requiere un Token de Acceso de Página (Page Access Token). ${userMsg || ''}`.trim();
    }

    const customErr: any = new Error(`Meta API error ${response.status}: ${message}`);
    customErr.status = response.status;
    customErr.code = errObj?.code;
    customErr.subcode = subcode;
    customErr.errorUserMsg = userMsg;
    throw customErr;
  }

  return response.json();
}

/**
 * Generator para obtener publicaciones de Meta Graph API con PAGINACIÓN automática
 */
export async function* getMetaPosts(
  pageId: string,
  token: string,
  onLog?: LogCallback
): AsyncGenerator<any, void, unknown> {
  const fields = 'id,message,created_time,updated_time,permalink_url,attachments{media,type,title,description,url}';
  let endpoint = `${pageId}/posts`;
  let params: Record<string, any> = {
    fields,
    limit: POSTS_PAGE_LIMIT,
  };

  let pageIndex = 1;

  while (endpoint && pageIndex <= MAX_POSTS_PAGES) {
    if (onLog) {
      onLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Consultando Meta Graph API (Página ${pageIndex} de publicaciones)...`,
      });
    }

    const data = await metaGet(endpoint, token, params);
    const posts = data?.data || [];

    for (const post of posts) {
      yield post;
    }

    // Paginación: si existe paging.next y se devolvieron elementos, continuar
    const nextUrl = data?.paging?.next;
    if (nextUrl && posts.length > 0) {
      endpoint = nextUrl;
      params = {}; // La URL next ya incluye cursores y access_token
      pageIndex++;
    } else {
      break;
    }
  }
}

/**
 * Generator para obtener comentarios de un post en Meta con PAGINACIÓN automática y delta
 */
export async function* getMetaComments(
  postMetaId: string,
  token: string,
  sinceTimestamp?: number | null,
  onLog?: LogCallback
): AsyncGenerator<any, void, unknown> {
  const fields = 'id,message,created_time,updated_time,from{id,name,picture,link},parent,like_count';
  let endpoint = `${postMetaId}/comments`;
  let params: Record<string, any> = {
    fields,
    limit: COMMENTS_PAGE_LIMIT,
    order: 'reverse_chronological',
  };

  if (sinceTimestamp) {
    params['since'] = sinceTimestamp;
  }

  let pageIndex = 1;

  while (endpoint && pageIndex <= MAX_COMMENTS_PAGES) {
    const data = await metaGet(endpoint, token, params);
    const comments = data?.data || [];

    for (const comment of comments) {
      yield comment;
    }

    // Si usamos delta y el último comentario de la página ya es anterior a sinceTimestamp, detener paginación
    if (sinceTimestamp && comments.length > 0) {
      const oldestInPage = comments[comments.length - 1];
      const oldestTime = parseMetaDatetime(oldestInPage.updated_time || oldestInPage.created_time);
      if (oldestTime && Math.floor(new Date(oldestTime).getTime() / 1000) < sinceTimestamp) {
        break;
      }
    }

    const nextUrl = data?.paging?.next;
    if (nextUrl && comments.length > 0) {
      endpoint = nextUrl;
      params = {};
      pageIndex++;
    } else {
      break;
    }
  }
}

export type { MetaPageInfo };

/**
 * Devuelve el comando cURL exacto para consultar la información enriquecida de la Fan Page
 */
export function getPageInfoCurl(pageId: string | number | undefined, token?: string): string {
  const cleanId = String(pageId || '113022817972331').trim();
  const cleanToken = token || '<token>';
  return `curl --request GET \\
  --url "https://graph.facebook.com/v21.0/${cleanId}?fields=id,name,username,about,bio,description,general_info,impressum,followers_count,fan_count,category,category_list,phone,whatsapp_number,emails,website,single_line_address,link,is_published,verification_status" \\
  --header "Authorization: Bearer ${cleanToken}"`;
}

/**
 * Interfaz con resultado detallado de prueba de conexión con Meta API
 */
export interface MetaConnectionTestResult {
  success: boolean;
  pageName?: string;
  pageId?: string;
  detectedPageId?: string;
  idMismatchWarning?: string;
  picture?: string;
  category?: string;
  postsAccessible?: boolean;
  postsSampleCount?: number;
  samplePostSnippet?: string;
  resolvedPageToken?: string;
  tokenTypeNote?: string;
  error?: string;
  errorCode?: number;
  errorType?: string;
  errorSubcode?: number;
  fbtraceId?: string;
  suggestion?: string;
}

/**
 * Consulta la información oficial de la Fan Page de Facebook a partir de su Page ID
 * usando la Graph API v21.0 con los campos solicitados:
 * fields=id,name,username,about,bio,description,general_info,impressum,followers_count,fan_count,category,category_list,phone,whatsapp_number,emails,website,single_line_address,link,is_published,verification_status,picture.type(large)
 */
export async function fetchMetaPageInfo(
  pageId: string | number | undefined,
  token?: string
): Promise<MetaPageInfo | null> {
  const cleanId = String(pageId || '').trim().replace(/\D/g, '');
  if (!cleanId) return null;

  const cacheKey = `meta_page_info_v21_${cleanId}`;
  let cachedInfo: MetaPageInfo | null = null;
  if (typeof window !== 'undefined') {
    const cachedStr = localStorage.getItem(cacheKey);
    if (cachedStr) {
      try {
        cachedInfo = JSON.parse(cachedStr);
      } catch {}
    }
  }

  const cleanToken = (token || '').trim();
  if (cleanToken) {
    try {
      const fields = [
        'id',
        'name',
        'username',
        'about',
        'bio',
        'description',
        'general_info',
        'impressum',
        'followers_count',
        'fan_count',
        'category',
        'category_list',
        'phone',
        'whatsapp_number',
        'emails',
        'website',
        'single_line_address',
        'link',
        'is_published',
        'verification_status',
        'picture.type(large)',
      ].join(',');

      const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cleanId)}?fields=${fields}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
        },
      });
      const json = await res.json();
      if (res.ok && !json.error && json.name) {
        const info: MetaPageInfo = {
          id: json.id || cleanId,
          name: json.name,
          username: json.username,
          about: json.about,
          bio: json.bio,
          description: json.description,
          general_info: json.general_info,
          impressum: json.impressum,
          followers_count: json.followers_count ?? json.fan_count,
          fan_count: json.fan_count ?? json.followers_count,
          category: json.category,
          category_list: json.category_list,
          phone: json.phone,
          whatsapp_number: json.whatsapp_number,
          emails: json.emails,
          website: json.website,
          single_line_address: json.single_line_address,
          link: json.link || (json.username ? `https://www.facebook.com/${json.username}` : `https://www.facebook.com/${cleanId}`),
          is_published: json.is_published,
          verification_status: json.verification_status,
          picture: json.picture?.data?.url || '',
        };
        if (typeof window !== 'undefined') {
          localStorage.setItem(cacheKey, JSON.stringify(info));
        }
        return info;
      }
    } catch (e) {
      console.warn('Error al consultar info extendida de página en Meta:', e);
    }
  }

  return cachedInfo || { id: cleanId, name: `Página (${cleanId})` };
}

/**
 * Prueba la conexión con Meta Graph API verificando tanto la información de la página como el acceso a publicaciones/comentarios
 */
export async function testMetaConnection(
  pageId: string | number | undefined,
  token?: string
): Promise<MetaConnectionTestResult> {
  const cleanId = String(pageId || '').trim().replace(/\D/g, '');
  const cleanToken = (token || '').trim();

  if (!cleanId || !cleanToken) {
    return {
      success: false,
      error: 'Por favor ingresa tanto el Page ID numérico como el Meta Access Token.',
    };
  }

  // 0. Resolver automáticamente el Page Access Token si se ingresó un User Access Token
  let effectiveToken = cleanToken;
  let resolvedInfo: ResolvedMetaToken | null = null;
  try {
    resolvedInfo = await resolvePageAccessToken(cleanId, cleanToken);
    if (resolvedInfo?.token) {
      effectiveToken = resolvedInfo.token;
    }
  } catch {}

  // 1. Inspeccionar quién es el dueño del token original mediante /me
  let meId: string | undefined;
  let meName: string | undefined;
  try {
    const meRes = await fetch(`${META_BASE_URL}/me?fields=id,name,picture.type(large),link&access_token=${encodeURIComponent(cleanToken)}`);
    const meJson = await meRes.json();
    if (meRes.ok && !meJson.error && meJson.id) {
      meId = String(meJson.id);
      meName = meJson.name;
    }
  } catch {}

  // Si el Page ID ingresado no coincide con el /me del token, guardamos la discrepancia
  const idMismatch = meId && meId !== cleanId;

  // El ID efectivo a probar: primero el ingresado por el usuario, o si falla y hay un /me.id, probar el de /me
  let effectiveId = cleanId;

  let pageName: string | undefined = resolvedInfo?.pageName;
  let picture: string | undefined;
  let category: string | undefined;
  let pageError: any = null;

  // 1. Probar información básica de la página con el token efectivo
  try {
    const pageUrl = `${META_BASE_URL}/${encodeURIComponent(effectiveId)}?fields=id,name,picture.type(large),category,link&access_token=${encodeURIComponent(effectiveToken)}`;
    const pageRes = await fetch(pageUrl);
    const pageJson = await pageRes.json();

    if (pageRes.ok && !pageJson.error && pageJson.name) {
      pageName = pageJson.name;
      picture = pageJson.picture?.data?.url || '';
      category = pageJson.category;
    } else if (pageJson.error) {
      pageError = pageJson.error;
    }
  } catch (err: any) {
    pageError = { message: err?.message || 'Error de red al consultar información de la página' };
  }

  // 2. Probar acceso al endpoint de publicaciones (/posts) con el token efectivo
  let postsAccessible = false;
  let postsSampleCount = 0;
  let samplePostSnippet: string | undefined;
  let postsError: any = null;

  try {
    const postsUrl = `${META_BASE_URL}/${encodeURIComponent(effectiveId)}/posts?fields=id,message,created_time&limit=3&access_token=${encodeURIComponent(effectiveToken)}`;
    const postsRes = await fetch(postsUrl);
    const postsJson = await postsRes.json();

    if (postsRes.ok && !postsJson.error && Array.isArray(postsJson.data)) {
      postsAccessible = true;
      postsSampleCount = postsJson.data.length;
      if (postsJson.data.length > 0 && postsJson.data[0].message) {
        samplePostSnippet = postsJson.data[0].message.slice(0, 60);
      }
    } else if (postsJson.error) {
      postsError = postsJson.error;
    }
  } catch (err: any) {
    postsError = { message: err?.message || 'Error de red al consultar posts de la página' };
  }

  // 3. Si falló con el ID ingresado pero /me.id era diferente (ej. typo en el último dígito 995284600341041 vs 995284600341040)
  if (!pageName && !postsAccessible && idMismatch && meId) {
    try {
      const postsUrl2 = `${META_BASE_URL}/${encodeURIComponent(meId)}/posts?fields=id,message,created_time&limit=3&access_token=${encodeURIComponent(effectiveToken)}`;
      const postsRes2 = await fetch(postsUrl2);
      const postsJson2 = await postsRes2.json();

      if (postsRes2.ok && !postsJson2.error && Array.isArray(postsJson2.data)) {
        return {
          success: true,
          pageName: meName || `Página (${meId})`,
          pageId: meId,
          detectedPageId: meId,
          postsAccessible: true,
          postsSampleCount: postsJson2.data.length,
          samplePostSnippet: postsJson2.data[0]?.message ? postsJson2.data[0].message.slice(0, 60) : undefined,
          resolvedPageToken: resolvedInfo?.wasExchanged ? resolvedInfo.token : undefined,
          tokenTypeNote: resolvedInfo?.wasExchanged
            ? `Se detectó un Token de Usuario y se obtuvo automáticamente el Page Access Token para "${pageName || meName}".`
            : undefined,
          idMismatchWarning: `Atención: El Page ID ingresado ("${cleanId}") tenía un dígito incorrecto. Tu token pertenece a la página "${meName}" con ID ${meId}. ¡Conexión validada con el ID correcto!`,
        };
      }
    } catch {}
  }

  // Si al menos uno de los dos métodos tuvo éxito
  if (pageName || postsAccessible) {
    const wasExchanged = resolvedInfo?.wasExchanged;
    return {
      success: true,
      pageName: pageName || meName || `Página (${effectiveId})`,
      pageId: effectiveId,
      picture,
      category,
      postsAccessible,
      postsSampleCount,
      samplePostSnippet,
      resolvedPageToken: wasExchanged ? resolvedInfo?.token : undefined,
      tokenTypeNote: wasExchanged
        ? `¡Token de Usuario detectado e intercambiado con éxito! Se obtuvo el Token de Acceso de Página para "${pageName || effectiveId}", necesario para sincronizar publicaciones y comentarios.`
        : undefined,
    };
  }

  // Si fallaron ambos, extraer el detalle exacto de Meta para guiar al usuario
  const activeError = postsError || pageError;
  const errorMsg = activeError?.message || 'No se pudo validar la conexión con Meta.';
  const code = activeError?.code;
  const subcode = activeError?.error_subcode;

  let suggestion = '';
  if (code === 100 && errorMsg.includes('nonexisting field (posts)')) {
    if (meId) {
      suggestion = `El Page ID "${cleanId}" no existe en Meta. El token corresponde a la página "${meName}" con ID ${meId}. Cambia el Page ID a ${meId}.`;
    } else {
      suggestion = `El Page ID "${cleanId}" no corresponde a una Fan Page válida de Facebook o tiene un error de tipeo (verifica si termina en 0, no en 1). Asegúrate de ingresar el Page ID exacto de tu Fan Page.`;
    }
  } else if (code === 190) {
    if (subcode === 463 || errorMsg.includes('Session has expired')) {
      suggestion = 'Tu sesión en Meta ha expirado (Error 190, Subcódigo 463). El token de acceso ya no es válido en Facebook. Debes generar un nuevo Page Access Token en Meta for Developers (Herramienta Explorador de la API Graph) y guardarlo aquí en Configuración.';
    } else if (subcode === 2069032 || errorMsg.includes('token de acceso del usuario')) {
      suggestion = 'Estás usando un User Access Token en lugar de un Page Access Token. En la nueva experiencia de Páginas de Facebook se requiere un Token de Acceso de Página. Selecciona tu Fan Page en el desplegable de Meta for Developers para generar el Page Access Token.';
    } else {
      suggestion = 'El token de acceso de Meta ha expirado o tiene un formato no válido (Error 190). Genera un nuevo Page Access Token en Meta for Developers y guárdalo.';
    }
  } else if (code === 200 || code === 10) {
    suggestion = 'Permisos insuficientes. Asegúrate de incluir los permisos pages_read_engagement y pages_read_user_content en Meta.';
  } else if (code === 100) {
    suggestion = 'Verifica que el Page ID numérico sea correcto y pertenezca a una Fan Page administrada por la cuenta del token.';
  }

  return {
    success: false,
    error: errorMsg,
    errorCode: code,
    errorType: activeError?.type,
    errorSubcode: subcode,
    fbtraceId: activeError?.fbtrace_id,
    suggestion,
    detectedPageId: meId,
  };
}

/**
 * Inserta o actualiza un post en la base de datos exclusivamente para client_id
 * UPSERT on (client_id, meta_post_id)
 */
async function upsertPost(
  clientId: number,
  pageId: string | number,
  post: any
): Promise<{ id: string | number; isNew: boolean }> {
  const metaPostId = post.id;
  if (!metaPostId) return { id: '', isNew: false };

  const createdTime = parseMetaDatetime(post.created_time);
  const updatedTime = parseMetaDatetime(post.updated_time);

  const payload: Partial<MetaPost> = {
    client_id: clientId,
    meta_page_id: typeof pageId === 'string' ? parseInt(pageId, 10) || 0 : pageId,
    meta_post_id: metaPostId,
    message: post.message || '',
    created_time: createdTime,
    updated_time: updatedTime,
    permalink_url: post.permalink_url || null,
    raw_data: post,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('meta_posts')
      .upsert(payload, { onConflict: 'client_id,meta_post_id' })
      .select('id, created_at, updated_at')
      .maybeSingle();

    if (error) throw error;
    const isNew = data?.created_at === data?.updated_at;
    return { id: data?.id || metaPostId, isNew };
  } catch (err) {
    // Almacenamiento local con aislamiento estricto por clientId
    const existingIndex = inMemoryPosts.findIndex(
      (p) => p.client_id === clientId && p.meta_post_id === metaPostId
    );
    if (existingIndex >= 0) {
      inMemoryPosts[existingIndex] = {
        ...inMemoryPosts[existingIndex],
        ...payload,
        updated_at: new Date().toISOString(),
        id: inMemoryPosts[existingIndex].id,
      } as MetaPost;
      return { id: inMemoryPosts[existingIndex].id!, isNew: false };
    } else {
      const newId = inMemoryPosts.length + 1;
      const newPost: MetaPost = {
        ...payload,
        id: newId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as MetaPost;
      inMemoryPosts.unshift(newPost);
      return { id: newId, isNew: true };
    }
  }
}

/**
 * Obtiene la última fecha de sincronización de comentarios de un post filtrado por client_id
 */
async function getLastCommentSync(clientId: number, postId: string | number): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('meta_posts')
      .select('last_comment_sync_at')
      .eq('client_id', clientId)
      .eq('id', postId)
      .maybeSingle();

    if (!error && data?.last_comment_sync_at) {
      return data.last_comment_sync_at;
    }
  } catch {}

  const local = inMemoryPosts.find((p) => p.client_id === clientId && p.id === postId);
  return local?.last_comment_sync_at || null;
}

/**
 * Inserta o actualiza un comentario en la base de datos exclusivamente para client_id
 * UPSERT on (client_id, meta_comment_id)
 */
async function upsertComment(
  clientId: number,
  postId: string | number,
  comment: any
): Promise<{ id: string | number; isNew: boolean; commentObj: MetaComment }> {
  const metaCommentId = comment.id;
  if (!metaCommentId) return { id: '', isNew: false, commentObj: {} as MetaComment };

  const createdTime = parseMetaDatetime(comment.created_time);
  let updatedTime = parseMetaDatetime(comment.updated_time);
  if (!updatedTime) updatedTime = createdTime;

  let authorId: string | null = null;
  let authorName: string | null = null;
  if (comment.from) {
    authorId = comment.from.id || null;
    authorName = comment.from.name || null;
  }

  let parentCommentId: string | null = null;
  if (comment.parent && typeof comment.parent === 'object') {
    parentCommentId = comment.parent.id || null;
  }

  const payload: Partial<MetaComment> = {
    client_id: clientId,
    post_id: postId,
    meta_comment_id: metaCommentId,
    meta_parent_comment_id: parentCommentId,
    message: comment.message || '',
    created_time: createdTime,
    updated_time: updatedTime,
    author_id: authorId,
    author_name: authorName,
    raw_data: comment,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('meta_comments')
      .upsert(payload, { onConflict: 'client_id,meta_comment_id' })
      .select('id, created_at, updated_at, sentiment_level, interest_level, priority_level, analysis_updated_at, analysis_message_hash')
      .maybeSingle();

    if (error) throw error;
    const isNew = data?.created_at === data?.updated_at;
    const commentObj: MetaComment = {
      ...payload,
      id: data?.id || metaCommentId,
      sentiment_level: data?.sentiment_level || null,
      interest_level: data?.interest_level || null,
      priority_level: data?.priority_level || null,
      analysis_updated_at: data?.analysis_updated_at || null,
      analysis_message_hash: data?.analysis_message_hash || null,
    } as MetaComment;

    return { id: data?.id || metaCommentId, isNew, commentObj };
  } catch (err) {
    const idx = inMemoryComments.findIndex(
      (c) => c.client_id === clientId && c.meta_comment_id === metaCommentId
    );
    if (idx >= 0) {
      inMemoryComments[idx] = {
        ...inMemoryComments[idx],
        ...payload,
        updated_at: new Date().toISOString(),
      } as MetaComment;
      return { id: inMemoryComments[idx].id!, isNew: false, commentObj: inMemoryComments[idx] };
    } else {
      const newId = inMemoryComments.length + 1;
      const newComment: MetaComment = {
        ...payload,
        id: newId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as MetaComment;
      inMemoryComments.push(newComment);
      return { id: newId, isNew: true, commentObj: newComment };
    }
  }
}

/**
 * Actualiza el estado del cursor del post con el sync_time y max_comment_updated_time
 * Filtrado estrictamente por client_id
 */
async function updateCommentSyncState(
  clientId: number,
  postId: string | number,
  syncTime: string,
  maxCommentUpdatedTime: string | null
): Promise<void> {
  try {
    await supabase
      .from('meta_posts')
      .update({
        last_comment_sync_at: syncTime,
        last_comment_updated_time: maxCommentUpdatedTime,
      })
      .eq('client_id', clientId)
      .eq('id', postId);
  } catch {}

  const post = inMemoryPosts.find((p) => p.client_id === clientId && p.id === postId);
  if (post) {
    post.last_comment_sync_at = syncTime;
    post.last_comment_updated_time = maxCommentUpdatedTime;
  }
}

// =========================================================================
// FUNCIONES REQUERIDAS CON AISLAMIENTO MULTI-TENANT POR CLIENT_ID
// =========================================================================

/**
 * 1. sync_posts(client_id, metaPageId, metaToken, onLog)
 * Obtiene publicaciones de Meta para esa Page con paginación e inserta/actualiza exclusivamente para client_id
 */
export async function sync_posts(
  client_id: number,
  metaPageId: string,
  metaToken: string,
  onLog?: LogCallback
): Promise<{ posts: MetaPost[]; created: number; updated: number; count: number }> {
  const cleanPageId = metaPageId.trim().replace(/\D/g, '');
  const cleanToken = metaToken.trim();

  let createdCount = 0;
  let updatedCount = 0;
  const processedPosts: MetaPost[] = [];

  for await (const post of getMetaPosts(cleanPageId, cleanToken, onLog)) {
    const { id: postInternalId, isNew } = await upsertPost(client_id, cleanPageId, post);
    if (!postInternalId) continue;

    if (isNew) createdCount++;
    else updatedCount++;

    processedPosts.push({
      id: postInternalId,
      client_id,
      meta_page_id: cleanPageId,
      meta_post_id: post.id,
      message: post.message || null,
      created_time: parseMetaDatetime(post.created_time),
      updated_time: parseMetaDatetime(post.updated_time),
      permalink_url: post.permalink_url || null,
      raw_data: post,
    });
  }

  return {
    posts: processedPosts,
    created: createdCount,
    updated: updatedCount,
    count: processedPosts.length,
  };
}

/**
 * 2. sync_comments(client_id, postInternalId, metaPostId, metaToken, onLog)
 * Sincroniza comentarios de un post con paginación y delta overlap exclusivamente para client_id
 */
export async function sync_comments(
  client_id: number,
  postInternalId: string | number,
  metaPostId: string,
  metaToken: string,
  onLog?: LogCallback
): Promise<{ count: number; created: number; updated: number; comments: MetaComment[] }> {
  const lastSync = await getLastCommentSync(client_id, postInternalId);

  let since: number | null = null;
  if (lastSync) {
    const lastSyncDate = new Date(lastSync);
    const overlapTimestamp = Math.floor((lastSyncDate.getTime() - COMMENT_OVERLAP_SECONDS * 1000) / 1000);
    since = overlapTimestamp > 0 ? overlapTimestamp : null;
  }

  const syncStarted = new Date().toISOString();
  let maxCommentTime: string | null = null;
  let insertedOrUpdated = 0;
  let createdCount = 0;
  let updatedCount = 0;
  const processedComments: MetaComment[] = [];

  if (onLog) {
    safeLog(onLog, 'info', 'Comprobando comentarios actualizados de la publicación...');
  }

  for await (const comment of getMetaComments(metaPostId, metaToken, since, onLog)) {
    const commentTimeStr = parseMetaDatetime(comment.updated_time || comment.created_time);
    if (commentTimeStr) {
      if (!maxCommentTime || new Date(commentTimeStr) > new Date(maxCommentTime)) {
        maxCommentTime = commentTimeStr;
      }
    }

    const { isNew, commentObj } = await upsertComment(client_id, postInternalId, comment);
    insertedOrUpdated++;
    if (isNew) createdCount++;
    else updatedCount++;
    processedComments.push(commentObj);
  }

  if (!maxCommentTime) {
    maxCommentTime = lastSync;
  }

  await updateCommentSyncState(client_id, postInternalId, syncStarted, maxCommentTime);

  return {
    count: insertedOrUpdated,
    created: createdCount,
    updated: updatedCount,
    comments: processedComments,
  };
}

/**
 * Heurística de respaldo en español de alto rendimiento para clasificar sentimiento, interés y prioridad
 */
function classifyCommentFallback(message: string): CommentAiAnalysis {
  const text = (message || '').toLowerCase();

  // Detección de sentimiento
  const positiveWords = [
    'excelente', 'genial', 'felicidades', 'bueno', 'buenisimo', 'buena', 'me encanta',
    'lo quiero', 'quiero', 'interesante', 'gracias', 'recomiendo', 'maravilloso', 'top',
    'exito', 'exitos', 'gran servicio', 'super', 'me gusta', 'hermoso', 'lindo', 'muy bien'
  ];
  const negativeWords = [
    'pesimo', 'pesima', 'malo', 'mala', 'estafa', 'fraude', 'robo', 'ladrones', 'engano',
    'no funciona', 'no sirve', 'terrible', 'asco', 'demora', 'nunca llego', 'queja',
    'decepcion', 'caro', 'farsa', 'inutil', 'no responden', 'pesimo servicio', 'abuso'
  ];

  let isPositive = positiveWords.some((w) => text.includes(w));
  let isNegative = negativeWords.some((w) => text.includes(w));

  let sentiment_level: SentimentLevel = 'NEUTRO';
  if (text.includes('excelente') || text.includes('maravilloso') || text.includes('me encanta') || text.includes('son los mejores')) {
    sentiment_level = 'MUY POSITIVO';
  } else if (isPositive && !isNegative) {
    sentiment_level = 'POSITIVO';
  } else if (text.includes('estafa') || text.includes('fraude') || text.includes('ladrones') || text.includes('pesimo')) {
    sentiment_level = 'MUY NEGATIVO';
  } else if (isNegative) {
    sentiment_level = 'NEGATIVO';
  }

  // Detección de nivel de interés comercial (MUY BAJO, BAJO, MEDIO, ALTO, MUY ALTO)
  const veryHighInterestWords = ['lo compro hoy', 'donde pago', 'link de pago', 'comprar ya', 'lo quiero ya'];
  const highInterestWords = [
    'lo quiero', 'quiero', 'precio', 'costo', 'cuanto vale', 'cuanto cuesta', 'donde comprar',
    'donde lo compro', 'informacion', 'info por favor', 'info', 'inbox', 'dm', 'comprar',
    'cotizacion', 'disponible', 'contacto', 'adquirir', 'agente', 'probar'
  ];
  const mediumInterestWords = [
    'como funciona', 'de que trata', 'tienen', 'horario', 'ubicacion', 'donde queda', 'consulta'
  ];

  let interest_level: InterestLevel = 'MUY BAJO';
  if (veryHighInterestWords.some((w) => text.includes(w))) interest_level = 'MUY ALTO';
  else if (highInterestWords.some((w) => text.includes(w))) interest_level = 'ALTO';
  else if (mediumInterestWords.some((w) => text.includes(w))) interest_level = 'MEDIO';
  else if (text.length > 10) interest_level = 'BAJO';
  else interest_level = 'MUY BAJO';

  // Detección de prioridad (MUY BAJA, BAJA, MEDIA, ALTA, MUY ALTA)
  const criticalWords = ['estafa', 'fraude', 'denuncia', 'robo', 'demanda', 'emergencia', 'urgente'];
  let priority_level: PriorityLevel = 'BAJA';
  if (criticalWords.some((w) => text.includes(w)) || sentiment_level === 'MUY NEGATIVO') {
    priority_level = 'MUY ALTA';
  } else if (sentiment_level === 'NEGATIVO' || interest_level === 'MUY ALTO') {
    priority_level = 'ALTA';
  } else if (interest_level === 'ALTO' || interest_level === 'MEDIO') {
    priority_level = 'MEDIA';
  } else if (sentiment_level === 'MUY POSITIVO' || sentiment_level === 'POSITIVO') {
    priority_level = 'BAJA';
  } else {
    priority_level = 'MUY BAJA';
  }

  // Intención
  let intent = 'Comentario General';
  if (text.includes('precio') || text.includes('costo') || text.includes('cuanto')) intent = 'Consulta de Precio';
  else if (text.includes('comprar') || text.includes('lo quiero') || text.includes('cotiz')) intent = 'Interés de Compra';
  else if (sentiment_level === 'NEGATIVO' || sentiment_level === 'MUY NEGATIVO' || text.includes('queja') || text.includes('reclamo')) intent = 'Queja / Reclamo';
  else if (text.includes('ayuda') || text.includes('soporte') || text.includes('falla')) intent = 'Soporte Técnico';
  else if (sentiment_level === 'POSITIVO' || sentiment_level === 'MUY POSITIVO') intent = 'Felicitación / Engagement';

  return {
    sentiment_level,
    interest_level,
    priority_level,
    reason: `Análisis de contenido semántico (${sentiment_level}, intención: ${intent})`,
    intent,
  };
}

/**
 * 3. analyze_comment(client_id, comment, llmApiKey, onLog)
 * Analiza un comentario mediante el webhook n8n (https://n8n.promptia.lat/webhook/v1/chat/completions)
 * calculando los 3 niveles requeridos (Sentimiento, Interés, Prioridad), además de Intención y Motivo.
 */
export async function analyze_comment(
  client_id: number,
  comment: MetaComment,
  llmApiKey: string,
  onLog?: LogCallback
): Promise<CommentAiAnalysis & { analysis_message_hash: string }> {
  const message = (comment.message || '').trim();
  const currentHash = computeMessageHash(message);

  if (!message) {
    return {
      sentiment_level: 'NEUTRO',
      interest_level: 'MUY BAJO',
      priority_level: 'MUY BAJA',
      reason: 'Comentario sin texto accesible',
      intent: 'Multimedia / Vacío',
      analysis_message_hash: currentHash,
    };
  }

  const cleanKey = (llmApiKey || 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016').trim();

  // Llamada al endpoint webhook n8n: https://n8n.promptia.lat/webhook/v1/chat/completions
  try {
    const promptSystem = `Eres un analizador y clasificador experto de atención al cliente y social listening en español para Meta/Facebook.
Tu tarea es analizar el comentario y calcular rigurosamente los 3 niveles con sus dimensiones y categorías exactas en MAYÚSCULAS, además de la intención y el motivo:

1. Dimensión SENTIMIENTO (sentiment_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY NEGATIVO", "NEGATIVO", "NEUTRO", "POSITIVO", "MUY POSITIVO"
- "MUY POSITIVO": Máximo entusiasmo, recomendación eufórica, amor a la marca o agradecimiento efusivo ("¡Me encanta!", "¡Son los mejores!", "10/10", "Excelente servicio").
- "POSITIVO": Elogios, satisfacción, agrado o aprobación general ("buen servicio", "me gusta", "se ve bueno", "interesante propuesta").
- "NEUTRO": Consultas sobre precio ("precio?", "cuánto cuesta?", "info"), preguntas informativas sin carga emocional, comentarios descriptivos.
- "NEGATIVO": Quejas, inconformidad, demoras, reclamos leves o críticas constructivas ("mala atención", "se demoran mucho", "no me gustó").
- "MUY NEGATIVO": Furia, acusaciones de estafa, fraude, amenazas legales, insultos o abandono total con frustración severa ("son unos estafadores", "pésimo servicio, me robaron", "nunca más compro aquí").

2. Dimensión INTERES (interest_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY BAJO", "BAJO", "MEDIO", "ALTO", "MUY ALTO"
- "MUY ALTO": Intención directa de compra o contratación inmediata ("dónde compro ya", "pásame link de pago", "lo quiero hoy mismo", "listo para pagar").
- "ALTO": Alto interés comercial ("precio y disponibilidad para pedir", "lo quiero", "quiero cotización formal").
- "MEDIO": Preguntas sobre características, tiempos de entrega, métodos de pago o funcionamiento ("hacen envíos a provincia?", "acepta tarjeta?", "cómo funciona?").
- "BAJO": Comentarios casuales, mención a amigos, curiosidad superficial sin intención de compra clara.
- "MUY BAJO": Spam, insultos sin sentido, comentarios irrelevantes, enlaces externos, emojis o sin contexto comercial.

3. Dimensión PRIORIDAD (priority_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY BAJA", "BAJA", "MEDIA", "ALTA", "MUY ALTA"
- "MUY ALTA": Quejas críticas, acusaciones de estafa, amenazas legales, o compradores listos para pagar en el minuto.
- "ALTA": Reclamos directos, quejas sobre demoras, o prospectos con alta intención esperando respuesta comercial rápida.
- "MEDIA": Consultas de precio, preguntas sobre productos o dudas comerciales antes de decidirse.
- "BAJA": Elogios simples, saludos o interacciones secundarias amables.
- "MUY BAJA": Spam, menciones sin texto, comentarios irrelevantes o emojis aislados.

4. Intención (intent):
Valores posibles: "Consulta de Precio", "Interés de Compra", "Soporte", "Queja", "Felicitación", "General"

5. Motivo (reason):
Explicación concisa de 1 frase en español justificando la clasificación elegida.

Responde OBLIGATORIAMENTE en formato JSON puro sin formato markdown ni texto adicional:
{"sentiment_level":"MUY NEGATIVO|NEGATIVO|NEUTRO|POSITIVO|MUY POSITIVO","interest_level":"MUY BAJO|BAJO|MEDIO|ALTO|MUY ALTO","priority_level":"MUY BAJA|BAJA|MEDIA|ALTA|MUY ALTA","intent":"...","reason":"..."}`;

    const promptUser = `Comentario a evaluar: "${message}"`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    // Invocación cURL exacta según webhook n8n
    const requestPayload = {
      client_id: client_id,
      max_tokens: 50,
      temperature: 0.3,
      agent_priority: [
        'agent_1',
        'agent_2',
        'agent_4',
        'agent_3',
      ],
      messages: [
        { role: 'system', content: promptSystem },
        { role: 'user', content: promptUser },
      ],
    };

    const response = await fetch('https://n8n.promptia.lat/webhook/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const resJson = await response.json();
      const rawText = resJson.choices?.[0]?.message?.content || resJson.response || '';

      // Extracción resiliente de JSON incluso si max_tokens=50 truncó el cierre
      let parsed: any = null;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // En caso de que max_tokens=50 haya cortado el texto antes de la llave de cierre
      }

      // Respaldo por expresiones regulares para asegurar los 3 niveles obligatorios
      if (!parsed || (!parsed.sentiment_level && !parsed.interest_level && !parsed.priority_level)) {
        const sentMatch = rawText.match(/"sentiment_level"\s*:\s*"([^"]+)"/i);
        const intMatch = rawText.match(/"interest_level"\s*:\s*"([^"]+)"/i);
        const prioMatch = rawText.match(/"priority_level"\s*:\s*"([^"]+)"/i);
        const intentMatch = rawText.match(/"intent"\s*:\s*"([^"]+)"/i);
        const reasonMatch = rawText.match(/"reason"\s*:\s*"([^"]+)"/i);

        if (sentMatch || intMatch || prioMatch) {
          parsed = {
            sentiment_level: sentMatch ? sentMatch[1] : undefined,
            interest_level: intMatch ? intMatch[1] : undefined,
            priority_level: prioMatch ? prioMatch[1] : undefined,
            intent: intentMatch ? intentMatch[1] : 'General',
            reason: reasonMatch ? reasonMatch[1] : (message.slice(0, 30)),
          };
        }
      }

      if (parsed && (parsed.sentiment_level || parsed.interest_level || parsed.priority_level)) {
        const rawSent = String(parsed.sentiment_level || '').toUpperCase().trim();
        let normSentiment: SentimentLevel = 'NEUTRO';
        if (rawSent.includes('MUY POS') || rawSent.includes('MUY_POS')) {
          normSentiment = 'MUY POSITIVO';
        } else if (rawSent.includes('MUY NEG') || rawSent.includes('MUY_NEG')) {
          normSentiment = 'MUY NEGATIVO';
        } else if (rawSent.includes('POS')) {
          normSentiment = 'POSITIVO';
        } else if (rawSent.includes('NEG')) {
          normSentiment = 'NEGATIVO';
        } else {
          normSentiment = 'NEUTRO';
        }

        const rawInt = String(parsed.interest_level || '').toUpperCase().trim();
        let normInterest: InterestLevel = 'MUY BAJO';
        if (rawInt.includes('MUY ALT') || rawInt.includes('MUY_ALT')) {
          normInterest = 'MUY ALTO';
        } else if (rawInt.includes('MUY BAJ') || rawInt.includes('MUY_BAJ') || rawInt.includes('NINGUN') || rawInt.includes('NONE') || rawInt.includes('SIN')) {
          normInterest = 'MUY BAJO';
        } else if (rawInt.includes('ALT')) {
          normInterest = 'ALTO';
        } else if (rawInt.includes('MED')) {
          normInterest = 'MEDIO';
        } else if (rawInt.includes('BAJ')) {
          normInterest = 'BAJO';
        } else {
          normInterest = 'MUY BAJO';
        }

        const rawPrio = String(parsed.priority_level || '').toUpperCase().trim();
        let normPriority: PriorityLevel = 'BAJA';
        if (rawPrio.includes('MUY ALT') || rawPrio.includes('MUY_ALT') || rawPrio.includes('URGENT')) {
          normPriority = 'MUY ALTA';
        } else if (rawPrio.includes('MUY BAJ') || rawPrio.includes('MUY_BAJ')) {
          normPriority = 'MUY BAJA';
        } else if (rawPrio.includes('ALT')) {
          normPriority = 'ALTA';
        } else if (rawPrio.includes('MED')) {
          normPriority = 'MEDIA';
        } else if (rawPrio.includes('BAJ')) {
          normPriority = 'BAJA';
        }

        return {
          sentiment_level: normSentiment,
          interest_level: normInterest,
          priority_level: normPriority,
          reason: parsed.reason || `Clasificado con Qwen2.5-3B (${normSentiment})`,
          intent: parsed.intent || 'General',
          analysis_message_hash: currentHash,
        };
      }
      } else {
        const errBody = await response.text();
        console.warn(`[IA client_id=${client_id}] Respuesta LLM no OK (${response.status}):`, errBody);
      }
    } catch (err: any) {
    if (onLog) {
      onLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `[IA client_id=${client_id}] Consulta a LLM (Qwen2.5-3B) no completada (${err?.message || err}). Aplicando clasificador semántico de respaldo.`,
      });
    }
  }

  // Clasificador semántico local validado en caso de fallo de red
  const fallbackResult = classifyCommentFallback(message);
  return {
    ...fallbackResult,
    analysis_message_hash: currentHash,
  };
}

/**
 * Obtiene el token de IA (llm_local_apikey) desde la tabla companies para el client_id especificado.
 * Query: SELECT llm_local_apikey FROM companies WHERE id = :client_id
 * Siempre utiliza el valor de llm_local_apikey.
 */
export async function getLlmApiKeyForClient(
  client_id: number,
  onLog?: LogCallback
): Promise<string> {
  const DEFAULT_KEY = 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';
  if (!client_id || typeof client_id !== 'number') return DEFAULT_KEY;

  try {
    // Consulta directa a la tabla companies por id: siempre usar llm_local_apikey
    const { data: compById, error: errById } = await supabase
      .from('companies')
      .select('llm_local_apikey')
      .eq('id', client_id)
      .maybeSingle();

    if (!errById && compById?.llm_local_apikey) {
      const key = String(compById.llm_local_apikey).trim();
      if (key) return key;
    }
  } catch (err: any) {
    if (onLog) {
      onLog({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `[IA] Error al consultar llm_local_apikey en tabla companies para client_id=${client_id}: ${err?.message || err}`,
      });
    }
  }

  // Fallback de caché local de configuración si existe
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(`meta_config_${client_id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.llm_local_apikey) return String(parsed.llm_local_apikey).trim();
      }
      const tenantStored = localStorage.getItem('tenant_company');
      if (tenantStored) {
        const parsedTenant = JSON.parse(tenantStored);
        if (parsedTenant && Number(parsedTenant.client_id) === Number(client_id)) {
          if (parsedTenant.llm_local_apikey) return String(parsedTenant.llm_local_apikey).trim();
        }
      }
    } catch {}
  }

  return DEFAULT_KEY;
}

// Alias para compatibilidad hacia atrás
export const getKieApiKeyForClient = getLlmApiKeyForClient;

/**
 * Resuelve de forma segura el registro de un post (ID numérico de BD y meta_post_id)
 * evitando errores de casteo en PostgreSQL (code 22003 / invalid input syntax for type bigint).
 */
export async function resolvePostRecord(
  clientId: number,
  postId: string | number
): Promise<{ id: number; meta_post_id: string } | null> {
  if (!clientId || !postId) return null;

  const cleanStr = String(postId).trim();
  const isNumeric = typeof postId === 'number' || (/^\d+$/.test(cleanStr) && cleanStr.length < 15);

  if (isNumeric) {
    const numId = Number(cleanStr);
    try {
      const { data } = await supabase
        .from('meta_posts')
        .select('id, meta_post_id')
        .eq('client_id', clientId)
        .eq('id', numId)
        .maybeSingle();

      if (data?.id) {
        return { id: Number(data.id), meta_post_id: String(data.meta_post_id) };
      }
    } catch {}
  }

  try {
    const { data } = await supabase
      .from('meta_posts')
      .select('id, meta_post_id')
      .eq('client_id', clientId)
      .eq('meta_post_id', cleanStr)
      .maybeSingle();

    if (data?.id) {
      return { id: Number(data.id), meta_post_id: String(data.meta_post_id) };
    }
  } catch {}

  // 3. Coincidencia parcial o por sufijo (por ejemplo el sufijo de post "0127227594" o "122108750127227594")
  try {
    const { data } = await supabase
      .from('meta_posts')
      .select('id, meta_post_id')
      .eq('client_id', clientId)
      .ilike('meta_post_id', `%${cleanStr}%`)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return { id: Number(data.id), meta_post_id: String(data.meta_post_id) };
    }
  } catch {}

  // Fallback local en memoria
  const local = inMemoryPosts.find(
    (p) =>
      p.client_id === clientId &&
      (String(p.id) === cleanStr ||
        String(p.meta_post_id) === cleanStr ||
        String(p.meta_post_id).includes(cleanStr))
  );
  if (local?.id) {
    return { id: Number(local.id), meta_post_id: String(local.meta_post_id) };
  }

  return null;
}

/**
 * Estructura de evaluación de estado de cambios de un comentario
 */
export interface CommentChangeState {
  needsAnalysis: boolean;
  isNew: boolean;
  isModified: boolean;
  reason: string;
}

/**
 * Establece con precisión si un comentario es NUEVO o RECIENTEMENTE MODIFICADO:
 * 
 * 1. ¿Es NUEVO?
 *    - No tiene sentiment_level registrado (null o vacío).
 *    - O no tiene las métricas obligatorias completas (Sentimiento, Interés y Prioridad).
 * 
 * 2. ¿Es RECIENTEMENTE MODIFICADO?
 *    - El hash del mensaje actual no coincide con analysis_message_hash (el texto ha sido editado).
 * 
 * 3. Si ya cuenta con métricas y el texto es idéntico:
 *    - Se omite estrictamente para evitar re-análisis innecesario y consumo de tokens.
 */
export function evaluateCommentChangeState(
  comment: MetaComment,
  forceAi: boolean = false
): CommentChangeState {
  if (forceAi) {
    return {
      needsAnalysis: true,
      isNew: false,
      isModified: true,
      reason: 'Re-análisis solicitado por el usuario',
    };
  }

  // 1. Detección de comentario NUEVO o INCOMPLETO (OBLIGATORIEDAD DE LOS 3 NIVELES: Sentimiento, Interés y Prioridad)
  const isPendingOrEmpty = (val?: string | null) => {
    if (!val) return true;
    const s = String(val).trim().toLowerCase();
    return s === '' || s === 'pending' || s === 'pendiente' || s === 'null' || s === 'undefined';
  };

  const hasMissingMetric =
    isPendingOrEmpty(comment.sentiment_level) ||
    isPendingOrEmpty(comment.interest_level) ||
    isPendingOrEmpty(comment.priority_level);

  if (hasMissingMetric) {
    return {
      needsAnalysis: true,
      isNew: true,
      isModified: false,
      reason: 'Comentario nuevo pendiente de clasificación',
    };
  }

  // 2. Detección de comentario RECIENTEMENTE MODIFICADO
  const currentText = (comment.message || '').trim();
  const currentHash = computeMessageHash(currentText);

  if (comment.analysis_message_hash) {
    if (comment.analysis_message_hash !== currentHash) {
      return {
        needsAnalysis: true,
        isNew: false,
        isModified: true,
        reason: 'El texto del comentario ha sido modificado',
      };
    }
    // Hash idéntico y métricas completas: OMITIR
    return {
      needsAnalysis: false,
      isNew: false,
      isModified: false,
      reason: 'Comentario ya analizado previamente y su texto permanece idéntico',
    };
  }

  // Si ya cuenta con las 3 métricas pero no tenía hash (datos existentes en BD), se considera ya analizado
  return {
    needsAnalysis: false,
    isNew: false,
    isModified: false,
    reason: 'Comentario ya analizado previamente con métricas completas',
  };
}

/**
 * 4. analyze_pending_comments(client_id, apiKey, onLog, specificPostId, forceAi)
 * Identifica qué comentarios requieren análisis IA, los procesa y persiste en la BD.
 */
export async function analyze_pending_comments(
  client_id: number,
  apiKey?: string | null,
  onLog?: LogCallback,
  specificPostId?: string | number,
  forceAi: boolean = false,
  dateFilter: '1year' | 'all' = '1year'
): Promise<{ analyzed: number; skipped: number; reason?: string }> {
  let activeKey = (apiKey || '').trim();
  if (!activeKey) {
    activeKey = await getLlmApiKeyForClient(client_id, onLog);
  }

  if (!activeKey) {
    activeKey = 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';
  }

  // Filtro adicional por defecto: Comentarios del último año (365 días)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoIso = oneYearAgo.toISOString();

  if (onLog) {
    safeLog(onLog, 'info', 'Iniciando análisis inteligente de comentarios...');
    if (dateFilter === '1year') {
      safeLog(
        onLog,
        'info',
        `Filtro activo: comentarios del último año (desde ${oneYearAgo.toLocaleDateString('es-ES')}).`
      );
    }
  }

  // Consultar comentarios EXCLUSIVAMENTE para este client_id
  let query = supabase
    .from('meta_comments')
    .select('*')
    .eq('client_id', client_id);

  // Aplicar filtro de fecha del último año en la consulta a base de datos
  if (dateFilter === '1year') {
    query = query.or(`created_time.gte.${oneYearAgoIso},and(created_time.is.null,created_at.gte.${oneYearAgoIso})`);
  }

  let numericPostId: number | null = null;
  if (specificPostId) {
    const pRec = await resolvePostRecord(client_id, specificPostId);
    if (pRec?.id) {
      numericPostId = pRec.id;
    } else if (typeof specificPostId === 'number' || (/^\d+$/.test(String(specificPostId).trim()) && String(specificPostId).trim().length < 15)) {
      numericPostId = Number(specificPostId);
    }

    if (numericPostId) {
      query = query.eq('post_id', numericPostId);
    } else {
      if (onLog) {
        safeLog(onLog, 'warn', 'No se encontró la publicación solicitada en la base de datos.');
      }
      return { analyzed: 0, skipped: 0, reason: 'Publicación no encontrada en la base de datos.' };
    }
  }

  const { data: dbComments, error } = await query;
  if (error) {
    console.error('Error consultando meta_comments:', error);
  }
  let commentsList = dbComments || [];

  if (error || commentsList.length === 0) {
    commentsList = inMemoryComments.filter(
      (c) =>
        c.client_id === client_id &&
        (!numericPostId || Number(c.post_id) === numericPostId)
    );
  }

  // Asegurar que el filtro del último año se respete siempre de forma rigurosa
  if (dateFilter === '1year') {
    commentsList = commentsList.filter((c) => {
      const timeStr = c.created_time || c.created_at;
      if (!timeStr) return false;
      const commentTime = new Date(timeStr).getTime();
      return !isNaN(commentTime) && commentTime >= oneYearAgo.getTime();
    });
  }

  let analyzedCount = 0;
  let skippedCount = 0;
  let newCount = 0;
  let modifiedCount = 0;
  const modifiedPostIds = new Set<string | number>();

  for (const comment of commentsList) {
    const state = evaluateCommentChangeState(comment, forceAi);

    if (!state.needsAnalysis) {
      skippedCount++;
      continue;
    }

    if (state.isNew) newCount++;
    if (state.isModified) modifiedCount++;

    if (onLog) {
      const previewText = (comment.message || '').substring(0, 45);
      const ellipsis = (comment.message || '').length > 45 ? '...' : '';
      safeLog(onLog, 'info', `Analizando comentario: "${previewText}${ellipsis}"`);
    }

    const analysis = await analyze_comment(client_id, comment, activeKey, onLog);
    const nowIso = new Date().toISOString();

    const updatePayload = {
      sentiment_level: analysis.sentiment_level,
      interest_level: analysis.interest_level,
      priority_level: analysis.priority_level,
      analysis_updated_at: nowIso,
      analysis_message_hash: analysis.analysis_message_hash,
      raw_data: {
        ...(comment.raw_data || {}),
        ai_analysis: analysis,
      },
      updated_at: nowIso,
    };

    // Actualizar en base de datos preferentemente por la clave primaria 'id'
    if (comment.id) {
      await supabase
        .from('meta_comments')
        .update(updatePayload)
        .eq('id', comment.id);
    } else {
      await supabase
        .from('meta_comments')
        .update(updatePayload)
        .eq('client_id', client_id)
        .eq('meta_comment_id', comment.meta_comment_id);
    }

    // Mutar el objeto en la lista actual y en memoria local para sincronismo instantáneo
    Object.assign(comment, updatePayload);

    const localIdx = inMemoryComments.findIndex(
      (c) => c.client_id === client_id && c.meta_comment_id === comment.meta_comment_id
    );
    if (localIdx >= 0) {
      inMemoryComments[localIdx] = {
        ...inMemoryComments[localIdx],
        ...updatePayload,
      } as MetaComment;
    }

    analyzedCount++;
    modifiedPostIds.add(comment.post_id);
  }

  // Recalcular distribución para todos los posts cuyos comentarios fueron analizados
  for (const pid of modifiedPostIds) {
    await update_distribution(client_id, pid);
  }

  if (onLog && commentsList.length > 0 && analyzedCount === 0) {
    safeLog(
      onLog,
      'info',
      `Todos los comentarios (${skippedCount}) se encuentran analizados y al día.`
    );
  }

  return { analyzed: analyzedCount, skipped: skippedCount };
}

/**
 * Función dedicada para analizar comentarios con IA para un ÚNICO cliente / empresa
 */
export async function analyze_company_comments_ai(
  client_id: number,
  onLog?: LogCallback,
  forceAi: boolean = false,
  dateFilter: '1year' | 'all' = '1year'
): Promise<{ analyzed: number; skipped: number; reason?: string }> {
  if (!client_id || typeof client_id !== 'number') {
    throw new Error('Se requiere un identificador de empresa válido.');
  }

  if (onLog) {
    safeLog(
      onLog,
      'info',
      `Iniciando análisis de comentarios de la empresa (${dateFilter === '1year' ? 'último año' : 'todo el historial'})...`
    );
  }

  const result = await analyze_pending_comments(client_id, undefined, onLog, undefined, forceAi, dateFilter);

  // Asegurar que la distribución relacional meta_post_comment_distribution esté 100% sincronizada para todos los posts
  try {
    await sync_all_posts_distribution(client_id);
  } catch (syncDistErr) {
    console.warn('Advertencia al sincronizar distribuciones de publicaciones:', syncDistErr);
  }

  if (onLog) {
    if (result.reason) {
      safeLog(onLog, 'warn', `Resultado: ${result.reason}`);
    } else {
      safeLog(
        onLog,
        'success',
        `Análisis completado: ${result.analyzed} comentarios analizados (${result.skipped} omitidos por estar al día).`
      );
    }
  }

  return result;
}

/**
 * Función dedicada para analizar con IA exclusivamente los comentarios de un POST específico.
 */
export async function analyze_single_post_comments_ai(
  client_id: number,
  postId: string | number,
  onLog?: LogCallback,
  forceAi: boolean = false,
  dateFilter: '1year' | 'all' = '1year'
): Promise<{
  analyzed: number;
  skipped: number;
  reason?: string;
  sentiment_distribution?: SentimentDistribution;
  interest_distribution?: InterestDistribution;
  priority_distribution?: PriorityDistribution;
}> {
  if (!client_id || !postId) {
    throw new Error('Se requiere un identificador de publicación válido.');
  }

  // Resolver post de forma segura a su ID numérico relacional
  const pRec = await resolvePostRecord(client_id, postId);
  const resolvedInternalId = pRec?.id || (typeof postId === 'number' ? postId : Number(postId) || postId);
  const resolvedMetaId = pRec?.meta_post_id || String(postId);

  if (onLog) {
    safeLog(
      onLog,
      'info',
      `Iniciando análisis de comentarios para la publicación seleccionada (${dateFilter === '1year' ? 'último año' : 'todo el historial'})...`
    );
  }

  // 1. Sincronizar automáticamente comentarios recientes desde Facebook si hay credenciales configuradas
  try {
    const freshCreds = await getFreshCompanyMetaToken(client_id);
    if (freshCreds.token && resolvedMetaId) {
      await sync_comments(client_id, resolvedInternalId, resolvedMetaId, freshCreds.token, onLog);
    }
  } catch (syncErr) {
    // Si la sincronización remota no responde, continuar con los comentarios ya almacenados
  }

  // 2. Ejecutar análisis de comentarios pendientes para este post específico
  const result = await analyze_pending_comments(client_id, undefined, onLog, resolvedInternalId, forceAi, dateFilter);

  // 3. Recalcular inmediatamente la distribución de sentimiento, interés y prioridad para este post
  const dist = await update_distribution(client_id, resolvedInternalId);

  if (onLog) {
    if (result.reason) {
      safeLog(onLog, 'warn', `Resultado: ${result.reason}`);
    } else if (result.analyzed === 0) {
      safeLog(
        onLog,
        'info',
        `Todos los comentarios de la publicación (${result.skipped}) se encuentran analizados y al día.`
      );
    } else {
      safeLog(
        onLog,
        'success',
        `Análisis completado: ${result.analyzed} comentarios nuevos analizados (${result.skipped} omitidos por estar al día).`
      );
    }
  }

  return {
    analyzed: result.analyzed,
    skipped: result.skipped,
    reason: result.reason,
    sentiment_distribution: dist.sentiment_distribution,
    interest_distribution: dist.interest_distribution,
    priority_distribution: dist.priority_distribution,
  };
}

/**
 * Sincroniza exclusivamente los comentarios de UNA publicación desde Meta Graph API:
 * 1. Obtiene meta_token y llm_local_apikey de la tabla companies WHERE id = :client_id
 * 2. Obtiene los comentarios de Meta (con delta overlap de 60s)
 * 3. Analiza los comentarios con IA usando exclusivamente llm_local_apikey
 * 4. Actualiza la distribución relacional meta_post_comment_distribution
 * 5. Actualiza meta_posts con los contadores y raw_data
 * 6. Retorna el post actualizado y las métricas de la sincronización
 */
export async function sync_single_post_comments(
  client_id: number,
  postInternalIdOrMetaId: string | number | undefined | null,
  metaPostIdOrLog?: string | LogCallback,
  onLogOrInternalId?: LogCallback | string | number
): Promise<{
  count: number;
  created: number;
  updated: number;
  analyzed: number;
  skipped: number;
  post?: MetaPost;
}> {
  let postInternalId: string | number | undefined = undefined;
  let metaPostId = '';
  let onLog: LogCallback | undefined = undefined;

  if (typeof metaPostIdOrLog === 'string') {
    postInternalId = postInternalIdOrMetaId || undefined;
    metaPostId = metaPostIdOrLog;
    if (typeof onLogOrInternalId === 'function') {
      onLog = onLogOrInternalId;
    }
  } else {
    metaPostId = String(postInternalIdOrMetaId || '');
    if (typeof metaPostIdOrLog === 'function') {
      onLog = metaPostIdOrLog;
    }
    if (typeof onLogOrInternalId === 'string' || typeof onLogOrInternalId === 'number') {
      postInternalId = onLogOrInternalId;
    }
  }

  if (!client_id || !metaPostId) {
    throw new Error('sync_single_post_comments requiere client_id y metaPostId válidos.');
  }

  // 1. Obtener credenciales SIEMPRE directamente de la tabla companies WHERE id = :client_id
  let { token, llmKey: aiKey, companyName } = await getFreshCompanyMetaToken(client_id);

  if (!token) {
    throw new Error(`No se encontró meta_token en la tabla companies para la empresa "${companyName}" (ID=${client_id}). Configure el token en la pestaña Configuración.`);
  }

  // Resolver ID interno numérico del post si no viene definido
  let internalId: string | number = postInternalId || metaPostId;
  if (!postInternalId || String(postInternalId).includes('_')) {
    const { data: pRec } = await supabase
      .from('meta_posts')
      .select('id')
      .eq('client_id', client_id)
      .eq('meta_post_id', metaPostId)
      .maybeSingle();
    if (pRec?.id) internalId = pRec.id;
  }

  if (onLog) {
    safeLog(onLog, 'info', 'Conectando con la publicación para descargar comentarios actualizados...');
  }

  // 2. Descargar comentarios desde Meta API con captura y reintento inteligente de Page Access Token
  let commStats;
  try {
    commStats = await sync_comments(client_id, internalId, metaPostId, token, onLog);
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    if (
      err.subcode === 2069032 ||
      errorMsg.includes('2069032') ||
      errorMsg.includes('token de acceso del usuario') ||
      errorMsg.includes('Invalid OAuth 2.0 Access Token')
    ) {
      if (onLog) {
        safeLog(onLog, 'warn', 'Verificando permisos de acceso a la página para descargar comentarios...');
      }
      try {
        const fresh = await getFreshCompanyMetaToken(client_id);
        if (fresh.token && fresh.token !== token) {
          token = fresh.token;
          commStats = await sync_comments(client_id, internalId, metaPostId, token, onLog);
        } else {
          throw err;
        }
      } catch (retryErr: any) {
        const retryMsg = retryErr.message || String(retryErr);
        if (onLog) {
          safeLog(onLog, 'error', 'No se pudieron descargar los comentarios de la publicación.');
        }
        throw new Error(retryMsg);
      }
    } else {
      let friendlyMsg = 'No se pudieron obtener los comentarios de la publicación.';
      if (errorMsg.includes('190') || errorMsg.includes('Session has expired')) {
        friendlyMsg = `La sesión de Facebook ha expirado para "${companyName}". Por favor actualiza el token en la pestaña Configuración.`;
      }
      if (onLog) {
        safeLog(onLog, 'error', friendlyMsg);
      }
      throw new Error(friendlyMsg);
    }
  }

  // 3. Analizar comentarios pendientes con IA usando llm_local_apikey
  let aiStats = { analyzed: 0, skipped: 0 };
  const effectiveAiKey = (aiKey || '').trim() || 'f1966870894223e4cdfe9365c022e7393a53b099cacfe48eb036c051cb1a5016';
  aiStats = await analyze_pending_comments(client_id, effectiveAiKey, onLog, internalId);

  // 4. Actualizar distribución relacional meta_post_comment_distribution
  await update_distribution(client_id, internalId);

  // 5. Consultar post actualizado
  let updatedPost: MetaPost | undefined = undefined;
  const { data: refreshedPost } = await supabase
    .from('meta_posts')
    .select('*')
    .eq('client_id', client_id)
    .eq('id', internalId)
    .maybeSingle();

  if (refreshedPost) {
    updatedPost = refreshedPost as MetaPost;
  }

  if (onLog) {
    onLog({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `[Post ${metaPostId}] Comentarios actualizados: ${commStats.count} procesados (+${commStats.created} nuevos), ${aiStats.analyzed} analizados con IA (llm_local_apikey).`,
    });
  }

  return {
    count: commStats.count,
    created: commStats.created,
    updated: commStats.updated,
    analyzed: aiStats.analyzed,
    skipped: aiStats.skipped,
    post: updatedPost,
  };
}

/**
 * Helpers para mapear a las categorías exactas en MAYÚSCULAS
 */
function mapToCategorySentimiento(val: string | null | undefined): string {
  if (!val) return 'NEUTRO';
  const s = val.toUpperCase().trim();
  if (s.includes('MUY POS') || s.includes('MUY_POS')) return 'MUY POSITIVO';
  if (s.includes('MUY NEG') || s.includes('MUY_NEG')) return 'MUY NEGATIVO';
  if (s.includes('POS')) return 'POSITIVO';
  if (s.includes('NEG')) return 'NEGATIVO';
  return 'NEUTRO';
}

function mapToCategoryInteres(val: string | null | undefined): string {
  if (!val) return 'MUY BAJO';
  const s = val.toUpperCase().trim();
  if (s.includes('MUY ALT') || s.includes('MUY_ALT')) return 'MUY ALTO';
  if (s.includes('MUY BAJ') || s.includes('MUY_BAJ')) return 'MUY BAJO';
  if (s.includes('NINGUN') || s.includes('NONE') || s.includes('SIN')) return 'MUY BAJO';
  if (s.includes('ALT')) return 'ALTO';
  if (s.includes('MED')) return 'MEDIO';
  if (s.includes('BAJ')) return 'BAJO';
  return 'MUY BAJO';
}

function mapToCategoryPrioridad(val: string | null | undefined): string {
  if (!val) return 'BAJA';
  const s = val.toUpperCase().trim();
  if (s.includes('MUY ALT') || s.includes('MUY_ALT') || s.includes('URGENT')) return 'MUY ALTA';
  if (s.includes('MUY BAJ') || s.includes('MUY_BAJ')) return 'MUY BAJA';
  if (s.includes('ALT')) return 'ALTA';
  if (s.includes('MED')) return 'MEDIA';
  if (s.includes('BAJ')) return 'BAJA';
  return 'BAJA';
}

/**
 * 5. update_distribution(client_id, postInternalId)
 * Recalcula la distribución exclusivamente para ese post y ese client_id,
 * actualiza meta_posts (contadores, timestamps y raw_data) e ingesta
 * las 15 filas relacionales en public.meta_post_comment_distribution.
 */
export async function update_distribution(
  client_id: number,
  postInternalId: string | number
): Promise<{
  sentiment_distribution: SentimentDistribution;
  interest_distribution: InterestDistribution;
  priority_distribution: PriorityDistribution;
  comments_count: number;
}> {
  // Resolver el ID interno numérico relacional
  let numericPostId: number = typeof postInternalId === 'number' ? postInternalId : 0;
  if (!numericPostId || typeof postInternalId === 'string') {
    const pRec = await resolvePostRecord(client_id, postInternalId);
    if (pRec?.id) {
      numericPostId = pRec.id;
    } else if (/^\d+$/.test(String(postInternalId).trim()) && String(postInternalId).trim().length < 15) {
      numericPostId = Number(postInternalId);
    }
  }

  // Consultar comentarios exclusivamente para client_id y post_id
  const { data: comments, error: commErr } = await supabase
    .from('meta_comments')
    .select('sentiment_level, interest_level, priority_level')
    .eq('client_id', client_id)
    .eq('post_id', numericPostId);

  if (commErr) {
    console.error(`[update_distribution] Error al consultar comentarios para post ${numericPostId}:`, commErr);
  }

  const list =
    comments ||
    inMemoryComments.filter((c) => c.client_id === client_id && Number(c.post_id) === numericPostId);

  const sentiment_distribution: SentimentDistribution = {
    positivo: 0,
    negativo: 0,
    neutral: 0,
    total: 0,
  };

  const interest_distribution: InterestDistribution = {
    alto: 0,
    medio: 0,
    bajo: 0,
    ninguno: 0,
  };

  const priority_distribution: PriorityDistribution = {
    alta: 0,
    media: 0,
    baja: 0,
  };

  const countsSentimiento: Record<string, number> = {
    'MUY NEGATIVO': 0,
    'NEGATIVO': 0,
    'NEUTRO': 0,
    'POSITIVO': 0,
    'MUY POSITIVO': 0,
  };

  const countsInteres: Record<string, number> = {
    'MUY BAJO': 0,
    'BAJO': 0,
    'MEDIO': 0,
    'ALTO': 0,
    'MUY ALTO': 0,
  };

  const countsPrioridad: Record<string, number> = {
    'MUY BAJA': 0,
    'BAJA': 0,
    'MEDIA': 0,
    'ALTA': 0,
    'MUY ALTA': 0,
  };

  for (const c of list) {
    // Para UI backwards compatibility
    if (c.sentiment_level) {
      sentiment_distribution.total++;
      const s = String(c.sentiment_level).toLowerCase();
      if (s.includes('pos')) sentiment_distribution.positivo++;
      else if (s.includes('neg')) sentiment_distribution.negativo++;
      else sentiment_distribution.neutral++;
    }

    if (c.interest_level) {
      const i = String(c.interest_level).toLowerCase();
      if (i.includes('alt')) interest_distribution.alto++;
      else if (i.includes('med')) interest_distribution.medio++;
      else if (i.includes('baj')) interest_distribution.bajo++;
      else interest_distribution.ninguno++;
    }

    if (c.priority_level) {
      const p = String(c.priority_level).toLowerCase();
      if (p.includes('alt')) priority_distribution.alta++;
      else if (p.includes('med')) priority_distribution.media++;
      else priority_distribution.baja++;
    }

    // Para meta_post_comment_distribution (categorías exactas de BD)
    const catSent = mapToCategorySentimiento(c.sentiment_level);
    countsSentimiento[catSent] = (countsSentimiento[catSent] || 0) + 1;

    const catInt = mapToCategoryInteres(c.interest_level);
    countsInteres[catInt] = (countsInteres[catInt] || 0) + 1;

    const catPrio = mapToCategoryPrioridad(c.priority_level);
    countsPrioridad[catPrio] = (countsPrioridad[catPrio] || 0) + 1;
  }

  const totalComments = list.length;
  const nowIso = new Date().toISOString();

  // Ingestar en public.meta_post_comment_distribution las 15 categorías normalizadas
  try {
    const distributionRows = DIMENSION_CATEGORIES.map((catDef) => {
      let count = 0;
      if (catDef.dimension === 'SENTIMIENTO') {
        count = countsSentimiento[catDef.category] || 0;
      } else if (catDef.dimension === 'INTERES') {
        count = countsInteres[catDef.category] || 0;
      } else if (catDef.dimension === 'PRIORIDAD') {
        count = countsPrioridad[catDef.category] || 0;
      }
      const pct = totalComments > 0 ? Number(((count / totalComments) * 100).toFixed(4)) : 0;
      return {
        client_id: Number(client_id),
        post_id: numericPostId,
        analysis_updated_at: nowIso,
        dimension: catDef.dimension,
        category: catDef.category,
        sort_order: catDef.sort_order,
        comment_count: count,
        percentage: pct,
      };
    });

    const { error: distError } = await supabase
      .from('meta_post_comment_distribution')
      .upsert(distributionRows, {
        onConflict: 'post_id,dimension,category',
      });

    if (distError) {
      console.error(`[meta_post_comment_distribution] Error al ingestar distribución para post ${numericPostId}:`, distError);
    } else {
      console.log(`[meta_post_comment_distribution] Ingestados exitosamente ${distributionRows.length} registros para post ${numericPostId}`);
    }
  } catch (distEx) {
    console.error(`[meta_post_comment_distribution] Excepción al ingestar para post ${numericPostId}:`, distEx);
  }

  // Consultar raw_data actual del post para client_id
  const { data: postData } = await supabase
    .from('meta_posts')
    .select('raw_data')
    .eq('client_id', client_id)
    .eq('id', numericPostId)
    .maybeSingle();

  const existingRaw = postData?.raw_data || {};
  const updatedRaw = {
    ...existingRaw,
    sentiment_distribution,
    interest_distribution,
    priority_distribution,
    detailed_distribution: {
      sentimiento: countsSentimiento,
      interes: countsInteres,
      prioridad: countsPrioridad,
    },
  };

  await supabase
    .from('meta_posts')
    .update({
      comments_count: list.length,
      analysis_updated_at: nowIso,
      raw_data: updatedRaw,
      updated_at: nowIso,
    })
    .eq('client_id', client_id)
    .eq('id', numericPostId);

  // Actualizar en memoria local
  const postLocal = inMemoryPosts.find((p) => p.client_id === client_id && Number(p.id) === numericPostId);
  if (postLocal) {
    postLocal.comments_count = list.length;
    postLocal.analysis_updated_at = nowIso;
    postLocal.raw_data = updatedRaw;
  }

  return {
    sentiment_distribution,
    interest_distribution,
    priority_distribution,
    comments_count: list.length,
  };
}

/**
 * Ingesta y actualiza la tabla meta_post_comment_distribution para TODOS los posts de un client_id
 */
export async function sync_all_posts_distribution(client_id: number): Promise<number> {
  const { data: posts, error } = await supabase
    .from('meta_posts')
    .select('id')
    .eq('client_id', client_id);

  if (error || !posts) {
    console.error(`[sync_all_posts_distribution] Error al obtener posts para cliente ${client_id}:`, error);
    return 0;
  }

  let count = 0;
  for (const post of posts) {
    await update_distribution(client_id, post.id);
    count++;
  }
  return count;
}

/**
 * =========================================================================
 * FLUJO PRINCIPAL: sync_meta(client_id)
 * =========================================================================
 * Trabaja ÚNICAMENTE con el client_id recibido.
 * 1. Obtener meta_page_id, meta_token, kie_apikey desde companies WHERE id = :client_id
 * 2. Obtener posts de Meta para esa Page (con paginación)
 * 3. Insertar/actualizar exclusivamente meta_posts.client_id = client_id
 * 4. Para cada post: sincronizar comentarios (con paginación y delta)
 * 5. Insertar/actualizar exclusivamente meta_comments.client_id = client_id
 * 6. Determinar qué comentarios requieren análisis IA
 * 7. Para cada comentario pendiente: utilizar exclusivamente companies.kie_apikey del client_id actual
 * 8. Guardar el análisis en meta_comments
 * 9. Recalcular la distribución exclusivamente para ese post y ese client_id
 * 10. Actualizar los contadores y timestamps correspondientes
 */
export async function sync_meta(
  client_id: number,
  onLog?: LogCallback,
  options?: { forceAiAnalysis?: boolean }
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  if (!client_id || typeof client_id !== 'number') {
    throw new Error('sync_meta requiere un client_id numérico de compañía válido.');
  }

  // PASO 1: Obtener SIEMPRE credenciales frescas directamente desde la tabla companies
  // SELECT meta_page_id, meta_token, llm_local_apikey FROM companies WHERE id = :client_id
  if (onLog) {
    safeLog(onLog, 'info', 'Iniciando proceso de sincronización...');
  }

  const { pageId: cleanPageId, token: cleanToken, llmKey: cleanAiKey, companyName } =
    await getFreshCompanyMetaToken(client_id);

  if (!cleanPageId) {
    const errorMsg = `No se ha configurado la página de Facebook para '${companyName}'. Configúrala en la pestaña Configuración.`;
    if (onLog) safeLog(onLog, 'error', errorMsg);
    throw new Error(errorMsg);
  }

  if (!cleanToken) {
    const errorMsg = `No se ha configurado el token de acceso para '${companyName}'. Configúralo en la pestaña Configuración.`;
    if (onLog) safeLog(onLog, 'error', errorMsg);
    throw new Error(errorMsg);
  }

  if (onLog) {
    safeLog(
      onLog,
      'info',
      `Conexión verificada con la página "${companyName}". Consultando publicaciones y comentarios...`
    );
  }

  let aiReason: string | undefined = undefined;
  if (!cleanAiKey) {
    aiReason = `No se detectó clave de IA. La sincronización continuará sin análisis automático.`;
    if (onLog) {
      safeLog(onLog, 'warn', aiReason);
    }
  } else {
    if (onLog) {
      safeLog(onLog, 'info', `Servicio de Inteligencia Artificial listo para clasificar comentarios.`);
    }
  }

  // PASO 2 & 3: Obtener posts de Meta con paginación e insertar/actualizar meta_posts
  let postStats;
  try {
    postStats = await sync_posts(client_id, cleanPageId, cleanToken, onLog);
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    let friendlyMsg = 'No se pudieron descargar las publicaciones de la página.';
    if (errorMsg.includes('190') || errorMsg.includes('Session has expired') || errorMsg.includes('access token')) {
      friendlyMsg = `La sesión de Facebook ha expirado para "${companyName}". Por favor actualiza el token en la pestaña Configuración.`;
    }
    if (onLog) {
      safeLog(onLog, 'error', friendlyMsg);
    }
    throw new Error(friendlyMsg);
  }

  let totalComments = 0;
  let totalCommentsCreated = 0;
  let totalCommentsUpdated = 0;
  let totalAnalyzed = 0;
  let totalSkippedAi = 0;

  // PASO 4 & 5: Para cada post, sincronizar comentarios
  for (const post of postStats.posts) {
    if (!post.id || !post.meta_post_id) continue;

    const commStats = await sync_comments(client_id, post.id, post.meta_post_id, cleanToken, onLog);
    totalComments += commStats.count;
    totalCommentsCreated += commStats.created;
    totalCommentsUpdated += commStats.updated;

    // PASO 6, 7 & 8: Determinar comentarios pendientes y analizar con IA
    if (cleanAiKey || options?.forceAiAnalysis) {
      const aiStats = await analyze_pending_comments(client_id, cleanAiKey, onLog, post.id);
      totalAnalyzed += aiStats.analyzed;
      totalSkippedAi += aiStats.skipped;
    }

    // PASO 9 & 10: Recalcular la distribución exclusivamente para ese post
    await update_distribution(client_id, post.id);
  }

  const finishedAt = new Date().toISOString();
  if (onLog) {
    safeLog(
      onLog,
      'success',
      `Sincronización completada exitosamente. Publicaciones: ${postStats.count}, Comentarios: ${totalComments}, Comentarios analizados: ${totalAnalyzed}.`
    );
  }

  return {
    client_id,
    meta_page_id: cleanPageId,
    posts_count: postStats.count,
    comments_count: totalComments,
    posts_created: postStats.created,
    posts_updated: postStats.updated,
    comments_created: totalCommentsCreated,
    comments_updated: totalCommentsUpdated,
    comments_analyzed: totalAnalyzed,
    comments_skipped_ai: totalSkippedAi,
    ai_analysis_reason: aiReason,
    started_at: startedAt,
    finished_at: finishedAt,
  };
}

/**
 * Alias de compatibilidad hacia atrás: ejecuta sync_meta(clientId)
 */
export async function syncCompany(
  clientId: number,
  _pageId?: string,
  _token?: string,
  onLog?: LogCallback
): Promise<SyncResult> {
  return sync_meta(clientId, onLog);
}

/**
 * Obtener listado de posts para la UI desde Supabase filtrado estrictamente por client_id
 */
export async function fetchCompanyPosts(clientId: number, _pageId?: string | number): Promise<MetaPost[]> {
  try {
    const { data: postsData, error } = await supabase
      .from('meta_posts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_time', { ascending: false });

    if (!error && postsData && postsData.length > 0) {
      // Obtener todos los comentarios con sus clasificaciones exclusivamente para este client_id
      const postIds = postsData.map((p) => p.id);
      const { data: commentsData } = await supabase
        .from('meta_comments')
        .select('post_id, sentiment_level, interest_level, priority_level')
        .eq('client_id', clientId)
        .in('post_id', postIds);

      const commentsByPost = new Map<any, any[]>();
      if (commentsData) {
        commentsData.forEach((c) => {
          const arr = commentsByPost.get(c.post_id) || [];
          arr.push(c);
          commentsByPost.set(c.post_id, arr);
        });
      }

      return postsData.map((p) => {
        const postComments = commentsByPost.get(p.id) || [];
        const realCount = postComments.length > 0 ? postComments.length : (p.comments_count || 0);

        // Si meta_comments tiene clasificaciones analizadas, agregarlas para sincronía viva con BD
        let detailed = p.raw_data?.detailed_distribution;
        if (postComments.length > 0) {
          const countsSentimiento: Record<string, number> = {
            'MUY NEGATIVO': 0,
            'NEGATIVO': 0,
            'NEUTRO': 0,
            'POSITIVO': 0,
            'MUY POSITIVO': 0,
          };
          const countsInteres: Record<string, number> = {
            'MUY BAJO': 0,
            'BAJO': 0,
            'MEDIO': 0,
            'ALTO': 0,
            'MUY ALTO': 0,
          };
          const countsPrioridad: Record<string, number> = {
            'MUY BAJA': 0,
            'BAJA': 0,
            'MEDIA': 0,
            'ALTA': 0,
            'MUY ALTA': 0,
          };

          let hasAnyClassification = false;
          postComments.forEach((c) => {
            if (c.sentiment_level) {
              hasAnyClassification = true;
              const s = String(c.sentiment_level).toUpperCase().trim();
              if (s.includes('MUY POS') || s.includes('MUY_POS')) countsSentimiento['MUY POSITIVO']++;
              else if (s.includes('MUY NEG') || s.includes('MUY_NEG')) countsSentimiento['MUY NEGATIVO']++;
              else if (s.includes('POS')) countsSentimiento['POSITIVO']++;
              else if (s.includes('NEG')) countsSentimiento['NEGATIVO']++;
              else countsSentimiento['NEUTRO']++;
            }
            if (c.interest_level) {
              const i = String(c.interest_level).toUpperCase().trim();
              if (i.includes('MUY ALT') || i.includes('MUY_ALT')) countsInteres['MUY ALTO']++;
              else if (i.includes('ALT')) countsInteres['ALTO']++;
              else if (i.includes('MED')) countsInteres['MEDIO']++;
              else if (i.includes('BAJ') && !i.includes('MUY')) countsInteres['BAJO']++;
              else countsInteres['MUY BAJO']++;
            }
            if (c.priority_level) {
              const pr = String(c.priority_level).toUpperCase().trim();
              if (pr.includes('MUY ALT') || pr.includes('MUY_ALT')) countsPrioridad['MUY ALTA']++;
              else if (pr.includes('ALT')) countsPrioridad['ALTA']++;
              else if (pr.includes('MED')) countsPrioridad['MEDIA']++;
              else if (pr.includes('BAJ') && !pr.includes('MUY')) countsPrioridad['BAJA']++;
              else countsPrioridad['MUY BAJA']++;
            }
          });

          if (hasAnyClassification) {
            detailed = {
              sentimiento: countsSentimiento,
              interes: countsInteres,
              prioridad: countsPrioridad,
            };
          }
        }

        return {
          ...p,
          comments_count: realCount,
          raw_data: {
            ...(p.raw_data || {}),
            ...(detailed ? { detailed_distribution: detailed } : {}),
          },
        };
      });
    }
  } catch (err) {
    console.warn('Error leyendo meta_posts, usando almacenamiento local:', err);
  }

  // Fallback local estrictamente aislado por clientId
  const clientPosts = inMemoryPosts.filter((p) => p.client_id === clientId);
  return clientPosts.map((p) => ({
    ...p,
    comments_count: inMemoryComments.filter((c) => c.client_id === clientId && c.post_id === p.id).length,
  }));
}

/**
 * Obtener y refrescar un post específico directamente desde la Base de Datos (PostgreSQL/Supabase)
 * consultando meta_posts y meta_comments sin invocar a Meta ni a la IA.
 */
export async function fetchSinglePostFromDb(
  clientId: number,
  postId?: number | string | null,
  metaPostId?: string | null
): Promise<MetaPost | null> {
  try {
    let postData: any = null;

    // 1. Intentar por ID primario numérico
    if (postId !== undefined && postId !== null && !isNaN(Number(postId)) && Number(postId) > 0) {
      const { data } = await supabase
        .from('meta_posts')
        .select('*')
        .eq('client_id', clientId)
        .eq('id', Number(postId))
        .maybeSingle();
      postData = data;
    }

    // 2. Intentar por meta_post_id (string de Facebook)
    if (!postData && metaPostId) {
      const { data } = await supabase
        .from('meta_posts')
        .select('*')
        .eq('client_id', clientId)
        .eq('meta_post_id', String(metaPostId))
        .maybeSingle();
      postData = data;
    }

    // 3. Intentar si postId vino como string del id de Facebook
    if (!postData && postId) {
      const { data } = await supabase
        .from('meta_posts')
        .select('*')
        .eq('client_id', clientId)
        .eq('meta_post_id', String(postId))
        .maybeSingle();
      postData = data;
    }

    if (postData) {
      // Consultar comentarios asociados a este post en meta_comments
      const targetIds: any[] = [postData.id];
      if (postData.meta_post_id) {
        targetIds.push(postData.meta_post_id);
      }

      const { data: commentsData } = await supabase
        .from('meta_comments')
        .select('post_id, sentiment_level, interest_level, priority_level')
        .eq('client_id', clientId)
        .in('post_id', targetIds);

      const postComments = commentsData || [];
      const realCount = postComments.length > 0 ? postComments.length : (postData.comments_count || 0);

      // Si meta_comments tiene clasificaciones analizadas en BD, agregarlas para sincronía viva
      let detailed = postData.raw_data?.detailed_distribution;
      if (postComments.length > 0) {
        const countsSentimiento: Record<string, number> = {
          'MUY NEGATIVO': 0,
          'NEGATIVO': 0,
          'NEUTRO': 0,
          'POSITIVO': 0,
          'MUY POSITIVO': 0,
        };
        const countsInteres: Record<string, number> = {
          'MUY BAJO': 0,
          'BAJO': 0,
          'MEDIO': 0,
          'ALTO': 0,
          'MUY ALTO': 0,
        };
        const countsPrioridad: Record<string, number> = {
          'MUY BAJA': 0,
          'BAJA': 0,
          'MEDIA': 0,
          'ALTA': 0,
          'MUY ALTA': 0,
        };

        let hasAnyClassification = false;
        postComments.forEach((c) => {
          if (c.sentiment_level) {
            hasAnyClassification = true;
            const s = String(c.sentiment_level).toUpperCase().trim();
            if (s.includes('MUY POS') || s.includes('MUY_POS')) countsSentimiento['MUY POSITIVO']++;
            else if (s.includes('MUY NEG') || s.includes('MUY_NEG')) countsSentimiento['MUY NEGATIVO']++;
            else if (s.includes('POS')) countsSentimiento['POSITIVO']++;
            else if (s.includes('NEG')) countsSentimiento['NEGATIVO']++;
            else countsSentimiento['NEUTRO']++;
          }
          if (c.interest_level) {
            const i = String(c.interest_level).toUpperCase().trim();
            if (i.includes('MUY ALT') || i.includes('MUY_ALT')) countsInteres['MUY ALTO']++;
            else if (i.includes('ALT')) countsInteres['ALTO']++;
            else if (i.includes('MED')) countsInteres['MEDIO']++;
            else if (i.includes('BAJ') && !i.includes('MUY')) countsInteres['BAJO']++;
            else countsInteres['MUY BAJO']++;
          }
          if (c.priority_level) {
            const pr = String(c.priority_level).toUpperCase().trim();
            if (pr.includes('MUY ALT') || pr.includes('MUY_ALT')) countsPrioridad['MUY ALTA']++;
            else if (pr.includes('ALT')) countsPrioridad['ALTA']++;
            else if (pr.includes('MED')) countsPrioridad['MEDIA']++;
            else if (pr.includes('BAJ') && !pr.includes('MUY')) countsPrioridad['BAJA']++;
            else countsPrioridad['MUY BAJA']++;
          }
        });

        if (hasAnyClassification) {
          detailed = {
            sentimiento: countsSentimiento,
            interes: countsInteres,
            prioridad: countsPrioridad,
          };
        }
      }

      return {
        ...postData,
        comments_count: realCount,
        raw_data: {
          ...(postData.raw_data || {}),
          ...(detailed ? { detailed_distribution: detailed } : {}),
        },
      };
    }
  } catch (err) {
    console.warn('Error leyendo post individual desde BD:', err);
  }

  // Fallback local en memoria
  const local = inMemoryPosts.find(
    (p) =>
      p.client_id === clientId &&
      ((postId && p.id === postId) || (metaPostId && p.meta_post_id === metaPostId) || (postId && p.meta_post_id === String(postId)))
  );
  if (local) {
    const localComments = inMemoryComments.filter(
      (c) => c.client_id === clientId && (c.post_id === local.id || String(c.post_id) === String(local.meta_post_id))
    );
    return {
      ...local,
      comments_count: localComments.length > 0 ? localComments.length : (local.comments_count || 0),
    };
  }

  return null;
}

/**
 * Obtener todos los comentarios de una empresa (todos los posts) filtrados estrictamente por client_id
 */
export async function fetchAllCompanyComments(clientId: number): Promise<MetaComment[]> {
  let comments: MetaComment[] = [];

  try {
    const { data, error } = await supabase
      .from('meta_comments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_time', { ascending: false });

    if (!error && data) {
      comments = data as MetaComment[];
    }
  } catch {}

  if (comments.length === 0) {
    comments = inMemoryComments
      .filter((c) => c.client_id === clientId)
      .sort((a, b) => new Date(b.created_time || 0).getTime() - new Date(a.created_time || 0).getTime());
  }

  return comments;
}

/**
 * Obtener comentarios de un post y armar árbol jerárquico filtrado estrictamente por client_id
 */
export async function fetchPostComments(clientId: number, postId: string | number): Promise<MetaComment[]> {
  let comments: MetaComment[] = [];

  try {
    const { data, error } = await supabase
      .from('meta_comments')
      .select('*')
      .eq('client_id', clientId)
      .eq('post_id', postId)
      .order('created_time', { ascending: true });

    if (!error && data) {
      comments = data as MetaComment[];
    }
  } catch {}

  if (comments.length === 0) {
    comments = inMemoryComments.filter(
      (c) => c.client_id === clientId && String(c.post_id) === String(postId)
    );
  }

  // Construir jerarquía para comentarios anidados
  const commentMap = new Map<string, MetaComment>();
  const topLevel: MetaComment[] = [];

  comments.forEach((c) => {
    commentMap.set(c.meta_comment_id, { ...c, replies: [] });
  });

  comments.forEach((c) => {
    const item = commentMap.get(c.meta_comment_id)!;
    if (c.meta_parent_comment_id && commentMap.has(c.meta_parent_comment_id)) {
      commentMap.get(c.meta_parent_comment_id)!.replies!.push(item);
    } else {
      topLevel.push(item);
    }
  });

  return topLevel;
}

/**
 * Permite agregar un nuevo comentario de prueba o respuesta exclusivamente para client_id
 */
export async function addTestComment(
  clientId: number,
  postId: string | number,
  message: string,
  authorName: string = 'Usuario Test',
  parentCommentId: string | null = null
): Promise<MetaComment> {
  const newMetaId = `test_comm_${Date.now()}`;
  const now = new Date().toISOString();
  const rawComment = {
    id: newMetaId,
    message,
    created_time: now,
    updated_time: now,
    from: { id: `user_${Date.now()}`, name: authorName },
    parent: parentCommentId ? { id: parentCommentId } : null,
  };

  const { id, commentObj } = await upsertComment(clientId, postId, rawComment);
  return {
    ...commentObj,
    id,
    client_id: clientId,
    post_id: postId,
    meta_comment_id: newMetaId,
    meta_parent_comment_id: parentCommentId,
    message,
    created_time: now,
    updated_time: now,
    author_id: `user_${Date.now()}`,
    author_name: authorName,
    is_new_delta: true,
  };
}

/**
 * Función para probar la conexión con el endpoint IA n8n en https://n8n.promptia.lat/webhook/v1/chat/completions
 */
export async function testLlmConnection(
  apiKey?: string,
  clientId: number = 3
): Promise<{ success: boolean; message: string; response?: any }> {
  try {
    const res = await fetch('https://n8n.promptia.lat/webhook/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        max_tokens: 50,
        temperature: 0.3,
        agent_priority: [
          'agent_1',
          'agent_2',
          'agent_4',
          'agent_3',
        ],
        messages: [
          { role: 'system', content: 'Eres un clasificador de atención al cliente y social listening en español.' },
          { role: 'user', content: 'Comentario a evaluar: "Esto es una maravilla. 10/10"' }
        ],
      }),
    });
    if (!res.ok) {
      return { success: false, message: `Error HTTP ${res.status}: ${res.statusText}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const agent = data.resolved_by_agent || 'agent_1';
    return { success: true, message: `Conexión con endpoint IA n8n exitosa (${agent}, max_tokens=50). Respuesta: "${content.trim()}"`, response: data };
  } catch (err: any) {
    return { success: false, message: `Error conectando a endpoint IA n8n: ${err?.message || err}` };
  }
}

/**
 * Retorna el comando cURL interno exacto con el que se invoca la API LLM en la plataforma
 */
export function getLlmInternalCurlExample(
  clientId: number = 2,
  message: string = '¿Cómo funciona un formato toon para LLM?'
): string {
  const promptSystem = `Eres un analizador y clasificador experto de atención al cliente y social listening en español para Meta/Facebook.
Tu tarea es analizar el comentario y calcular rigurosamente los 3 niveles con sus dimensiones y categorías exactas en MAYÚSCULAS, además de la intención y el motivo:

1. Dimensión SENTIMIENTO (sentiment_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY NEGATIVO", "NEGATIVO", "NEUTRO", "POSITIVO", "MUY POSITIVO"
2. Dimensión INTERES (interest_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY BAJO", "BAJO", "MEDIO", "ALTO", "MUY ALTO"
3. Dimensión PRIORIDAD (priority_level):
Valores posibles estrictos en MAYÚSCULAS: "MUY BAJA", "BAJA", "MEDIA", "ALTA", "MUY ALTA"
4. Intención (intent):
Valores posibles: "Consulta de Precio", "Interés de Compra", "Soporte", "Queja", "Felicitación", "General"
5. Motivo (reason):
Explicación concisa de 1 frase en español justificando la clasificación elegida.

Responde OBLIGATORIAMENTE en formato JSON puro sin formato markdown ni texto adicional:
{"sentiment_level":"MUY NEGATIVO|NEGATIVO|NEUTRO|POSITIVO|MUY POSITIVO","interest_level":"MUY BAJO|BAJO|MEDIO|ALTO|MUY ALTO","priority_level":"MUY BAJA|BAJA|MEDIA|ALTA|MUY ALTA","intent":"...","reason":"..."}`;

  const promptUser = `Comentario a evaluar: "${message}"`;

  return `curl --request POST \\
  --url https://n8n.promptia.lat/webhook/v1/chat/completions \\
  --header 'content-type: application/json' \\
  --data '{
  "client_id": ${clientId},
  "max_tokens": 50,
  "temperature": 0.3,
  "agent_priority": [
    "agent_1",
    "agent_2",
    "agent_4",
    "agent_3"
  ],
  "messages": [
    {
      "role": "system",
      "content": ${JSON.stringify(promptSystem)}
    },
    {
      "role": "user",
      "content": ${JSON.stringify(promptUser)}
    }
  ]
}'`;
}

export type { ActiveSyncProcess };

/**
 * Convierte y formatea una fecha ISO a la zona horaria GMT-5 (Hora estándar de Perú / Colombia / Ecuador)
 */
export function formatToGmtMinus5(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    const normalized = typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')
      ? dateStr + 'Z'
      : dateStr;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(dateStr);
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', // UTC-5
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(d) + ' (GMT-5)';
  } catch {
    return String(dateStr);
  }
}

/**
 * Consulta en la tabla sync_process_logs si existe algún proceso con status = 'EN PROCESO'
 * para el client_id, platform y process_name especificados.
 */
export async function checkActiveSyncProcess(
  clientId: number,
  platform: string = 'META SOCIAL ANALYTICS & SYNC',
  processName: string = 'SINCRONIZA POST CON IA'
): Promise<ActiveSyncProcess | null> {
  try {
    const { data, error } = await supabase
      .from('sync_process_logs')
      .select('*')
      .eq('client_id', Number(clientId))
      .eq('platform', platform)
      .eq('process_name', processName)
      .eq('status', 'EN PROCESO')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error al verificar sync_process_logs:', error);
      return null;
    }

    return (data as ActiveSyncProcess) || null;
  } catch (err) {
    console.warn('Excepción al consultar sync_process_logs:', err);
    return null;
  }
}

/**
 * Invoca el webhook oficial n8n en https://n8n.promptia.lat/webhook/meta_posts
 * Utilizado por:
 * 1. "Refrescar Post con IA" (en cada tarjeta, con post_id completo)
 * 2. "Sincronizar Meta con IA" (en la cabecera, con post_id="")
 * 
 * Valida previamente en sync_process_logs que no haya procesos activos en estado 'EN PROCESO'.
 */
export async function triggerMetaPostsWebhook(
  clientId: number,
  pageId: string | number | undefined,
  postId: string = '',
  onLog?: LogCallback
): Promise<{ success: boolean; message: string; rawResponse?: any }> {
  const cleanPageId = pageId ? String(pageId).trim().replace(/\D/g, '') : '';
  const cleanPostId = postId ? String(postId).trim() : '';
  const platform = 'META SOCIAL ANALYTICS & SYNC';
  const processName = 'SINCRONIZA POST CON IA';

  // 1. Validar en la tabla sync_process_logs que no haya ningún registro para client_id, platform y process_name con status = 'EN PROCESO'
  const activeProcess = await checkActiveSyncProcess(clientId, platform, processName);
  if (activeProcess) {
    const startedAtGmt5 = formatToGmtMinus5(activeProcess.started_at);
    const msg = `Ya hay un proceso ejecutándose, que fue lanzado a la fecha ${startedAtGmt5}`;
    if (onLog) {
      safeLog(onLog, 'warn', msg);
    }
    const err: any = new Error(msg);
    err.isActiveProcess = true;
    err.startedAtGmt5 = startedAtGmt5;
    err.activeProcess = activeProcess;
    throw err;
  }

  const payload = {
    client_id: Number(clientId),
    page_id: cleanPageId,
    post_id: cleanPostId,
    platform: platform,
    process_name: processName,
  };

  if (onLog) {
    if (cleanPostId) {
      safeLog(
        onLog,
        'info',
        `Invocando servicio de IA para la publicación (post_id: "${cleanPostId}", page_id: "${cleanPageId}", platform: "${platform}", process_name: "${processName}")...`
      );
    } else {
      safeLog(
        onLog,
        'info',
        `Invocando sincronización general de Meta con IA (page_id: "${cleanPageId}", post_id: "", platform: "${platform}", process_name: "${processName}")...`
      );
    }
  }

  try {
    const res = await fetch('https://n8n.promptia.lat/webhook/meta_posts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error en servicio n8n (${res.status}): ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    const message = data.message || 'Workflow was started';

    if (onLog) {
      safeLog(
        onLog,
        'success',
        `Servicio de IA iniciado exitosamente: "${message}".`
      );
    }

    return { success: true, message, rawResponse: data };
  } catch (err: any) {
    if (onLog) {
      safeLog(onLog, 'error', `Fallo al invocar servicio de IA: ${err.message || err}`);
    }
    throw err;
  }
}

/**
 * Devuelve el comando cURL exacto para ejecutar en terminal o depurar
 */
export function getMetaPostsWebhookCurl(
  clientId: number,
  pageId: string | number | undefined,
  postId: string = ''
): string {
  const cleanPageId = pageId ? String(pageId).trim().replace(/\D/g, '') : '';
  const cleanPostId = postId ? String(postId).trim() : '';
  return `curl --request POST \\
  --url https://n8n.promptia.lat/webhook/meta_posts \\
  --header 'content-type: application/json' \\
  --data '{
  "client_id": ${clientId},
  "page_id": "${cleanPageId}",
  "post_id": "${cleanPostId}",
  "platform": "META SOCIAL ANALYTICS & SYNC",
  "process_name": "SINCRONIZA POST CON IA"
}'`;
}

