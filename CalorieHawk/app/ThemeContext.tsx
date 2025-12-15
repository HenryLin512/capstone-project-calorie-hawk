// app/ThemeContext.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";
import Colors from "../constants/Colors";

type ThemeMode = "light" | "dark";

type ThemeContextType = {
  theme: typeof Colors.light;
  mode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>("light");

  const toggleTheme = () => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setThemeMode = (mode: ThemeMode) => setMode(mode);

  const theme = Colors[mode];

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context)
    throw new Error("useTheme must be used inside a ThemeProvider");
  return context;
};
