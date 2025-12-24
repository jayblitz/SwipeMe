import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, TextInput, Modal, Platform, Linking, Alert } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getContacts, createChat, Contact } from "@/lib/storage";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";
import { MainTabParamList } from "@/navigation/MainTabNavigator";

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "DiscoverTab">,
  NativeStackNavigationProp<ChatsStackParamList>
>;

interface ContactItemProps {
  contact: Contact;
  onPress: () => void;
}

function ContactItem({ contact, onPress }: ContactItemProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.contactItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
    >
      <Avatar avatarId={contact.avatarId} size={48} />
      <View style={styles.contactContent}>
        <ThemedText style={styles.contactName}>{contact.name}</ThemedText>
        <ThemedText style={[styles.contactPhone, { color: theme.textSecondary }]}>
          {contact.phone || contact.walletAddress.slice(0, 10) + "..."}
        </ThemedText>
      </View>
      <Feather name="message-circle" size={20} color={theme.primary} />
    </Pressable>
  );
}

function PermissionRequest({ onRequestPermission }: { onRequestPermission: () => void }) {
  const { theme } = useTheme();

  return (
    <View style={styles.permissionContainer}>
      <View style={[styles.permissionIcon, { backgroundColor: Colors.light.primaryLight }]}>
        <Feather name="users" size={40} color={Colors.light.primary} />
      </View>
      <ThemedText type="h3" style={styles.permissionTitle}>Find Your Friends</ThemedText>
      <ThemedText style={[styles.permissionSubtitle, { color: theme.textSecondary }]}>
        Allow SwipeMe to access your contacts to find friends who are already using the app.
      </ThemedText>
      <Button onPress={onRequestPermission} style={styles.permissionButton}>
        Allow Access
      </Button>
      <ThemedText style={[styles.permissionNote, { color: theme.textSecondary }]}>
        Your contacts are only used to find friends on SwipeMe and are never shared.
      </ThemedText>
    </View>
  );
}

function PermissionDenied() {
  const { theme } = useTheme();

  const openSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        console.error("Failed to open settings:", error);
      }
    }
  };

  return (
    <View style={styles.permissionContainer}>
      <View style={[styles.permissionIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="lock" size={40} color={theme.textSecondary} />
      </View>
      <ThemedText type="h3" style={styles.permissionTitle}>Contacts Access Required</ThemedText>
      <ThemedText style={[styles.permissionSubtitle, { color: theme.textSecondary }]}>
        To find your friends on SwipeMe, please enable contacts access in your device settings.
      </ThemedText>
      {Platform.OS !== "web" ? (
        <Button onPress={openSettings} style={styles.permissionButton}>
          Open Settings
        </Button>
      ) : null}
    </View>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  const { theme } = useTheme();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="users" size={36} color={theme.textSecondary} />
      </View>
      <ThemedText style={[styles.emptyTitle, { fontWeight: "600" }]}>
        {searchQuery ? "No contacts found" : "No friends on SwipeMe yet"}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {searchQuery ? "Try a different search term" : "Invite your friends to join SwipeMe"}
      </ThemedText>
    </View>
  );
}

interface FABMenuProps {
  visible: boolean;
  onClose: () => void;
  onNewContact: () => void;
  onNewGroup: () => void;
  onPayAnyone: () => void;
  onSyncContacts: () => void;
}

function FABMenu({ visible, onClose, onNewContact, onNewGroup, onPayAnyone, onSyncContacts }: FABMenuProps) {
  const { theme, isDark } = useTheme();

  const menuItems = [
    { icon: "user-plus" as const, label: "New Contact", onPress: onNewContact },
    { icon: "users" as const, label: "New Group", onPress: onNewGroup },
    { icon: "send" as const, label: "Pay Anyone", onPress: onPayAnyone },
    { icon: "refresh-cw" as const, label: "Contacts on SwipeMe", onPress: onSyncContacts },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.menuContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.menuHeader}>
            <ThemedText type="h4">Quick Actions</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [
                styles.menuItem,
                { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
                index < menuItems.length - 1 && [styles.menuItemBorder, { borderBottomColor: theme.border }],
              ]}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: Colors.light.primaryLight }]}>
                <Feather name={item.icon} size={20} color={Colors.light.primary} />
              </View>
              <ThemedText style={styles.menuItemLabel}>{item.label}</ThemedText>
              <Feather name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

