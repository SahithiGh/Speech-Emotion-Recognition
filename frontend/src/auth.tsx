import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export interface SavedAnalysis {
  id: string;
  user_id: string;
  created_at: string;
  original_filename: string;
  predicted_emotion: string;
  confidence: number;
  margin: number;
  scores: Record<string, number>;
  transcript: string | null;
  transcript_segments?: Array<{ start: number; end: number; text: string }>;
  consistency_status: string | null;
  consistency_explanation: string | null;
  notes: string[];
  analyzed_seconds: number;
  is_uncertain: boolean;
  model_name?: string;
  model_id?: string;
  feature_version?: number;
  speakers?: Array<any>;
  speaker_count?: number;
  conversation_timeline?: Array<any>;
  emotion_tracks?: Record<string, any>;
  emotion_journey?: Array<any>;
  voice_analysis?: Record<string, any>;
  audio_file_path?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  saveAnalysis: (analysisData: any) => Promise<SavedAnalysis>;
  listAnalyses: () => Promise<SavedAnalysis[]>;
  getAnalysis: (id: string) => Promise<SavedAnalysis>;
  deleteAnalysis: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "ser_auth_token";
const USER_KEY = "ser_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(TOKEN_KEY);
    }
    return null;
  });
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(USER_KEY);
        return cached ? JSON.parse(cached) : null;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!user);

  // Validate session on mount or token change
  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Invalid session");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setUser((prev) => {
            if (
              prev &&
              prev.id === data.user.id &&
              prev.email === data.user.email &&
              prev.full_name === data.user.full_name
            ) {
              return prev;
            }
            return data.user;
          });
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setToken(null);
          setUser(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Login failed");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, fullName: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Registration failed");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network error on logout
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const updateProfile = useCallback(async (fullName: string) => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ full_name: fullName }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Profile update failed");
    }
    setUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }, [token]);

  const deleteAccount = useCallback(async () => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail?.message || "Failed to delete account");
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const saveAnalysis = useCallback(async (analysisData: any): Promise<SavedAnalysis> => {
    if (!token) throw new Error("Please sign in to save your analysis.");
    const res = await fetch("/api/analyses/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(analysisData),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Failed to save analysis");
    }
    return data.analysis;
  }, [token]);

  const listAnalyses = useCallback(async (): Promise<SavedAnalysis[]> => {
    if (!token) return [];
    const res = await fetch("/api/analyses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Failed to load analyses");
    }
    return data.analyses || [];
  }, [token]);

  const getAnalysis = useCallback(async (id: string): Promise<SavedAnalysis> => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`/api/analyses/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail?.message || "Analysis not found");
    }
    return data.analysis;
  }, [token]);

  const deleteAnalysis = useCallback(async (id: string): Promise<void> => {
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(`/api/analyses/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail?.message || "Failed to delete analysis");
    }
  }, [token]);

  const contextValue = useMemo(
    () => ({
      user,
      token,
      loading,
      login,
      register,
      logout,
      updateProfile,
      deleteAccount,
      saveAnalysis,
      listAnalyses,
      getAnalysis,
      deleteAnalysis,
    }),
    [
      user,
      token,
      loading,
      login,
      register,
      logout,
      updateProfile,
      deleteAccount,
      saveAnalysis,
      listAnalyses,
      getAnalysis,
      deleteAnalysis,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
