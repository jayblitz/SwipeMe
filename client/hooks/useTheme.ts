import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/theme";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: typeof Colors.light;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "@swipeme_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadSavedMode();
  }, []);

  const loadSavedMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedMode && (savedMode === "light" || savedMode === "dark" || savedMode === "system")) {
        setModeState(savedMode as ThemeMode);
      }
    } catch (error) {
      console.error("Failed to load theme mode:", error);
    }
    setIsLoaded(true);
  };

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch (error) {
      console.error("Failed to save theme mode:", error);
    }
  };

  const effectiveColorScheme = mode === "system" ? systemColorScheme : mode;
  const isDark = effectiveColorScheme === "dark";
  const theme = Colors[effectiveColorScheme ?? "light"];

  const value: ThemeContextValue = {
    theme,
    isDark,
    mode,
    setMode,
  };

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  
  if (!context) {
    const systemColorScheme = useSystemColorScheme();
    const isDark = systemColorScheme === "dark";
    return {
      theme: Colors[systemColorScheme ?? "light"],
      isDark,
      mode: "system",
      setMode: () => {},
    };
  }
  
  return context;
}