export default function DiscoverScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Contacts.PermissionStatus | null>(null);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === "web") {
      setPermissionStatus(Contacts.PermissionStatus.GRANTED);
      return;
    }
    
    const { status } = await Contacts.getPermissionsAsync();
    setPermissionStatus(status);
  }, []);

  const requestPermission = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Run in Expo Go to use this feature");
      return;
    }
    
    const { status } = await Contacts.requestPermissionsAsync();
    setPermissionStatus(status);
    
    if (status === Contacts.PermissionStatus.GRANTED) {
      await loadContacts();
    }
  };

  const loadContacts = useCallback(async () => {
    const loadedContacts = await getContacts();
    setContacts(loadedContacts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPermission();
      loadContacts();
    }, [checkPermission, loadContacts])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const handleContactPress = async (contact: Contact) => {
    const chat = await createChat(contact);
    navigation.navigate("ChatsTab", {
      screen: "Chat",
      params: { chatId: chat.id, name: contact.name },
    } as any);
  };

  const handleNewContact = () => {
    Alert.alert("New Contact", "Add a new contact by entering their wallet address or phone number.");
  };

  const handleNewGroup = () => {
    Alert.alert("New Group", "Create a group chat with up to 10 people.");
  };

  const handlePayAnyone = () => {
    navigation.navigate("WalletTab" as any);
  };

  const handleSyncContacts = async () => {
    if (permissionStatus !== Contacts.PermissionStatus.GRANTED) {
      await requestPermission();
    } else {
      Alert.alert("Syncing", "Checking your contacts for SwipeMe users...");
      await loadContacts();
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (contact.phone && contact.phone.includes(searchQuery))
  );

  if (permissionStatus === null) {
    return <ThemedView style={styles.container} />;
  }

  if (permissionStatus === Contacts.PermissionStatus.UNDETERMINED) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <PermissionRequest onRequestPermission={requestPermission} />
        <FABMenu
          visible={showMenu}
          onClose={() => setShowMenu(false)}
          onNewContact={handleNewContact}
          onNewGroup={handleNewGroup}
          onPayAnyone={handlePayAnyone}
          onSyncContacts={handleSyncContacts}
        />
        <Pressable
          onPress={() => setShowMenu(true)}
          style={[styles.fab, { bottom: tabBarHeight + Spacing.lg }]}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </Pressable>
      </ThemedView>
    );
  }

  if (permissionStatus === Contacts.PermissionStatus.DENIED) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight }]}>
        <PermissionDenied />
        <FABMenu
          visible={showMenu}
          onClose={() => setShowMenu(false)}
          onNewContact={handleNewContact}
          onNewGroup={handleNewGroup}
          onPayAnyone={handlePayAnyone}
          onSyncContacts={handleSyncContacts}
        />
        <Pressable
          onPress={() => setShowMenu(true)}
          style={[styles.fab, { bottom: tabBarHeight + Spacing.lg }]}
        >
          <Feather name="plus" size={28} color="#FFFFFF" />
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactItem contact={item} onPress={() => handleContactPress(item)} />
        )}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl + 70,
          },
          filteredContacts.length === 0 && styles.emptyListContent,
        ]}
        ListHeaderComponent={
          <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="search" size={18} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search contacts..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")}>
                  <Feather name="x-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            
            <Pressable 
              style={[styles.qrButton, { backgroundColor: theme.primary }]}
            >
              <Feather name="maximize" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        }
        ListEmptyComponent={<EmptyState searchQuery={searchQuery} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}
      />
      
      <FABMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onNewContact={handleNewContact}
        onNewGroup={handleNewGroup}
        onPayAnyone={handlePayAnyone}
        onSyncContacts={handleSyncContacts}
      />
      
      <Pressable
        onPress={() => setShowMenu(true)}
        style={[styles.fab, { bottom: tabBarHeight + Spacing.lg }]}
      >
        <Feather name="plus" size={28} color="#FFFFFF" />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  searchContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  qrButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  contactContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  contactName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  contactPhone: {
    fontSize: 14,
  },
  separator: {
    height: 1,
    marginLeft: 68,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  permissionIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  permissionTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  permissionSubtitle: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  permissionButton: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  permissionNote: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing["2xl"],
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingBottom: Spacing.xl,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
});
