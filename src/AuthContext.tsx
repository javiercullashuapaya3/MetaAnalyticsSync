import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { TenantCompany } from './types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userName: string;
  company: TenantCompany | null;
  companiesList: TenantCompany[];
  loading: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  handleLogin: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleLogout: () => Promise<void>;
  handleSignUp?: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; message: string }>;
  setCompany?: React.Dispatch<React.SetStateAction<TenantCompany | null>>;
  selectCompany?: (companyId: number) => Promise<void>;
  refreshCompanyData?: () => Promise<void>;
  updateCompanyConfig?: (
    metaPageId: string,
    metaToken: string,
    kieApiKey?: string | null,
    llmLocalApiKey?: string | null,
    targetIdParam?: number
  ) => Promise<{ success: boolean; message: string; savedPageId?: string; savedToken?: string; savedKieKey?: string; savedLlmKey?: string }>;
  enterDemoMode?: (demoClientId?: number) => void;
  isDemoMode?: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [company, setCompany] = useState<TenantCompany | null>(null);
  const [companiesList, setCompaniesList] = useState<TenantCompany[]>([]);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Carga todas las empresas de la tabla 'companies'
  const loadAllCompanies = async (): Promise<TenantCompany[]> => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('id', { ascending: true });

      if (!error && data) {
        const formatted: TenantCompany[] = data.map((c: any) => ({
          id: String(c.id),
          client_id: c.id,
          name: c.name || 'Empresa',
          logo: c.logo || '',
          public_client_id: c.public_client_id,
          api_key: c.api_key,
          hubspot_token: c.hubspot_token,
          meta_page_id: c.meta_page_id ? String(c.meta_page_id) : '',
          meta_token: c.meta_token || '',
          kie_apikey: c.kie_apikey || '',
          llm_local_apikey: c.llm_local_apikey || '',
        }));
        setCompaniesList(formatted);
        return formatted;
      }
    } catch (err) {
      console.warn('Error cargando lista de empresas:', err);
    }
    return [];
  };

  // =========================================================================
  // PASO A: RESOLUCIÓN DE EMPRESA Y METADATA DEL USUARIO (Cascada de 6 pasos)
  // =========================================================================
  const fetchUserData = async (user: any) => {
    try {
      // 1. Cargar lista global de empresas en Supabase
      const allCompanies = await loadAllCompanies();

      // 2. Intentar obtener el client_id de los metadatos del token JWT
      let clientId =
        user.user_metadata?.client_id ||
        user.app_metadata?.client_id ||
        user.user_metadata?.clientId ||
        user.app_metadata?.clientId ||
        user.client_id;

      // 3. Consultar tabla 'user_companies' para obtener el nombre del usuario y el client_id
      try {
        const { data: ucData, error: ucErr } = await supabase
          .from('user_companies')
          .select('name, client_id')
          .eq('user_id', user.id);

        if (!ucErr && ucData && ucData.length > 0) {
          setUserName(ucData[0].name || user.email?.split('@')[0] || 'Usuario');
          if (!clientId) clientId = ucData[0].client_id;
        } else {
          setUserName(
            user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'Usuario'
          );
        }
      } catch (e) {
        setUserName(user.email?.split('@')[0] || 'Usuario');
      }

      // 4. Si aún no hay clientId, consultar tabla 'profiles' si existiera
      if (!clientId) {
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('client_id')
            .eq('id', user.id)
            .maybeSingle();

          if (profileData?.client_id) clientId = profileData.client_id;
        } catch {
          // profiles might not exist
        }
      }

      // 5. Verificar si hay una empresa previamente seleccionada en localStorage
      if (!clientId) {
        const storedActiveId = localStorage.getItem('active_company_id');
        if (storedActiveId) {
          clientId = parseInt(storedActiveId, 10);
        }
      }

      // 6. Si aún no hay clientId, por defecto usar 1 (Promptia.lat)
      const targetCompanyId = Number(clientId) || 1;

      // 7. Consultar la tabla 'companies' de Supabase por 'id'
      let companyData: any = null;
      let cErr: any = null;

      const { data: byId, error: errId } = await supabase
        .from('companies')
        .select('*')
        .eq('id', targetCompanyId)
        .maybeSingle();

      companyData = byId;
      cErr = errId;

      if (!cErr && companyData) {
        const logoUrl = companyData.logo || '';
        const savedMetaPageId = companyData.meta_page_id ? String(companyData.meta_page_id) : '';
        const savedMetaToken = companyData.meta_token || '';
        const savedKieKey = companyData.kie_apikey || '';
        const savedLlmKey = companyData.llm_local_apikey || '';

        // Check local storage backup
        const localCached = localStorage.getItem(`meta_config_${targetCompanyId}`);
        const parsedCached = localCached ? JSON.parse(localCached) : null;

        const finalPageId = savedMetaPageId || parsedCached?.meta_page_id || '';
        const finalToken = savedMetaToken || parsedCached?.meta_token || '';
        const finalKieKey = savedKieKey || parsedCached?.kie_apikey || '';
        const finalLlmKey = savedLlmKey || parsedCached?.llm_local_apikey || '';

        setCompany({
          id: String(companyData.id || companyData.client_id || targetCompanyId),
          client_id: Number(companyData.client_id || companyData.id || targetCompanyId),
          name: companyData.name || 'Mi Empresa',
          logo: logoUrl,
          public_client_id: companyData.public_client_id,
          api_key: companyData.api_key,
          hubspot_token: companyData.hubspot_token || '',
          meta_page_id: finalPageId,
          meta_token: finalToken,
          kie_apikey: finalKieKey,
          llm_local_apikey: finalLlmKey,
        });
      } else {
        // Si no se encontró por ID, tomar la primera de la lista o fallback
        const fallbackComp = allCompanies[0];
        if (fallbackComp) {
          setCompany(fallbackComp);
        } else {
          setCompany({
            id: '1',
            client_id: 1,
            name: 'Promptia.lat',
            logo: '',
            meta_page_id: '',
            meta_token: '',
          });
        }
      }
    } catch (err: any) {
      console.error('Error en fetchUserData:', err);
    }
  };

  // Helper para cambiar de empresa activa
  const selectCompany = async (companyId: number) => {
    localStorage.setItem('active_company_id', String(companyId));
    try {
      const { data: companyData, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (!error && companyData) {
        const localCached = localStorage.getItem(`meta_config_${companyId}`);
        const parsedCached = localCached ? JSON.parse(localCached) : null;

        const resolvedPageId = companyData.meta_page_id
          ? String(companyData.meta_page_id)
          : parsedCached?.meta_page_id || '';
        const resolvedToken = companyData.meta_token || parsedCached?.meta_token || '';
        const resolvedKieKey = companyData.kie_apikey || parsedCached?.kie_apikey || '';
        const resolvedLlmKey = companyData.llm_local_apikey || parsedCached?.llm_local_apikey || '';

        setCompany({
          id: String(companyData.id),
          client_id: companyData.id,
          name: companyData.name || 'Mi Empresa',
          logo: companyData.logo || '',
          public_client_id: companyData.public_client_id,
          api_key: companyData.api_key,
          hubspot_token: companyData.hubspot_token || '',
          meta_page_id: resolvedPageId,
          meta_token: resolvedToken,
          kie_apikey: resolvedKieKey,
          llm_local_apikey: resolvedLlmKey,
        });
      }
    } catch (err) {
      console.error('Error al cambiar de empresa:', err);
    }
  };

  // Helper para refrescar datos de la empresa actual
  const refreshCompanyData = async () => {
    if (session?.user) {
      await fetchUserData(session.user);
    } else if (company?.client_id) {
      await selectCompany(company.client_id);
    }
  };

  // =========================================================================
  // GUARDAR Y PERSISTIR CONFIGURACIÓN DE META Y KIE.AI (page_id, meta_token, kie_apikey)
  // Guarda directamente en la tabla 'companies' de Supabase (columna id = client_id)
  // =========================================================================
  const updateCompanyConfig = async (
    metaPageId: string,
    metaToken: string,
    kieApiKey?: string | null,
    llmLocalApiKey?: string | null,
    targetIdParam?: number
  ): Promise<{ success: boolean; message: string; savedPageId?: string; savedToken?: string; savedKieKey?: string; savedLlmKey?: string }> => {
    const targetCompanyId = Number(targetIdParam || company?.client_id || company?.id || 1);

    // 1. Sanitizar el Page ID: en la base de datos la columna meta_page_id es de tipo BIGINT
    const cleanPageId = (metaPageId || '').trim();
    const onlyDigits = cleanPageId.replace(/\D/g, '');
    const pageIdForDb = onlyDigits ? Number(onlyDigits) : null;

    // 2. Sanitizar el Token
    const cleanToken = (metaToken || '').trim();
    const tokenForDb = cleanToken || null;

    // 3. Preparar payload para la tabla 'companies'
    // El nombre de la empresa NO es editable y no se modifica.
    const updatePayload: Record<string, any> = {
      meta_page_id: pageIdForDb,
      meta_token: tokenForDb,
    };

    if (kieApiKey !== undefined) {
      const cleanKieKey = (kieApiKey || '').trim();
      updatePayload.kie_apikey = cleanKieKey || null;
    }

    if (llmLocalApiKey !== undefined) {
      const cleanLlmKey = (llmLocalApiKey || '').trim();
      updatePayload.llm_local_apikey = cleanLlmKey || null;
    }

    try {
      console.log('Guardando en tabla companies para id:', targetCompanyId, updatePayload);

      // Actualizar en la tabla companies filtrando por id (la clave primaria de companies es id)
      const { data: updatedData, error: updateError } = await supabase
        .from('companies')
        .update(updatePayload)
        .eq('id', targetCompanyId)
        .select('*');

      if (updateError) {
        console.error('Error al actualizar tabla companies:', updateError);
        return {
          success: false,
          message: `Error al guardar en tabla companies: ${updateError.message}`,
        };
      }

      if (!updatedData || updatedData.length === 0) {
        return {
          success: false,
          message: `No se encontró la empresa con ID ${targetCompanyId} en la tabla companies.`,
        };
      }

      const savedRow = updatedData[0];
      const verifiedPageId = savedRow.meta_page_id ? String(savedRow.meta_page_id) : onlyDigits;
      const verifiedToken = savedRow.meta_token || cleanToken;
      const verifiedKieKey = savedRow.kie_apikey !== undefined ? savedRow.kie_apikey : (company?.kie_apikey || null);
      const verifiedLlmKey = savedRow.llm_local_apikey !== undefined ? savedRow.llm_local_apikey : (company?.llm_local_apikey || null);

      // Actualizar ID de empresa activa en localStorage
      try {
        localStorage.setItem('active_company_id', String(targetCompanyId));
      } catch (e) {
        console.warn('localStorage active_company_id error:', e);
      }

      // 5. Actualizar estado reactivo de la empresa activa
      setCompany((prev) => {
        const base = prev && Number(prev.client_id) === targetCompanyId ? prev : {
          id: String(targetCompanyId),
          client_id: targetCompanyId,
          name: savedRow.name || 'Mi Empresa',
          logo: savedRow.logo || '',
          public_client_id: savedRow.public_client_id,
          api_key: savedRow.api_key,
          hubspot_token: savedRow.hubspot_token || '',
        };
        return {
          ...base,
          id: String(targetCompanyId),
          client_id: targetCompanyId,
          name: savedRow.name || base.name,
          meta_page_id: verifiedPageId,
          meta_token: verifiedToken,
          kie_apikey: verifiedKieKey,
          llm_local_apikey: verifiedLlmKey,
        };
      });

      // 6. Guardar respaldo en almacenamiento local
      try {
        localStorage.setItem(
          `meta_config_${targetCompanyId}`,
          JSON.stringify({
            meta_page_id: verifiedPageId,
            meta_token: verifiedToken,
            kie_apikey: verifiedKieKey,
            llm_local_apikey: verifiedLlmKey,
            company_name: savedRow.name,
            updated_at: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn('Error en localStorage:', e);
      }

      // Refrescar lista de empresas
      await loadAllCompanies();

      return {
        success: true,
        message: `¡Configuración guardada directamente en la tabla companies (campo meta_token) para ${savedRow.name || `Empresa ${targetCompanyId}`}!`,
        savedPageId: verifiedPageId,
        savedToken: verifiedToken,
        savedKieKey: verifiedKieKey,
        savedLlmKey: verifiedLlmKey,
      };
    } catch (err: any) {
      console.error('Excepción guardando configuración:', err);
      return {
        success: false,
        message: `Excepción al guardar: ${err.message || err}`,
      };
    }
  };

  // =========================================================================
  // PASO B: INICIALIZACIÓN REACTIVA DE SESIÓN
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    // Cargar empresas al inicio
    loadAllCompanies();

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!isMounted) return;
      setSession(currentSession);
      if (currentSession?.user) {
        fetchUserData(currentSession.user);
      } else {
        // Si no hay sesión, inicializar con la empresa 1 (Promptia.lat) de Supabase
        const targetId = Number(localStorage.getItem('active_company_id')) || 1;
        (async () => {
          const { data: cData } = await supabase
            .from('companies')
            .select('*')
            .eq('id', targetId)
            .maybeSingle();

          if (cData && isMounted) {
            setCompany({
              id: String(cData.id || cData.client_id || targetId),
              client_id: Number(cData.client_id || cData.id || targetId),
              name: cData.name || 'Promptia.lat',
              logo: cData.logo || '',
              public_client_id: cData.public_client_id,
              api_key: cData.api_key,
              hubspot_token: cData.hubspot_token || '',
              meta_page_id: cData.meta_page_id ? String(cData.meta_page_id) : '',
              meta_token: cData.meta_token || '',
              kie_apikey: cData.kie_apikey || '',
            });
          }
        })();
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession?.user) {
        fetchUserData(newSession.user);
      } else {
        setCompany(null);
        setUserName('');
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isDemoMode]);

  // =========================================================================
  // PASO C: EJECUTAR EL LOGIN (Submit del Formulario)
  // =========================================================================
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const formData = new FormData(e.currentTarget);
    const email = ((formData.get('email') as string) || '').trim().toLowerCase();
    const password = ((formData.get('password') as string) || '').trim();

    if (!email || !password) {
      setLoginError('Por favor ingresa tu correo y contraseña.');
      setIsLoggingIn(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes('invalid login credentials') ||
          msg.includes('invalid credentials') ||
          msg.includes('user not found')
        ) {
          setLoginError('Usuario o contraseña incorrectos. Por favor verifica tus datos.');
        } else if (msg.includes('email not confirmed')) {
          setLoginError('Tu correo electrónico aún no ha sido confirmado.');
        } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
          setLoginError('Demasiados intentos. Por favor espera unos momentos e intenta de nuevo.');
        } else {
          setLoginError('No fue posible iniciar sesión. Por favor verifica tus credenciales.');
        }
        setIsLoggingIn(false);
      } else if (data?.user) {
        setIsDemoMode(false);
        setIsLoggingIn(false);
      }
    } catch (err: any) {
      console.error('Error en login:', err);
      setLoginError('Error de conexión. Verifica tu conexión a internet o intenta nuevamente.');
      setIsLoggingIn(false);
    }
  };

  // Helper opcional para registro
  const handleSignUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName || email.split('@')[0],
            client_id: 1,
          },
        },
      });

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: 'Usuario registrado con éxito. Puedes iniciar sesión ahora.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Error al registrarse' };
    }
  };

  // Helper para modo demo / visualización rápida con empresa real
  const enterDemoMode = (demoClientId: number = 1) => {
    setIsDemoMode(true);
    setUserName('Javier Analista');
    selectCompany(demoClientId);
  };

  // =========================================================================
  // PASO D: CERRAR SESIÓN
  // =========================================================================
  const handleLogout = async () => {
    setIsDemoMode(false);
    setCompany(null);
    setUserName('');
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        userName,
        company,
        companiesList,
        loading,
        isLoggingIn,
        loginError,
        handleLogin,
        handleLogout,
        handleSignUp,
        setCompany,
        selectCompany,
        refreshCompanyData,
        updateCompanyConfig,
        enterDemoMode,
        isDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  return context;
};
