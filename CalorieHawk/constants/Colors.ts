// Colors.ts
const tintColorLight = '#7C4DFF'; //  morado principal
const tintColorDark = '#BB86FC'; // Versión más clara para modo oscuro

// export default {
//   light: {
//     text: '#000000',
//     background: '#FFFFFF',
//     tint: tintColorLight,
//     inputBackground: "#F9F9F9",
//     button: tintColorLight,
//     tabIconDefault: '#ccc',
//     tabIconSelected: tintColorLight,
//     card: '#F8F8F8',  
//   },
//   dark: {
//     text: '#FFFFFF',
//     background: '#121212',
//     tint: tintColorDark,
//     inputBackground: "#1E1E1E",
//     button: tintColorDark,
//     tabIconDefault: '#888',
//     tabIconSelected: tintColorDark,
//     card: '#1E1E1E',
//   },
// };

export type Theme = {
  text: string;
  subtext: string;
  background: string;
  card: string;
  muted: string;
  border: string;
  tint: string;
  inputBackground: string;
  button: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

const Colors: { light: Theme; dark: Theme } = {
  light: {
    text: "#000000",
    subtext: "#6B6A75",
    background: "#FFFFFF",
    card: "#F8F8F8",
    muted: "#F3F4F6",
    border: "#E5E7EB",
    tint: tintColorLight,
    inputBackground: "#F9F9F9",
    button: tintColorLight,
    tabIconDefault: "#ccc",
    tabIconSelected: tintColorLight,
  },

  dark: {
    text: "#FFFFFF",
    subtext: "#9CA3AF",
    background: "#121212",
    card: "#1E1E1E",
    muted: "#2A2A2A",
    border: "#333333",
    tint: tintColorDark,
    inputBackground: "#1E1E1E",
    button: tintColorDark,
    tabIconDefault: "#888",
    tabIconSelected: tintColorDark,
  },
};

export default Colors;