import React, { createContext, useContext, useState, ReactNode } from "react";
import Colors from "../constants/Colors";
import type { Theme } from "../constants/Colors";

type ThemeMode = "light" | "dark";

type ThemeContextType = {
  //theme: typeof Colors.light;
  theme: Theme;
  mode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>("light");

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
  };

  const setThemeMode = (newMode: ThemeMode) => {
    setMode(newMode);
  };

  // elige la paleta de colores según el modo actual
  const theme = Colors[mode];

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
