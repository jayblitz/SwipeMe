import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, ThemeColors } from "@/constants/theme";

export type ThemeMode = "light" | "dark" | "system" | "energetic";

interface ThemeContextValue {
  theme: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_STORAGE_KEY = "@swipeme_theme_mode";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    loadSavedMode();
  }, []);

  const loadSavedMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedMode && (savedMode === "light" || savedMode === "dark" || savedMode === "system" || savedMode === "energetic")) {
        setModeState(savedMode as ThemeMode);
      }
    } catch (error) {
      console.error("Failed to load theme mode:", error);
    }
  };

  const setMode = async (newMode: ThemeMode) => {
    setModeState(newMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
    } catch (error) {
      console.error("Failed to save theme mode:", error);
    }
  };

  const getTheme = (): ThemeColors => {
    if (mode === "energetic") {
      return Colors.energetic;
    }
    const effectiveScheme = mode === "system" ? systemColorScheme : mode;
    return Colors[effectiveScheme ?? "light"];
  };

  const isDark = mode === "dark" || (mode === "system" && systemColorScheme === "dark");
  const theme = getTheme();

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
