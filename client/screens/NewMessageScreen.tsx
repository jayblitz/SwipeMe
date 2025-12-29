import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Modal,
  ActivityIndicator,
  SectionList,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import * as Contacts from "expo-contacts";

interface NewMessageScreenProps {
  visible: boolean;
  onClose: () => void;
  onStartChat: (user: { id: string; email: string; name?: string; walletAddress?: string }) => void;
  deviceContacts: Contacts.Contact[];
}

interface UserSearchResult {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  walletAddress?: string;
}

interface ContactWithStatus extends Contacts.Contact {
  isOnSwipeMe?: boolean;
  swipeMeUser?: UserSearchResult;
}

interface ContactSection {
  title: string;
  data: ContactWithStatus[];
  isSwipeMeSection?: boolean;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

type ViewMode = "main" | "findByEmail" | "findByUsername";

export function NewMessageScreen({ visible, onClose, onStartChat, deviceContacts }: NewMessageScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [usernameQuery, setUsernameQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [usernameResults, setUsernameResults] = useState<UserSearchResult[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("main");
  const [swipeMeContacts, setSwipeMeContacts] = useState<ContactWithStatus[]>([]);
  const [isCheckingContacts, setIsCheckingContacts] = useState(false);
  const usernameSearchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (visible && deviceContacts.length > 0) {
      checkContactsOnSwipeMe();
    }
  }, [visible, deviceContacts]);

  const checkContactsOnSwipeMe = async () => {
    if (deviceContacts.length === 0) return;
    
    setIsCheckingContacts(true);
    
    try {
      const emails = deviceContacts
        .filter(c => c.emails && c.emails.length > 0)
        .map(c => c.emails![0].email)
        .filter(Boolean);
      
      if (emails.length === 0) {
        setIsCheckingContacts(false);
        return;
      }

      const url = new URL("/api/users/check-batch", getApiUrl());
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emails }),
      });

      if (response.ok) {
        const data = await response.json();
        const swipeMeUsers: Record<string, UserSearchResult> = {};
        (data.users || []).forEach((user: UserSearchResult) => {
          if (user.email) {
            swipeMeUsers[user.email.toLowerCase()] = user;
          }
        });

        const contactsWithStatus: ContactWithStatus[] = deviceContacts.map(contact => {
          const email = contact.emails?.[0]?.email?.toLowerCase();
          if (email && swipeMeUsers[email]) {
            return {
              ...contact,
              isOnSwipeMe: true,
              swipeMeUser: swipeMeUsers[email],
            };
          }
          return { ...contact, isOnSwipeMe: false };
        });

        setSwipeMeContacts(contactsWithStatus.filter(c => c.isOnSwipeMe));
      } else {
        setSwipeMeContacts([]);
      }
    } catch (error) {
      console.error("Failed to check contacts:", error);
      setSwipeMeContacts([]);
    } finally {
      setIsCheckingContacts(false);
    }
  };

  const groupedContacts = useMemo(() => {
    const contactsToShow = isCheckingContacts 
      ? deviceContacts 
      : deviceContacts.filter(contact => {
          const email = contact.emails?.[0]?.email?.toLowerCase();
          return !swipeMeContacts.some(sc => 
            sc.emails?.[0]?.email?.toLowerCase() === email
          );
        });

    const sorted = [...contactsToShow].sort((a, b) => {
      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB);
    });

    const sections: ContactSection[] = [];
    const grouped: { [key: string]: ContactWithStatus[] } = {};

    sorted.forEach((contact) => {
      const name = contact.name || "";
      const firstChar = name.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(firstChar) ? firstChar : "#";
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(contact);
    });

    ALPHABET.forEach((letter) => {
      if (grouped[letter] && grouped[letter].length > 0) {
        sections.push({
          title: letter,
          data: grouped[letter],
        });
      }
    });

    return sections;
  }, [deviceContacts, swipeMeContacts, isCheckingContacts]);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailSearch = useCallback(async () => {
    const email = searchQuery.trim();
    if (!email) return;
    
    if (!isValidEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    
    setIsSearching(true);
    try {
      const url = new URL("/api/users/search", getApiUrl());
      url.searchParams.set("email", email.toLowerCase());
      
      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
        if (data.users?.length === 0) {
          Alert.alert("No User Found", "No user with that email address was found on SwipeMe.");
        }
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
      Alert.alert("Search Error", "Failed to search for users. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleSelectUser = (user: UserSearchResult) => {
    onStartChat({ ...user, email: user.email || "" });
    setSearchQuery("");
    setSearchResults([]);
    setUsernameQuery("");
    setUsernameResults([]);
    setViewMode("main");
    onClose();
  };

  const handleNewGroup = () => {
    Alert.alert(
      "Coming Soon",
      "Group chats are coming to SwipeMe! You'll soon be able to create groups, share payments, and chat with multiple friends at once.",
      [{ text: "OK", style: "default" }]
    );
  };

  const handleFindByEmail = () => {
    setViewMode("findByEmail");
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleFindByUsername = () => {
    setViewMode("findByUsername");
    setUsernameQuery("");
    setUsernameResults([]);
  };

  const handleUsernameChange = (text: string) => {
    setUsernameQuery(text);
    
    if (usernameSearchTimeoutRef.current) {
      clearTimeout(usernameSearchTimeoutRef.current);
    }
    
    const cleanQuery = text.trim().replace(/^@/, "");
    if (cleanQuery.length === 0) {
      setUsernameResults([]);
      return;
    }
    
    usernameSearchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const url = new URL("/api/users/search-username", getApiUrl());
        url.searchParams.set("username", cleanQuery);
        
        const response = await fetch(url.toString(), {
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          setUsernameResults(data.users || []);
        } else {
          setUsernameResults([]);
        }
      } catch (error) {
        console.error("Username search error:", error);
        setUsernameResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleBackToMain = () => {
    setViewMode("main");
    setSearchQuery("");
    setSearchResults([]);
    setUsernameQuery("");
    setUsernameResults([]);
    if (usernameSearchTimeoutRef.current) {
      clearTimeout(usernameSearchTimeoutRef.current);
    }
  };

  const handleClose = () => {
    setViewMode("main");
    setSearchQuery("");
    setSearchResults([]);
    setUsernameQuery("");
    setUsernameResults([]);
    if (usernameSearchTimeoutRef.current) {
      clearTimeout(usernameSearchTimeoutRef.current);
    }
    onClose();
  };

  const handleSwipeMeContactPress = (contact: ContactWithStatus) => {
    if (contact.swipeMeUser) {
      handleSelectUser(contact.swipeMeUser);
    }
  };

  const handleInviteContact = (contact: Contacts.Contact) => {
    const email = contact.emails?.[0]?.email;
    if (!email) {
      Alert.alert("No Email", "This contact doesn't have an email address to send an invitation.");
      return;
    }
    
    Alert.alert(
      "Invite to SwipeMe",
      `Send an invitation to ${contact.name || email}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Send Invite",
          onPress: async () => {
            try {
              const url = new URL("/api/invitations/send", getApiUrl());
              const response = await fetch(url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email }),
              });
              
              if (response.ok) {
                Alert.alert(
                  "Invitation Sent",
                  `We've sent an invitation to ${contact.name || email}. They'll be able to chat with you once they join SwipeMe!`
                );
              } else {
                const error = await response.json();
                Alert.alert("Error", error.error || "Failed to send invitation.");
              }
            } catch (error) {
              console.error("Invite error:", error);
              Alert.alert("Error", "Failed to send invitation. Please try again.");
            }
          }
        },
      ]
    );
  };

  const renderAlphabetIndex = () => (
    <View style={styles.alphabetIndex}>
      {ALPHABET.map((letter) => (
        <Pressable key={letter} style={styles.alphabetLetter}>
          <ThemedText style={[styles.alphabetText, { color: theme.textSecondary }]}>
            {letter}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );

  const renderSwipeMeContact = ({ item }: { item: ContactWithStatus }) => {
    const initials = (item.name || "?").slice(0, 2).toUpperCase();
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.contactItem,
          { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
        ]}
        onPress={() => handleSwipeMeContactPress(item)}
      >
        <View style={[styles.contactAvatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.contactInitials}>{initials}</ThemedText>
        </View>
        <View style={styles.contactInfoColumn}>
          <ThemedText style={styles.contactName}>{item.name || "Unknown"}</ThemedText>
          <ThemedText style={[styles.contactEmail, { color: theme.textSecondary }]}>
            On SwipeMe
          </ThemedText>
        </View>
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      </Pressable>
    );
  };

  const renderContactItem = ({ item }: { item: ContactWithStatus }) => {
    const initials = (item.name || "?").slice(0, 2).toUpperCase();
    const hasEmail = (item.emails?.length || 0) > 0;
    
    return (
      <View style={[styles.contactItem, { backgroundColor: "transparent" }]}>
        <View style={[styles.contactAvatar, { backgroundColor: theme.textSecondary }]}>
          <ThemedText style={styles.contactInitials}>{initials}</ThemedText>
        </View>
        <View style={styles.contactInfoColumn}>
          <ThemedText style={styles.contactName}>{item.name || "Unknown"}</ThemedText>
        </View>
        {hasEmail ? (
          <Pressable 
            style={({ pressed }) => [
              styles.inviteButton, 
              { backgroundColor: pressed ? theme.primaryDark || theme.primary : theme.primary }
            ]}
            onPress={() => handleInviteContact(item)}
          >
            <ThemedText style={styles.inviteButtonText}>Invite</ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: ContactSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {section.title}
      </ThemedText>
    </View>
  );

  const renderSearchResult = ({ item }: { item: UserSearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        styles.contactItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => handleSelectUser(item)}
    >
      <View style={[styles.contactAvatar, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.contactInitials}>
          {(item.name || item.email || "?").slice(0, 2).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.contactInfoColumn}>
        <ThemedText style={styles.contactName}>{item.name || item.email || "Unknown"}</ThemedText>
        <ThemedText style={[styles.contactEmail, { color: theme.textSecondary }]}>
          {item.email || ""}
        </ThemedText>
      </View>
    </Pressable>
  );

  const renderFindByEmailView = () => (
    <View style={styles.findByEmailContainer}>
      <View style={[styles.searchInputContainer, { backgroundColor: theme.backgroundDefault }]}>
        <Feather name="search" size={18} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Enter email address"
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleEmailSearch}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          autoFocus
        />
        {isSearching ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : searchQuery.length > 0 ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Feather name="x-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      
      <Pressable 
        style={[
          styles.searchButton, 
          { 
            backgroundColor: searchQuery.trim().length > 0 ? theme.primary : theme.backgroundSecondary,
            opacity: searchQuery.trim().length > 0 ? 1 : 0.6,
          }
        ]}
        onPress={handleEmailSearch}
        disabled={isSearching || searchQuery.trim().length === 0}
      >
        <ThemedText style={[
          styles.searchButtonText,
          { color: searchQuery.trim().length > 0 ? "#FFFFFF" : theme.textSecondary }
        ]}>
          Search
        </ThemedText>
      </Pressable>
      
      {searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={renderSearchResult}
          style={styles.searchResultsList}
        />
      ) : null}
    </View>
  );

  const renderUsernameResult = ({ item }: { item: UserSearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        styles.contactItem,
        { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
      ]}
      onPress={() => handleSelectUser({ ...item, email: item.email || "" })}
    >
      <View style={[styles.contactAvatar, { backgroundColor: theme.primary }]}>
        <ThemedText style={styles.contactInitials}>
          {(item.name || item.username || "?").slice(0, 2).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.contactInfoColumn}>
        <ThemedText style={styles.contactName}>
          {item.name || `@${item.username}`}
        </ThemedText>
        <ThemedText style={[styles.contactEmail, { color: theme.textSecondary }]}>
          @{item.username}
        </ThemedText>
      </View>
    </Pressable>
  );

  const renderFindByUsernameView = () => (
    <View style={styles.findByEmailContainer}>
      <View style={[styles.searchInputContainer, { backgroundColor: theme.backgroundDefault }]}>
        <ThemedText style={{ color: theme.textSecondary, fontSize: 18, marginRight: 4 }}>@</ThemedText>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search username"
          placeholderTextColor={theme.textSecondary}
          value={usernameQuery}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          autoFocus
        />
        {isSearching ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : usernameQuery.length > 0 ? (
          <Pressable onPress={() => { setUsernameQuery(""); setUsernameResults([]); }}>
            <Feather name="x-circle" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      
      {usernameResults.length > 0 ? (
        <FlatList
          data={usernameResults}
          keyExtractor={(item) => item.id}
          renderItem={renderUsernameResult}
          style={styles.searchResultsList}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        />
      ) : usernameQuery.trim().length > 0 && !isSearching ? (
        <View style={styles.noResultsContainer}>
          <Feather name="user-x" size={32} color={theme.textSecondary} />
          <ThemedText style={[styles.noResultsText, { color: theme.textSecondary }]}>
            No users found matching "@{usernameQuery.replace(/^@/, "")}"
          </ThemedText>
        </View>
      ) : (
        <View style={styles.noResultsContainer}>
          <Feather name="search" size={32} color={theme.textSecondary} />
          <ThemedText style={[styles.noResultsText, { color: theme.textSecondary }]}>
            Enter a username to find someone
          </ThemedText>
        </View>
      )}
    </View>
  );

  const renderMainView = () => (
    <>
      <View style={styles.optionsContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.optionItem,
            { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
          ]}
          onPress={handleNewGroup}
        >
          <Feather name="users" size={20} color={theme.text} />
          <ThemedText style={styles.optionText}>New Group</ThemedText>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.optionItem,
            { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
          ]}
          onPress={handleFindByUsername}
        >
          <Feather name="at-sign" size={20} color={theme.text} />
          <ThemedText style={styles.optionText}>Find by Username</ThemedText>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.optionItem,
            { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
          ]}
          onPress={handleFindByEmail}
        >
          <Feather name="mail" size={20} color={theme.text} />
          <ThemedText style={styles.optionText}>Find by Email</ThemedText>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {Platform.OS !== "web" ? (
        <View style={styles.contactsContainer}>
          {isCheckingContacts ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={theme.primary} />
              <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
                Checking contacts...
              </ThemedText>
            </View>
          ) : null}
          
          {swipeMeContacts.length > 0 ? (
            <View style={styles.swipeMeSection}>
              <View style={[styles.sectionDivider, { backgroundColor: theme.backgroundSecondary }]}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <ThemedText style={[styles.dividerText, { color: theme.textSecondary }]}>
                  On SwipeMe
                </ThemedText>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>
              <FlatList
                data={swipeMeContacts}
                keyExtractor={(item, index) => `swipeme-${index}-${item.name || ""}`}
                renderItem={renderSwipeMeContact}
                scrollEnabled={false}
              />
            </View>
          ) : null}
          
          {deviceContacts.length > 0 ? (
            <View style={styles.regularContactsSection}>
              <View style={[styles.sectionDivider, { backgroundColor: theme.backgroundSecondary }]}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <ThemedText style={[styles.dividerText, { color: theme.textSecondary }]}>
                  Contacts
                </ThemedText>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>
              <View style={styles.contactsListContainer}>
                <SectionList
                  sections={groupedContacts}
                  keyExtractor={(item, index) => `contact-${index}-${item.name || ""}`}
                  renderItem={renderContactItem}
                  renderSectionHeader={renderSectionHeader}
                  stickySectionHeadersEnabled
                  contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
                />
                {renderAlphabetIndex()}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.webFallbackContainer}>
          <Feather name="smartphone" size={32} color={theme.textSecondary} />
          <ThemedText style={[styles.webFallbackText, { color: theme.textSecondary }]}>
            Device contacts available on mobile
          </ThemedText>
        </View>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.headerContent}>
            {viewMode !== "main" ? (
              <Pressable onPress={handleBackToMain} style={styles.backButton}>
                <Feather name="arrow-left" size={24} color={theme.text} />
              </Pressable>
            ) : null}
            <ThemedText style={styles.headerTitle}>
              {viewMode === "findByEmail" ? "Find by Email" : viewMode === "findByUsername" ? "Find by Username" : "New Message"}
            </ThemedText>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        {viewMode === "findByEmail" ? renderFindByEmailView() : viewMode === "findByUsername" ? renderFindByUsernameView() : renderMainView()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    position: "absolute",
    right: 0,
    padding: Spacing.xs,
  },
  backButton: {
    position: "absolute",
    left: 0,
    padding: Spacing.xs,
  },
  optionsContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
  },
  contactsContainer: {
    flex: 1,
  },
  swipeMeSection: {
    marginBottom: Spacing.sm,
  },
  regularContactsSection: {
    flex: 1,
  },
  contactsListContainer: {
    flex: 1,
    flexDirection: "row",
  },
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitials: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  contactInfoColumn: {
    flex: 1,
    flexDirection: "column",
  },
  contactInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  contactName: {
    fontSize: 16,
  },
  contactEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  inviteButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  inviteButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  alphabetIndex: {
    position: "absolute",
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  alphabetLetter: {
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  alphabetText: {
    fontSize: 10,
    fontWeight: "500",
  },
  findByEmailContainer: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emailSearchContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  searchResultsList: {
    marginTop: Spacing.md,
  },
  noResultsContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  noResultsText: {
    fontSize: 15,
  },
  searchButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  contactsTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    textTransform: "uppercase",
  },
  webFallbackContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  webFallbackText: {
    fontSize: 15,
    textAlign: "center",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
  },
  bottomSearchBar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
});
