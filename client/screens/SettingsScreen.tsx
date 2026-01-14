import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

interface NotificationPreferences {
  likes: boolean;
  comments: boolean;
  tips: boolean;
  payments: boolean;
}

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

const defaultNotificationPrefs: NotificationPreferences = {
  likes: true,
  comments: true,
  tips: true,
  payments: true,
};

const notificationOptions: { key: keyof NotificationPreferences; title: string; subtitle: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "likes", title: "Likes", subtitle: "When someone likes your post", icon: "heart" },
  { key: "comments", title: "Comments", subtitle: "When someone comments on your post", icon: "message-circle" },
  { key: "tips", title: "Tips", subtitle: "When someone tips your content", icon: "dollar-sign" },
  { key: "payments", title: "Payments", subtitle: "When someone sends you money", icon: "credit-card" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, mode, setMode } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(
    (user?.notificationPreferences as NotificationPreferences) || defaultNotificationPrefs
  );

  useEffect(() => {
    if (user?.notificationPreferences) {
      setNotificationPrefs(user.notificationPreferences as NotificationPreferences);
    }
  }, [user]);

  const updatePrefsMutation = useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      if (!user?.id) return;
      return apiRequest("PUT", `/api/user/${user.id}`, { notificationPreferences: prefs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user", user?.id] });
    },
  });

  const handleToggleNotification = (key: keyof NotificationPreferences) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPrefs = { ...notificationPrefs, [key]: !notificationPrefs[key] };
    setNotificationPrefs(newPrefs);
    updatePrefsMutation.mutate(newPrefs);
  };

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
          <ThemedText type="h4" style={styles.sectionTitle}>Notifications</ThemedText>
          <ThemedText style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            Control which notifications you receive
          </ThemedText>
          
          <View style={[styles.themeGrid, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            {notificationOptions.map((option, index) => (
              <View
                key={option.key}
                style={[
                  styles.themeOption,
                  index !== notificationOptions.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}
              >
                <View style={[styles.themeIconContainer, { backgroundColor: notificationPrefs[option.key] ? theme.primary : theme.backgroundTertiary }]}>
                  <Feather 
                    name={option.icon} 
                    size={20} 
                    color={notificationPrefs[option.key] ? "#FFFFFF" : theme.textSecondary} 
                  />
                </View>
                <View style={styles.themeTextContainer}>
                  <ThemedText style={[styles.themeTitle, notificationPrefs[option.key] && { color: theme.primary }]}>
                    {option.title}
                  </ThemedText>
                  <ThemedText style={[styles.themeSubtitle, { color: theme.textSecondary }]}>
                    {option.subtitle}
                  </ThemedText>
                </View>
                <Switch
                  value={notificationPrefs[option.key]}
                  onValueChange={() => handleToggleNotification(option.key)}
                  trackColor={{ false: theme.backgroundTertiary, true: theme.primaryLight }}
                  thumbColor={notificationPrefs[option.key] ? theme.primary : theme.textSecondary}
                />
              </View>
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
