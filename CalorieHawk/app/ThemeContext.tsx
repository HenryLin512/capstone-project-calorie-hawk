import React, { createContext, useState, useContext, ReactNode } from "react";
import { useColorScheme } from "react-native";
import Colors from "../constants/Colors";

type ThemeType = "light" | "dark";

interface ThemeContextProps {
  theme: typeof Colors.light | typeof Colors.dark;
  mode: ThemeType;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps>({
  theme: Colors.light,
  mode: "light",
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeType>(
    systemScheme === "dark" ? "dark" : "light"
  );

  const toggleTheme = () => setMode(mode === "dark" ? "light" : "dark");

  const theme = Colors[mode];

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);