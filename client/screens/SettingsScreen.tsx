import React from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme, ThemeMode } from "@/hooks/useTheme";

interface ThemeOption {
  mode: ThemeMode;
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
}

const themeOptions: ThemeOption[] = [
  {
    mode: "system",
    title: "System",
    subtitle: "Match device settings",
    icon: "smartphone",
  },
  {
    mode: "light",
    title: "Oceanic Trust",
    subtitle: "Light mode with trust blue",
    icon: "sun",
  },
  {
    mode: "dark",
    title: "Midnight Flow",
    subtitle: "Dark mode for night use",
    icon: "moon",
  },
  {
    mode: "energetic",
    title: "Energetic Wave",
    subtitle: "Vibrant theme for creators",
    icon: "zap",
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, mode, setMode } = useTheme();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>Appearance</ThemedText>
          <ThemedText style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Choose your app theme
          </ThemedText>
          
          <View style={[styles.themeGrid, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            {themeOptions.map((option, index) => (
              <Pressable
                key={option.mode}
                style={[
                  styles.themeOption,
                  mode === option.mode && { backgroundColor: theme.primaryLight },
                  index !== themeOptions.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
                onPress={() => setMode(option.mode)}
              >
                <View style={[styles.themeIconContainer, { backgroundColor: mode === option.mode ? theme.primary : theme.backgroundTertiary }]}>
                  <Feather 
                    name={option.icon} 
                    size={20} 
                    color={mode === option.mode ? "#FFFFFF" : theme.textSecondary} 
                  />
                </View>
                <View style={styles.themeTextContainer}>
                  <ThemedText style={[styles.themeTitle, mode === option.mode && { color: theme.primary }]}>
                    {option.title}
                  </ThemedText>
                  <ThemedText style={[styles.themeSubtitle, { color: theme.textSecondary }]}>
                    {option.subtitle}
                  </ThemedText>
                </View>
                {mode === option.mode ? (
                  <Feather name="check-circle" size={22} color={theme.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>Color Preview</ThemedText>
          <View style={styles.colorPreviewContainer}>
            <View style={styles.colorRow}>
              <View style={[styles.colorSwatch, { backgroundColor: theme.primary }]} />
              <ThemedText style={styles.colorLabel}>Primary</ThemedText>
            </View>
            <View style={styles.colorRow}>
              <View style={[styles.colorSwatch, { backgroundColor: theme.secondary }]} />
              <ThemedText style={styles.colorLabel}>Secondary</ThemedText>
            </View>
            <View style={styles.colorRow}>
              <View style={[styles.colorSwatch, { backgroundColor: theme.success }]} />
              <ThemedText style={styles.colorLabel}>Money/Success</ThemedText>
            </View>
            <View style={styles.colorRow}>
              <View style={[styles.colorSwatch, { backgroundColor: theme.highlight }]} />
              <ThemedText style={styles.colorLabel}>Highlight</ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    marginBottom: Spacing.md,
    fontSize: 14,
  },
  themeGrid: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  themeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  themeSubtitle: {
    fontSize: 13,
  },
  colorPreviewContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  colorRow: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  colorSwatch: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
  },
  colorLabel: {
    fontSize: 12,
  },
});
