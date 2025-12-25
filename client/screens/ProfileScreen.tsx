import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch, Modal, TextInput, Platform, Image } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import * as ImagePicker from "expo-image-picker";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme, ThemeMode } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { clearAllData } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import * as Linking from "expo-linking";
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

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { displayName: string; status: string; twitterLink: string; telegramLink: string; profileImage?: string | null }) => void;
  initialData: { displayName?: string | null; status?: string | null; twitterLink?: string | null; telegramLink?: string | null; profileImage?: string | null };
  onPickImage: () => void;
}

function EditProfileModal({ visible, onClose, onSave, initialData }: Omit<EditProfileModalProps, 'onPickImage'>) {
  const { theme } = useTheme();
  const [displayName, setDisplayName] = useState(initialData.displayName || "");
  const [status, setStatus] = useState(initialData.status || "");
  const [twitterLink, setTwitterLink] = useState(initialData.twitterLink || "");
  const [telegramLink, setTelegramLink] = useState(initialData.telegramLink || "");
  const [pendingProfileImage, setPendingProfileImage] = useState<string | null | undefined>(initialData.profileImage);

  useEffect(() => {
    setDisplayName(initialData.displayName || "");
    setStatus(initialData.status || "");
    setTwitterLink(initialData.twitterLink || "");
    setTelegramLink(initialData.telegramLink || "");
    setPendingProfileImage(initialData.profileImage);
  }, [initialData, visible]);

  const handlePickImage = async () => {
    const options = [
      { text: "Take Photo", onPress: () => pickImage("camera") },
      { text: "Choose from Library", onPress: () => pickImage("library") },
      { text: "Cancel", style: "cancel" as const },
    ];
    
    if (pendingProfileImage) {
      options.splice(2, 0, { 
        text: "Remove Photo", 
        onPress: () => setPendingProfileImage(null),
        style: "destructive" as const,
      } as any);
    }
    
    Alert.alert("Change Profile Photo", undefined, options);
  };

  const pickImage = async (source: "camera" | "library") => {
    if (Platform.OS === "web" && source === "camera") {
      Alert.alert("Not Available", "Run in Expo Go to use the camera");
      return;
    }

    let result;
    
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        if (permission.status === "denied" && !permission.canAskAgain && Platform.OS !== "web") {
          Alert.alert(
            "Camera Permission Required",
            "Camera access is needed to take a photo. Please enable it in Settings.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: async () => {
                try { await Linking.openSettings(); } catch (e) {}
              }},
            ]
          );
        } else {
          Alert.alert("Permission Required", "Camera access is needed to take a photo");
        }
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        if (permission.status === "denied" && !permission.canAskAgain && Platform.OS !== "web") {
          Alert.alert(
            "Photo Library Permission Required",
            "Photo library access is needed to select a photo. Please enable it in Settings.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: async () => {
                try { await Linking.openSettings(); } catch (e) {}
              }},
            ]
          );
        } else {
          Alert.alert("Permission Required", "Photo library access is needed to select a photo");
        }
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
    }

    if (!result.canceled && result.assets[0]) {
      setPendingProfileImage(result.assets[0].uri);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h4">Edit Profile</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalContent}>
          <Pressable onPress={handlePickImage} style={styles.avatarEditContainer}>
            <Avatar imageUri={pendingProfileImage} size={100} />
            <View style={[styles.changeAvatarButton, { backgroundColor: theme.primary }]}>
              <Feather name="camera" size={16} color="#FFFFFF" />
            </View>
          </Pressable>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Display Name</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Enter your name"
                placeholderTextColor={theme.textSecondary}
                value={displayName}
                onChangeText={setDisplayName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Status</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="What's on your mind?"
                placeholderTextColor={theme.textSecondary}
                value={status}
                onChangeText={setStatus}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Twitter/X</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <Feather name="twitter" size={18} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="@username"
                placeholderTextColor={theme.textSecondary}
                value={twitterLink}
                onChangeText={setTwitterLink}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Telegram</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
              <Feather name="send" size={18} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="@username"
                placeholderTextColor={theme.textSecondary}
                value={telegramLink}
                onChangeText={setTelegramLink}
                autoCapitalize="none"
              />
            </View>
          </View>

          <Button 
            onPress={() => onSave({ displayName, status, twitterLink, telegramLink, profileImage: pendingProfileImage })} 
            style={styles.saveButton}
          >
            Save Changes
          </Button>
        </KeyboardAwareScrollViewCompat>
      </ThemedView>
    </Modal>
  );
}

