import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { clearAllData } from "@/lib/storage";
import { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

interface MenuItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showArrow?: boolean;
  danger?: boolean;
  rightElement?: React.ReactNode;
}

function MenuItem({ icon, title, subtitle, onPress, showArrow = true, danger = false, rightElement }: MenuItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { backgroundColor: pressed && onPress ? theme.backgroundSecondary : "transparent" },
      ]}
      disabled={!onPress}
    >
      <View style={[styles.menuIcon, { backgroundColor: danger ? "rgba(239, 68, 68, 0.1)" : theme.backgroundSecondary }]}>
        <Feather name={icon as any} size={18} color={danger ? theme.error : theme.primary} />
      </View>
      <View style={styles.menuContent}>
        <ThemedText style={[styles.menuTitle, danger && { color: theme.error }]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.menuSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {rightElement || (showArrow && onPress ? (
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      ) : null)}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Sign Out", 
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            await signOut();
          }
        },
      ]
    );
  };

  const handleViewRecoveryPhrase = () => {
    Alert.alert(
      "Recovery Phrase",
      "Your self-custodial wallet recovery phrase would be displayed here securely. Keep it safe and never share it with anyone.",
      [{ text: "OK" }]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and you will lose access to your wallet.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            await signOut();
          }
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <View style={styles.profileHeader}>
          <Avatar avatarId={user?.avatarId || "coral"} size={100} />
          <ThemedText type="h3" style={styles.profileName}>
            {user?.displayName || "User"}
          </ThemedText>
          <ThemedText style={[styles.profileEmail, { color: theme.textSecondary }]}>
            {user?.email}
          </ThemedText>
          {user?.phone ? (
            <ThemedText style={[styles.profilePhone, { color: theme.textSecondary }]}>
              {user.phone}
            </ThemedText>
          ) : null}
        </View>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            ACCOUNT
          </ThemedText>
          <MenuItem
            icon="key"
            title="Recovery Phrase"
            subtitle="View your wallet backup"
            onPress={handleViewRecoveryPhrase}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="smartphone"
            title="Biometric Authentication"
            subtitle={biometricsEnabled ? "Face ID / Touch ID enabled" : "Disabled"}
            showArrow={false}
            rightElement={
              <Switch
                value={biometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: theme.backgroundTertiary, true: theme.primary }}
              />
            }
          />
        </Card>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            PREFERENCES
          </ThemedText>
          <MenuItem
            icon="bell"
            title="Notifications"
            subtitle={notificationsEnabled ? "Enabled" : "Disabled"}
            showArrow={false}
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: theme.backgroundTertiary, true: theme.primary }}
              />
            }
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="globe"
            title="Language"
            subtitle="English"
            onPress={() => {}}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="moon"
            title="Appearance"
            subtitle="System"
            onPress={() => {}}
          />
        </Card>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            SUPPORT
          </ThemedText>
          <MenuItem
            icon="help-circle"
            title="Help Center"
            onPress={() => {}}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="message-square"
            title="Contact Support"
            onPress={() => {}}
          />
        </Card>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            LEGAL
          </ThemedText>
          <MenuItem
            icon="shield"
            title="Privacy Policy"
            onPress={() => {}}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="file-text"
            title="Terms of Service"
            onPress={() => {}}
          />
        </Card>

        <Card style={styles.section} elevation={1}>
          <MenuItem
            icon="log-out"
            title="Sign Out"
            onPress={handleSignOut}
            showArrow={false}
            danger
          />
        </Card>

        <Pressable onPress={handleDeleteAccount} style={styles.deleteButton}>
          <ThemedText style={[styles.deleteText, { color: theme.error }]}>
            Delete Account
          </ThemedText>
        </Pressable>

        <ThemedText style={[styles.version, { color: theme.textSecondary }]}>
          TempoChat v1.0.0
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: Spacing.xl,
    paddingTop: Spacing.md,
  },
  profileName: {
    marginTop: Spacing.md,
  },
  profileEmail: {
    marginTop: Spacing.xs,
  },
  profilePhone: {
    marginTop: Spacing.xs,
  },
  section: {
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
  },
  menuSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  menuSeparator: {
    height: 1,
    marginLeft: 64,
  },
  deleteButton: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  deleteText: {
    fontSize: 14,
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
});
