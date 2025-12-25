import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, RefreshControl, TextInput, Modal, Platform, Linking, Alert, ActivityIndicator, KeyboardAvoidingView } from "react-native";
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
import { createChat, Contact } from "@/lib/storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
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

function EmptyState({ searchQuery, isWeb }: { searchQuery: string; isWeb: boolean }) {
  const { theme } = useTheme();

  const getMessage = () => {
    if (isWeb) {
      return {
        title: "Contacts not available on web",
        subtitle: "Use the SwipeMe app on your phone to find friends from your contacts",
      };
    }
    if (searchQuery) {
      return {
        title: "No contacts found",
        subtitle: "Try a different search term",
      };
    }
    return {
      title: "No friends on SwipeMe yet",
      subtitle: "Invite your friends to join SwipeMe",
    };
  };

  const { title, subtitle } = getMessage();

  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name={isWeb ? "smartphone" : "users"} size={36} color={theme.textSecondary} />
      </View>
      <ThemedText style={[styles.emptyTitle, { fontWeight: "600" }]}>
        {title}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </ThemedText>
    </View>
  );
}

function LoadingState() {
  const { theme } = useTheme();

  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={theme.primary} />
      <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
        Finding contacts on SwipeMe...
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

interface NewContactModalProps {
  visible: boolean;
  onClose: () => void;
  onStartChat: (userId: string, name: string) => void;
}

function NewContactModal({ visible, onClose, onStartChat }: NewContactModalProps) {
  const { theme } = useTheme();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [userExists, setUserExists] = useState<{ id: string; displayName: string } | null>(null);
  const [error, setError] = useState("");

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setUserExists(null);
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const checkUser = async () => {
    if (!email.trim() || !validateEmail(email.trim())) {
      return;
    }

    setChecking(true);
    setError("");
    
    try {
      const response = await apiRequest("POST", "/api/contacts/check", { email: email.trim() });
      const data = await response.json();
      
      if (data.exists) {
        setUserExists({ id: data.user.id, displayName: data.user.displayName || email.split("@")[0] });
      } else {
        setUserExists(null);
      }
    } catch (err) {
      console.error("Failed to check user:", err);
    } finally {
      setChecking(false);
    }
  };

  const handleDone = async () => {
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email");
      return;
    }

    if (userExists) {
      const name = firstName.trim() || lastName.trim() 
        ? `${firstName.trim()} ${lastName.trim()}`.trim() 
        : userExists.displayName;
      onStartChat(userExists.id, name);
      handleClose();
    } else {
      setLoading(true);
      try {
        const name = `${firstName.trim()} ${lastName.trim()}`.trim() || "Friend";
        const response = await apiRequest("POST", "/api/contacts/invite", { 
          email: email.trim(), 
          name 
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to send invitation");
        }
        
        Alert.alert(
          "Invitation Sent",
          `We've sent an invitation to ${email}. They'll be able to chat with you once they join SwipeMe!`
        );
        handleClose();
      } catch (err: any) {
        setError(err.message || "Failed to send invitation");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.newContactContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={[styles.newContactHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={handleClose} style={styles.newContactHeaderBtn}>
              <ThemedText style={{ color: theme.text }}>Cancel</ThemedText>
            </Pressable>
            <ThemedText type="h4">New Contact</ThemedText>
            <Pressable 
              onPress={handleDone} 
              style={styles.newContactHeaderBtn}
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <ThemedText style={{ color: email.trim() ? theme.primary : theme.textSecondary, fontWeight: "600" }}>
                  Done
                </ThemedText>
              )}
            </Pressable>
          </View>

          <View style={styles.newContactForm}>
            <View style={[styles.inputGroup, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <TextInput
                style={[styles.newContactInput, { color: theme.text, borderBottomColor: theme.border }]}
                placeholder="First name"
                placeholderTextColor={theme.textSecondary}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.newContactInput, { color: theme.text }]}
                placeholder="Last name"
                placeholderTextColor={theme.textSecondary}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.inputGroup, { backgroundColor: theme.backgroundDefault, borderColor: theme.border, marginTop: Spacing.xl }]}>
              <View style={styles.emailInputRow}>
                <ThemedText style={[styles.emailLabel, { color: theme.text }]}>Email</ThemedText>
                <TextInput
                  style={[styles.emailInput, { color: theme.text }]}
                  placeholder="email@example.com"
                  placeholderTextColor={theme.textSecondary}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setUserExists(null);
                    setError("");
                  }}
                  onBlur={checkUser}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {checking ? (
                  <ActivityIndicator size="small" color={theme.textSecondary} />
                ) : null}
              </View>
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={14} color={Colors.light.error} />
                <ThemedText style={[styles.errorText, { color: Colors.light.error }]}>{error}</ThemedText>
              </View>
            ) : null}

            {userExists ? (
              <View style={[styles.statusBadge, { backgroundColor: Colors.light.successLight }]}>
                <Feather name="check-circle" size={16} color={Colors.light.success} />
                <ThemedText style={[styles.statusText, { color: Colors.light.success }]}>
                  This person is on SwipeMe - you can chat now!
                </ThemedText>
              </View>
            ) : email.trim() && validateEmail(email.trim()) && !checking ? (
              <View style={[styles.statusBadge, { backgroundColor: Colors.light.primaryLight }]}>
                <Feather name="send" size={16} color={Colors.light.primary} />
                <ThemedText style={[styles.statusText, { color: Colors.light.primary }]}>
                  Tap Done to send an invite to join SwipeMe
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface DeviceContact {
  id: string;
  name: string;
  phoneNumbers: string[];
  emails: string[];
}

export default function DiscoverScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
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
      await loadContacts(true);
    }
  };

  const fetchDeviceContacts = async (): Promise<DeviceContact[]> => {
    if (Platform.OS === "web") {
      return [];
    }
    
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name],
      });
      
      return data.map(contact => ({
        id: contact.id,
        name: contact.name || "Unknown",
        phoneNumbers: contact.phoneNumbers?.map(p => p.number?.replace(/[\s\-\(\)]/g, "") || "") || [],
        emails: contact.emails?.map(e => e.email || "") || [],
      })).filter(c => c.phoneNumbers.length > 0 || c.emails.length > 0);
    } catch (error) {
      console.error("Failed to fetch device contacts:", error);
      return [];
    }
  };

  const matchContactsWithUsers = async (deviceContactsList: DeviceContact[]): Promise<Contact[]> => {
    if (deviceContactsList.length === 0) {
      return [];
    }
    
    try {
      const emails = deviceContactsList.flatMap(c => c.emails).filter(Boolean);
      const phones = deviceContactsList.flatMap(c => c.phoneNumbers).filter(Boolean);
      
      const response = await apiRequest("POST", "/api/contacts/match", {
        emails,
        phones,
      });
      
      if (!response.ok) {
        console.error("Failed to match contacts");
        return [];
      }
      
      const matchedUsers = await response.json();
      
      return matchedUsers.map((user: any) => {
        const deviceContact = deviceContactsList.find(dc => 
          dc.emails.includes(user.email) || 
          dc.phoneNumbers.some(p => user.phone && p.includes(user.phone))
        );
        
        return {
          id: user.id.toString(),
          name: deviceContact?.name || user.displayName || user.email.split("@")[0],
          avatarId: user.id.toString(),
          walletAddress: user.walletAddress || "",
          phone: deviceContact?.phoneNumbers[0] || user.phone,
        };
      });
    } catch (error) {
      console.error("Failed to match contacts with users:", error);
      return [];
    }
  };

  const loadContacts = useCallback(async (hasPermission: boolean) => {
    if (Platform.OS === "web" || !hasPermission) {
      setContacts([]);
      return;
    }
    
    setLoading(true);
    try {
      const deviceContactsList = await fetchDeviceContacts();
      setDeviceContacts(deviceContactsList);
      
      const matchedContacts = await matchContactsWithUsers(deviceContactsList);
      setContacts(matchedContacts);
    } catch (error) {
      console.error("Failed to load contacts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const initialize = async () => {
        if (Platform.OS === "web") {
          setPermissionStatus(Contacts.PermissionStatus.GRANTED);
          return;
        }
        
        const { status } = await Contacts.getPermissionsAsync();
        setPermissionStatus(status);
        
        if (status === Contacts.PermissionStatus.GRANTED) {
          await loadContacts(true);
        }
      };
      
      initialize();
    }, [loadContacts])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts(permissionStatus === Contacts.PermissionStatus.GRANTED);
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
    setShowNewContact(true);
  };

  const handleStartChatWithUser = async (userId: string, name: string) => {
    const chat = await createChat({ id: userId, name, avatarId: userId, walletAddress: "", phone: "" });
    navigation.navigate("ChatsTab", {
      screen: "Chat",
      params: { chatId: chat.id, name },
    } as any);
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
      await loadContacts(true);
      if (contacts.length === 0) {
        Alert.alert("No Matches", "None of your contacts are on SwipeMe yet. Invite them to join!");
      } else {
        Alert.alert("Contacts Updated", `Found ${contacts.length} contact(s) on SwipeMe!`);
      }
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
        <NewContactModal
          visible={showNewContact}
          onClose={() => setShowNewContact(false)}
          onStartChat={handleStartChatWithUser}
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
        <NewContactModal
          visible={showNewContact}
          onClose={() => setShowNewContact(false)}
          onStartChat={handleStartChatWithUser}
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
        ListEmptyComponent={loading ? <LoadingState /> : <EmptyState searchQuery={searchQuery} isWeb={Platform.OS === "web"} />}
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

      <NewContactModal
        visible={showNewContact}
        onClose={() => setShowNewContact(false)}
        onStartChat={handleStartChatWithUser}
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing["2xl"],
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
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
  newContactContainer: {
    flex: 1,
  },
  newContactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  newContactHeaderBtn: {
    minWidth: 60,
  },
  newContactForm: {
    padding: Spacing.lg,
  },
  inputGroup: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  newContactInput: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    borderBottomWidth: 1,
  },
  emailInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  emailLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginRight: Spacing.md,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: 14,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 14,
    flex: 1,
  },
});
