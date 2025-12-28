import React, { useState, useMemo, useCallback, useRef } from "react";
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
  onStartChat: (user: { id: string; email: string; name?: string }) => void;
  deviceContacts: Contacts.Contact[];
}

interface UserSearchResult {
  id: string;
  email: string;
  name?: string;
}

interface ContactSection {
  title: string;
  data: Contacts.Contact[];
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export function NewMessageScreen({ visible, onClose, onStartChat, deviceContacts }: NewMessageScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [showEmailSearch, setShowEmailSearch] = useState(false);

  const groupedContacts = useMemo(() => {
    const sorted = [...deviceContacts].sort((a, b) => {
      const nameA = a.name || "";
      const nameB = b.name || "";
      return nameA.localeCompare(nameB);
    });

    const sections: ContactSection[] = [];
    const grouped: { [key: string]: Contacts.Contact[] } = {};

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
  }, [deviceContacts]);

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
          Alert.alert("No User Found", "No user with that email address was found.");
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
    onStartChat(user);
    setSearchQuery("");
    setSearchResults([]);
    setShowEmailSearch(false);
    onClose();
  };

  const handleContactPress = async (contact: Contacts.Contact) => {
    const email = contact.emails?.[0]?.email;
    if (!email) {
      Alert.alert("No Email", "This contact doesn't have an email address.");
      return;
    }
    
    setSearchQuery(email);
    setShowEmailSearch(true);
    
    if (!isValidEmail(email)) {
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
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
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

  const renderContactItem = ({ item }: { item: Contacts.Contact }) => {
    const initials = (item.name || "?").slice(0, 2).toUpperCase();
    const hasEmail = (item.emails?.length || 0) > 0;
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.contactItem,
          { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
        ]}
        onPress={() => handleContactPress(item)}
      >
        <View style={[styles.contactAvatar, { backgroundColor: theme.primary }]}>
          <ThemedText style={styles.contactInitials}>{initials}</ThemedText>
        </View>
        <View style={styles.contactInfo}>
          <ThemedText style={styles.contactName}>{item.name || "Unknown"}</ThemedText>
          {hasEmail ? (
            <Feather name="at-sign" size={14} color={theme.textSecondary} style={{ marginLeft: 4 }} />
          ) : null}
        </View>
      </Pressable>
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
          {(item.name || item.email).slice(0, 2).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.contactInfo}>
        <ThemedText style={styles.contactName}>{item.name || item.email}</ThemedText>
        <ThemedText style={[styles.contactEmail, { color: theme.textSecondary }]}>
          {item.email}
        </ThemedText>
      </View>
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <View style={styles.headerContent}>
            <ThemedText style={styles.headerTitle}>New Message</ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.optionsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.optionItem,
              { backgroundColor: pressed ? theme.backgroundDefault : "transparent" },
            ]}
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
            onPress={() => setShowEmailSearch(!showEmailSearch)}
          >
            <Feather name="at-sign" size={20} color={theme.text} />
            <ThemedText style={styles.optionText}>Find by Email</ThemedText>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.emailSearchContainer}>
          <View style={[styles.searchInputContainer, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Enter email address to find user"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleEmailSearch}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
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
            style={[styles.searchButton, { backgroundColor: theme.primary }]}
            onPress={handleEmailSearch}
            disabled={isSearching || searchQuery.trim().length === 0}
          >
            <ThemedText style={styles.searchButtonText}>Search</ThemedText>
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

        {Platform.OS !== "web" && deviceContacts.length > 0 ? (
          <View style={styles.contactsContainer}>
            <ThemedText style={[styles.contactsTitle, { color: theme.textSecondary }]}>
              Device Contacts
            </ThemedText>
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
        ) : Platform.OS === "web" ? (
          <View style={styles.webFallbackContainer}>
            <Feather name="smartphone" size={32} color={theme.textSecondary} />
            <ThemedText style={[styles.webFallbackText, { color: theme.textSecondary }]}>
              Device contacts available on mobile
            </ThemedText>
          </View>
        ) : null}
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
    flexDirection: "row",
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
    color: "#FFFFFF",
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
  bottomSearchBar: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
});