interface AppearanceModalProps {
  visible: boolean;
  onClose: () => void;
  currentMode: ThemeMode;
  onSelect: (mode: ThemeMode) => void;
}

function AppearanceModal({ visible, onClose, currentMode, onSelect }: AppearanceModalProps) {
  const { theme } = useTheme();

  const options: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: "light", label: "Light", icon: "sun" },
    { mode: "dark", label: "Dark", icon: "moon" },
    { mode: "system", label: "System", icon: "smartphone" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.appearanceContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.appearanceHeader}>
            <ThemedText type="h4">Appearance</ThemedText>
          </View>
          {options.map((option) => (
            <Pressable
              key={option.mode}
              onPress={() => {
                onSelect(option.mode);
                onClose();
              }}
              style={[
                styles.appearanceOption,
                currentMode === option.mode && { backgroundColor: Colors.light.primaryLight },
              ]}
            >
              <View style={[styles.appearanceIcon, { backgroundColor: theme.backgroundSecondary }]}>
                <Feather name={option.icon as any} size={20} color={theme.primary} />
              </View>
              <ThemedText style={styles.appearanceLabel}>{option.label}</ThemedText>
              {currentMode === option.mode ? (
                <Feather name="check" size={20} color={Colors.light.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

interface PasskeyModalProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
}

interface PasskeyItem {
  id: string;
  deviceName: string;
  createdAt: string;
}

function PasskeyModal({ visible, onClose, userId }: PasskeyModalProps) {
  const { theme } = useTheme();
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (visible) {
      loadPasskeys();
      setShowRegister(false);
      setDeviceName("");
      setError(null);
    }
  }, [visible]);

  const loadPasskeys = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("GET", "/api/auth/passkeys");
      const data = await response.json();
      setPasskeys(data.passkeys || []);
    } catch (err) {
      console.error("Failed to load passkeys:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Passkey registration is only available in the mobile app");
      return;
    }

    if (!deviceName.trim()) {
      setError("Please enter a device name");
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      // Step 1: Get registration options from server
      const optionsRes = await apiRequest("POST", "/api/auth/passkey/register/options");
      const options = await optionsRes.json();

      // Step 2: Create credentials using react-native-passkeys
      const rnPasskeys = await import("react-native-passkeys");
      
      const credential = await rnPasskeys.create({
        challenge: options.challenge,
        rp: {
          id: options.rp.id,
          name: options.rp.name,
        },
        user: {
          id: options.user.id,
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        timeout: options.timeout,
      });

      if (!credential) {
        setError("Failed to create passkey credential");
        return;
      }

      // Step 3: Send credential to server
      await apiRequest("POST", "/api/auth/passkey/register/complete", {
        credentialId: credential.id,
        publicKey: credential.response.publicKey,
        deviceName: deviceName.trim(),
      });

      Alert.alert("Success", "Passkey registered successfully");
      setShowRegister(false);
      setDeviceName("");
      loadPasskeys();
    } catch (err: any) {
      console.error("Passkey registration error:", err);
      if (err.message?.includes("cancelled") || err.message?.includes("canceled")) {
        setError("Registration cancelled");
      } else {
        setError("Failed to register passkey. Please try again.");
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    Alert.alert(
      "Delete Passkey",
      "Are you sure you want to remove this passkey? You will no longer be able to sign in with it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await apiRequest("DELETE", `/api/auth/passkey/${passkeyId}`);
              setPasskeys(passkeys.filter(p => p.id !== passkeyId));
              Alert.alert("Success", "Passkey removed");
            } catch (err) {
              Alert.alert("Error", "Failed to remove passkey");
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };

  const renderPasskeyList = () => (
    <>
      <View style={styles.passkeyHeader}>
        <View style={[styles.passkeyIcon, { backgroundColor: Colors.light.primaryLight }]}>
          <Feather name="lock" size={32} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.passkeyTitle}>Passkeys</ThemedText>
        <ThemedText style={[styles.passkeyDescription, { color: theme.textSecondary }]}>
          Sign in faster with passkeys. They're more secure than passwords and work with Face ID, Touch ID, or your device PIN.
        </ThemedText>
      </View>

      {loading ? (
        <View style={styles.passkeyLoadingContainer}>
          <ThemedText style={{ color: theme.textSecondary }}>Loading...</ThemedText>
        </View>
      ) : passkeys.length > 0 ? (
        <View style={styles.passkeyList}>
          {passkeys.map((passkey) => (
            <View 
              key={passkey.id} 
              style={[styles.passkeyItem, { backgroundColor: theme.backgroundSecondary }]}
            >
              <View style={styles.passkeyItemIcon}>
                <Feather name="smartphone" size={20} color={theme.primary} />
              </View>
              <View style={styles.passkeyItemContent}>
                <ThemedText style={styles.passkeyItemName}>{passkey.deviceName}</ThemedText>
                <ThemedText style={[styles.passkeyItemDate, { color: theme.textSecondary }]}>
                  Added {formatDate(passkey.createdAt)}
                </ThemedText>
              </View>
              <Pressable onPress={() => handleDeletePasskey(passkey.id)} style={styles.passkeyDeleteButton}>
                <Feather name="trash-2" size={18} color={theme.error} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.passkeyEmptyContainer}>
          <Feather name="key" size={40} color={theme.textSecondary} />
          <ThemedText style={[styles.passkeyEmptyText, { color: theme.textSecondary }]}>
            No passkeys registered yet
          </ThemedText>
        </View>
      )}

      {Platform.OS !== "web" ? (
        <Button onPress={() => setShowRegister(true)} style={styles.passkeyButton}>
          Add Passkey
        </Button>
      ) : (
        <View style={[styles.passkeyWebNote, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="info" size={16} color={theme.textSecondary} />
          <ThemedText style={[styles.passkeyWebNoteText, { color: theme.textSecondary }]}>
            Passkey registration requires the mobile app
          </ThemedText>
        </View>
      )}
    </>
  );

  const renderRegisterForm = () => (
    <>
      <View style={styles.passkeyHeader}>
        <ThemedText type="h4" style={styles.passkeyTitle}>Add New Passkey</ThemedText>
        <ThemedText style={[styles.passkeyDescription, { color: theme.textSecondary }]}>
          Give this passkey a name to help you identify it later.
        </ThemedText>
      </View>

      <View style={styles.inputGroup}>
        <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
          Device Name
        </ThemedText>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="e.g., My iPhone, Work Phone"
            placeholderTextColor={theme.textSecondary}
            value={deviceName}
            onChangeText={setDeviceName}
            autoFocus
          />
        </View>
      </View>

      {error ? (
        <ThemedText style={[styles.errorText, { color: theme.error }]}>{error}</ThemedText>
      ) : null}

      <View style={styles.passkeyButtons}>
        <Button 
          onPress={handleRegisterPasskey} 
          disabled={registering || !deviceName.trim()} 
          style={styles.passkeyButton}
        >
          {registering ? "Registering..." : "Register Passkey"}
        </Button>
        <Pressable onPress={() => { setShowRegister(false); setError(null); }} style={styles.passkeyCancelButton}>
          <ThemedText style={{ color: theme.textSecondary }}>Cancel</ThemedText>
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.passkeyFullContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h4">Security</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.passkeyScrollContent}>
          {showRegister ? renderRegisterForm() : renderPasskeyList()}
        </KeyboardAwareScrollViewCompat>
      </ThemedView>
    </Modal>
  );
}

interface TwoFAModalProps {
  visible: boolean;
  onClose: () => void;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  userId?: string;
}

function TwoFAModal({ visible, onClose, isEnabled, onToggle, userId }: TwoFAModalProps) {
  const { theme } = useTheme();
  const [step, setStep] = useState<"initial" | "setup" | "verify" | "disable">("initial");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStep("initial");
      setQrCode(null);
      setSecret(null);
      setVerificationCode("");
      setError(null);
    }
  }, [visible]);

  const handleStartSetup = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("POST", "/api/2fa/setup", { userId });
      const data = await response.json();
      
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup 2FA");
    } finally {
      setLoading(false);
    }
  };

  const parseApiError = (err: unknown): string => {
    if (err instanceof Error) {
      const msg = err.message;
      try {
        const jsonMatch = msg.match(/\{.*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) return parsed.error;
        }
      } catch {}
      if (msg.includes("Invalid")) return "Invalid verification code";
    }
    return "Something went wrong";
  };

  const handleVerifyAndEnable = async () => {
    if (!userId || !secret || verificationCode.length !== 6) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await apiRequest("POST", "/api/2fa/verify", { userId, secret, code: verificationCode });
      
      onToggle(true);
      Alert.alert("Success", "Two-factor authentication has been enabled");
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStartDisable = () => {
    setStep("disable");
    setVerificationCode("");
    setError(null);
  };

  const handleDisable = async () => {
    if (!userId || verificationCode.length !== 6) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await apiRequest("POST", "/api/2fa/disable", { userId, code: verificationCode });
      
      onToggle(false);
      Alert.alert("Success", "Two-factor authentication has been disabled");
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const renderInitialStep = () => (
    <>
      <View style={styles.twoFAHeader}>
        <View style={[styles.twoFAIcon, { backgroundColor: Colors.light.primaryLight }]}>
          <Feather name="shield" size={32} color={Colors.light.primary} />
        </View>
        <ThemedText type="h4" style={styles.twoFATitle}>Two-Factor Authentication</ThemedText>
        <ThemedText style={[styles.twoFADescription, { color: theme.textSecondary }]}>
          Add an extra layer of security using Google Authenticator, Authy, or similar apps.
        </ThemedText>
      </View>
      
      <View style={styles.twoFAStatus}>
        <ThemedText style={{ color: theme.textSecondary }}>Current status: </ThemedText>
        <ThemedText style={{ color: isEnabled ? theme.success : theme.error, fontWeight: "600" }}>
          {isEnabled ? "Enabled" : "Disabled"}
        </ThemedText>
      </View>

      <View style={styles.twoFAButtons}>
        {isEnabled ? (
          <Button onPress={handleStartDisable} style={[styles.twoFAButton, { backgroundColor: theme.error }]}>
            Disable 2FA
          </Button>
        ) : (
          <Button onPress={handleStartSetup} disabled={loading} style={styles.twoFAButton}>
            {loading ? "Loading..." : "Enable 2FA"}
          </Button>
        )}
        <Pressable onPress={onClose} style={styles.twoFACancelButton}>
          <ThemedText style={{ color: theme.textSecondary }}>Cancel</ThemedText>
        </Pressable>
      </View>
    </>
  );

  const renderSetupStep = () => (
    <>
      <View style={styles.twoFAHeader}>
        <ThemedText type="h4" style={styles.twoFATitle}>Scan QR Code</ThemedText>
        <ThemedText style={[styles.twoFADescription, { color: theme.textSecondary }]}>
          Scan this QR code with Google Authenticator, Authy, or any TOTP-compatible app.
        </ThemedText>
      </View>
      
      {qrCode ? (
        <View style={styles.qrCodeContainer}>
          <Image 
            source={{ uri: qrCode }} 
            style={styles.qrCode} 
            resizeMode="contain"
          />
        </View>
      ) : null}

      {secret ? (
        <View style={styles.secretContainer}>
          <ThemedText style={[styles.secretLabel, { color: theme.textSecondary }]}>
            Or enter this code manually:
          </ThemedText>
          <ThemedText style={styles.secretCode}>{secret}</ThemedText>
        </View>
      ) : null}

      <View style={styles.inputGroup}>
        <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>
          Enter the 6-digit code from your app
        </ThemedText>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text, textAlign: "center", letterSpacing: 8 }]}
            placeholder="000000"
            placeholderTextColor={theme.textSecondary}
            value={verificationCode}
            onChangeText={(text) => setVerificationCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>
      </View>

      {error ? (
        <ThemedText style={[styles.errorText, { color: theme.error }]}>{error}</ThemedText>
      ) : null}

      <View style={styles.twoFAButtons}>
        <Button 
          onPress={handleVerifyAndEnable} 
          disabled={loading || verificationCode.length !== 6} 
          style={styles.twoFAButton}
        >
          {loading ? "Verifying..." : "Verify and Enable"}
        </Button>
        <Pressable onPress={() => setStep("initial")} style={styles.twoFACancelButton}>
          <ThemedText style={{ color: theme.textSecondary }}>Back</ThemedText>
        </Pressable>
      </View>
    </>
  );

  const renderDisableStep = () => (
    <>
      <View style={styles.twoFAHeader}>
        <View style={[styles.twoFAIcon, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
          <Feather name="shield-off" size={32} color={theme.error} />
        </View>
        <ThemedText type="h4" style={styles.twoFATitle}>Disable 2FA</ThemedText>
        <ThemedText style={[styles.twoFADescription, { color: theme.textSecondary }]}>
          Enter the 6-digit code from your authenticator app to confirm.
        </ThemedText>
      </View>

      <View style={styles.inputGroup}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text, textAlign: "center", letterSpacing: 8 }]}
            placeholder="000000"
            placeholderTextColor={theme.textSecondary}
            value={verificationCode}
            onChangeText={(text) => setVerificationCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>
      </View>

      {error ? (
        <ThemedText style={[styles.errorText, { color: theme.error }]}>{error}</ThemedText>
      ) : null}

      <View style={styles.twoFAButtons}>
        <Button 
          onPress={handleDisable} 
          disabled={loading || verificationCode.length !== 6} 
          style={[styles.twoFAButton, { backgroundColor: theme.error }]}
        >
          {loading ? "Disabling..." : "Disable 2FA"}
        </Button>
        <Pressable onPress={() => setStep("initial")} style={styles.twoFACancelButton}>
          <ThemedText style={{ color: theme.textSecondary }}>Back</ThemedText>
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={styles.twoFAFullContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText type="h4">Security</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        
        <KeyboardAwareScrollViewCompat contentContainerStyle={styles.twoFAScrollContent}>
          {step === "initial" ? renderInitialStep() : null}
          {step === "setup" ? renderSetupStep() : null}
          {step === "disable" ? renderDisableStep() : null}
        </KeyboardAwareScrollViewCompat>
      </ThemedView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { theme, mode, setMode } = useTheme();
  const { user, signOut, updateUser } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  
  const [biometricsEnabled, setBiometricsEnabled] = useState(user?.biometricEnabled || false);
  const [twoFAEnabled, setTwoFAEnabled] = useState(user?.twoFactorEnabled || false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [showPasskeys, setShowPasskeys] = useState(false);

  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    if (Platform.OS === "web") {
      setBiometricsAvailable(false);
      return;
    }
    
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricsAvailable(hasHardware && isEnrolled);
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Run in Expo Go to use biometric authentication");
      return;
    }

    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to enable biometric login",
        fallbackLabel: "Use passcode",
      });

      if (result.success) {
        setBiometricsEnabled(true);
        await updateUser({ biometricEnabled: true });
        Alert.alert("Success", "Biometric authentication enabled");
      }
    } else {
      setBiometricsEnabled(false);
      await updateUser({ biometricEnabled: false });
    }
  };

  const handle2FAToggle = async (enabled: boolean) => {
    setTwoFAEnabled(enabled);
    await updateUser({ twoFactorEnabled: enabled });
  };

  const handleSaveProfile = async (data: { displayName: string; status: string; twitterLink: string; telegramLink: string; profileImage?: string | null }) => {
    try {
      await updateUser(data);
      setShowEditProfile(false);
      Alert.alert("Success", "Profile updated successfully");
    } catch (error) {
      Alert.alert("Error", "Failed to update profile");
    }
  };

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
    navigation.navigate("RecoveryPhrase");
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

  const getAppearanceLabel = () => {
    switch (mode) {
      case "light": return "Light";
      case "dark": return "Dark";
      default: return "System";
    }
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
          <View style={styles.avatarContainer}>
            <Avatar imageUri={user?.profileImage} size={100} />
          </View>
          <ThemedText type="h3" style={styles.profileName}>
            {user?.displayName || user?.email?.split("@")[0] || "User"}
          </ThemedText>
          <ThemedText style={[styles.profileEmail, { color: theme.textSecondary }]}>
            {user?.email}
          </ThemedText>
          {user?.status ? (
            <ThemedText style={[styles.profileStatus, { color: theme.textSecondary }]}>
              {user.status}
            </ThemedText>
          ) : null}
          <Pressable 
            onPress={() => setShowEditProfile(true)}
            style={[styles.editProfileButton, { borderColor: theme.primary }]}
          >
            <Feather name="edit-2" size={14} color={theme.primary} />
            <ThemedText style={[styles.editProfileText, { color: theme.primary }]}>Edit Profile</ThemedText>
          </Pressable>
        </View>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            SECURITY
          </ThemedText>
          <MenuItem
            icon="key"
            title="Recovery Phrase"
            subtitle="Export your wallet backup"
            onPress={handleViewRecoveryPhrase}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="smartphone"
            title="Biometric Authentication"
            subtitle={biometricsAvailable 
              ? (biometricsEnabled ? "Face ID / Touch ID enabled" : "Disabled") 
              : "Not available on this device"
            }
            showArrow={false}
            rightElement={
              <Switch
                value={biometricsEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: theme.backgroundTertiary, true: theme.primary }}
                disabled={!biometricsAvailable}
              />
            }
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="shield"
            title="Two-Factor Authentication"
            subtitle={twoFAEnabled ? "Enabled" : "Disabled"}
            onPress={() => setShow2FA(true)}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="lock"
            title="Passkeys"
            subtitle="Sign in with Face ID or Touch ID"
            onPress={() => setShowPasskeys(true)}
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
            icon="moon"
            title="Appearance"
            subtitle={getAppearanceLabel()}
            onPress={() => setShowAppearance(true)}
          />
        </Card>

        <Card style={styles.section} elevation={1}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            SUPPORT
          </ThemedText>
          <MenuItem
            icon="globe"
            title="Website"
            onPress={() => Linking.openURL("https://swipeme.org")}
          />
          <View style={[styles.menuSeparator, { backgroundColor: theme.border }]} />
          <MenuItem
            icon="mail"
            title="Contact Support"
            onPress={() => Linking.openURL("mailto:marketing@swipeme.org")}
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
          SwipeMe v1.0.0
        </ThemedText>
      </ScrollView>

      <EditProfileModal
        visible={showEditProfile}
        onClose={() => setShowEditProfile(false)}
        onSave={handleSaveProfile}
        initialData={{
          displayName: user?.displayName,
          status: user?.status,
          twitterLink: user?.twitterLink,
          telegramLink: user?.telegramLink,
          profileImage: user?.profileImage,
        }}
      />

      <AppearanceModal
        visible={showAppearance}
        onClose={() => setShowAppearance(false)}
        currentMode={mode}
        onSelect={setMode}
      />

      <TwoFAModal
        visible={show2FA}
        onClose={() => setShow2FA(false)}
        isEnabled={twoFAEnabled}
        onToggle={handle2FAToggle}
        userId={user?.id}
      />

      <PasskeyModal
        visible={showPasskeys}
        onClose={() => setShowPasskeys(false)}
        userId={user?.id}
      />
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
  avatarContainer: {
    position: "relative",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#000000",
  },
  profileName: {
    marginTop: Spacing.md,
  },
  profileEmail: {
    marginTop: Spacing.xs,
  },
  profileStatus: {
    marginTop: Spacing.xs,
    fontStyle: "italic",
  },
  editProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.button,
    borderWidth: 1,
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: "500",
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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: Spacing.lg,
  },
  avatarEditContainer: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  changeAvatarButton: {
    position: "absolute",
    bottom: 0,
    right: "35%",
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  saveButton: {
    marginTop: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  appearanceContainer: {
    width: "85%",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  appearanceHeader: {
    marginBottom: Spacing.lg,
  },
  appearanceOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  appearanceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  appearanceLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  twoFAContainer: {
    width: "85%",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  twoFAHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  twoFAIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  twoFATitle: {
    marginBottom: Spacing.sm,
  },
  twoFADescription: {
    textAlign: "center",
    lineHeight: 22,
  },
  twoFAStatus: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  twoFAButtons: {
    gap: Spacing.sm,
  },
  twoFAButton: {
    width: "100%",
  },
  twoFACancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  twoFAFullContainer: {
    flex: 1,
  },
  twoFAScrollContent: {
    padding: Spacing.lg,
  },
  qrCodeContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    alignSelf: "center",
  },
  qrCode: {
    width: 200,
    height: 200,
  },
  secretContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  secretLabel: {
    fontSize: 12,
    marginBottom: Spacing.xs,
  },
  secretCode: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  passkeyFullContainer: {
    flex: 1,
  },
  passkeyScrollContent: {
    padding: Spacing.lg,
  },
  passkeyHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  passkeyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  passkeyTitle: {
    marginBottom: Spacing.sm,
  },
  passkeyDescription: {
    textAlign: "center",
    lineHeight: 22,
  },
  passkeyLoadingContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  passkeyList: {
    marginBottom: Spacing.lg,
  },
  passkeyItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  passkeyItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  passkeyItemContent: {
    flex: 1,
  },
  passkeyItemName: {
    fontSize: 16,
    fontWeight: "500",
  },
  passkeyItemDate: {
    fontSize: 12,
    marginTop: 2,
  },
  passkeyDeleteButton: {
    padding: Spacing.sm,
  },
  passkeyEmptyContainer: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  passkeyEmptyText: {
    marginTop: Spacing.md,
    fontSize: 14,
  },
  passkeyButton: {
    width: "100%",
  },
  passkeyButtons: {
    gap: Spacing.sm,
  },
  passkeyCancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  passkeyWebNote: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  passkeyWebNoteText: {
    fontSize: 14,
    flex: 1,
  },
});
