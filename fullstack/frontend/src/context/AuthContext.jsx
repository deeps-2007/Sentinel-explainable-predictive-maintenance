import { createContext, useContext, useState, useCallback } from "react";
import { api, apiErrorMessage } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("pdm_user");
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (identifier, password) => {
    try {
      const { data } = await api.post("/auth/login", { identifier, password });
      localStorage.setItem("pdm_token", data.token);
      localStorage.setItem("pdm_user", JSON.stringify(data.user));
      setUser(data.user);
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: apiErrorMessage(err, "Login failed.") };
    }
  }, []);

  const signup = useCallback(async (payload) => {
    try {
      const { data } = await api.post("/auth/signup", payload);
      return { success: true, message: data.message };
    } catch (err) {
      return { success: false, message: apiErrorMessage(err, "Signup failed.") };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("pdm_token");
    localStorage.removeItem("pdm_user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
