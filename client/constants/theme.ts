import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#1F2937",
    textSecondary: "#6B7280",
    buttonText: "#FFFFFF",
    tabIconDefault: "#6B7280",
    tabIconSelected: "#0066FF",
    link: "#0066FF",
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#F8F9FA",
    backgroundSecondary: "#F3F4F6",
    backgroundTertiary: "#E5E7EB",
    primary: "#0066FF",
    primaryDark: "#0052CC",
    primaryLight: "#E6F0FF",
    secondary: "#00BFFF",
    secondaryLight: "#E6F9FF",
    border: "#E1E4E8",
    success: "#10B981",
    successLight: "#D1FAE5",
    error: "#EF4444",
    errorLight: "#FEE2E2",
    warning: "#F59E0B",
    warningLight: "#FEF3C7",
    sentMessage: "#0066FF",
    receivedMessage: "#F3F4F6",
    money: "#10B981",
    moneyLight: "#D1FAE5",
    highlight: "#00BFFF",
  },
  dark: {
    text: "#F3F4F6",
    textSecondary: "#9CA3AF",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: "#0066FF",
    link: "#0099CC",
    backgroundRoot: "#1F2937",
    backgroundDefault: "#2A3441",
    backgroundSecondary: "#374151",
    backgroundTertiary: "#4B5563",
    primary: "#0044CC",
    primaryDark: "#003399",
    primaryLight: "#1A3A5C",
    secondary: "#0099CC",
    secondaryLight: "#0D3D4D",
    border: "#4B5563",
    success: "#059669",
    successLight: "#064E3B",
    error: "#F87171",
    errorLight: "#7F1D1D",
    warning: "#FBBF24",
    warningLight: "#78350F",
    sentMessage: "#0044CC",
    receivedMessage: "#374151",
    money: "#059669",
    moneyLight: "#064E3B",
    highlight: "#0099CC",
  },
  energetic: {
    text: "#111827",
    textSecondary: "#4B5563",
    buttonText: "#FFFFFF",
    tabIconDefault: "#6B7280",
    tabIconSelected: "#0066FF",
    link: "#0066FF",
    backgroundRoot: "#FFFFFF",
    backgroundDefault: "#F8FDFF",
    backgroundSecondary: "#F0FDFA",
    backgroundTertiary: "#E6FFFA",
    primary: "#0066FF",
    primaryDark: "#0052CC",
    primaryLight: "#E6F0FF",
    secondary: "#A5F3FC",
    secondaryLight: "#ECFEFF",
    border: "#D1FAE5",
    success: "#34D399",
    successLight: "#D1FAE5",
    error: "#F87171",
    errorLight: "#FEE2E2",
    warning: "#FBBF24",
    warningLight: "#FEF3C7",
    sentMessage: "#0066FF",
    receivedMessage: "#F0FDFA",
    money: "#34D399",
    moneyLight: "#D1FAE5",
    highlight: "#A5F3FC",
  },
};

export type ThemeColors = typeof Colors.light;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 40,
  "3xl": 48,
  "4xl": 56,
  "5xl": 64,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 30,
  "2xl": 40,
  full: 9999,
  avatar: 50,
  messageBubble: 16,
  card: 12,
  button: 8,
};

export const Typography = {
  large: {
    fontSize: 34,
    fontWeight: "700" as const,
  },
  title1: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  title2: {
    fontSize: 22,
    fontWeight: "600" as const,
  },
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    fontWeight: "400" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  fab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 2,
    elevation: 4,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
