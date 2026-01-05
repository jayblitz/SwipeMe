import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, Pressable, TextInput, Modal, Platform, Linking, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, FlatList } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import WebViewBase from "react-native-webview";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { createChat, Contact } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import { ChatsStackParamList } from "@/navigation/ChatsStackNavigator";
import { MainTabParamList } from "@/navigation/MainTabNavigator";
import { DiscoverStackParamList } from "@/navigation/DiscoverStackNavigator";

interface ExtendedWebViewProps extends React.ComponentProps<typeof WebViewBase> {
  onNavigationStateChange?: (navState: { canGoBack: boolean; canGoForward: boolean; url: string }) => void;
}

const WebView = WebViewBase as React.ComponentType<ExtendedWebViewProps>;

type NavigationProp = CompositeNavigationProp<
  CompositeNavigationProp<
    BottomTabNavigationProp<MainTabParamList, "DiscoverTab">,
    NativeStackNavigationProp<DiscoverStackParamList>
  >,
  NativeStackNavigationProp<ChatsStackParamList>
>;

interface MiniApp {
  id: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  category: "finance" | "utilities" | "games" | "social";
}

const MINI_APPS: MiniApp[] = [
  { id: "swap", name: "Swap", icon: "repeat", color: "#6366F1", category: "finance" },
  { id: "bridge", name: "Bridge", icon: "git-merge", color: "#8B5CF6", category: "finance" },
  { id: "stake", name: "Stake", icon: "trending-up", color: "#10B981", category: "finance" },
  { id: "predictions", name: "Predictions", icon: "bar-chart-2", color: "#F59E0B", category: "finance" },
  { id: "calculator", name: "Calculator", icon: "hash", color: "#3B82F6", category: "utilities" },
  { id: "scanner", name: "QR Scanner", icon: "maximize", color: "#EC4899", category: "utilities" },
  { id: "converter", name: "Converter", icon: "refresh-cw", color: "#14B8A6", category: "utilities" },
  { id: "diary", name: "Diary", icon: "book", color: "#F97316", category: "utilities" },
  { id: "browser", name: "Browser", icon: "globe", color: "#6366F1", category: "utilities" },
];

function MiniAppsSection({ onAppPress }: { onAppPress: (app: MiniApp) => void }) {
  return (
    <View style={styles.miniAppsSection}>
      <View style={styles.miniAppsSectionHeader}>
        <ThemedText style={styles.miniAppsSectionTitle}>Mini Apps</ThemedText>
      </View>
      <View style={styles.miniAppsGrid}>
        {MINI_APPS.map((app) => (
          <Pressable
            key={app.id}
            onPress={() => onAppPress(app)}
            style={({ pressed }) => [
              styles.miniAppItem,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.miniAppIcon, { backgroundColor: app.color + "20" }]}>
              <Feather name={app.icon} size={24} color={app.color} />
            </View>
            <ThemedText style={styles.miniAppName} numberOfLines={1}>
              {app.name}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CalculatorMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const handleNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === "0" ? num : display + num);
    }
  };

  const handleOperation = (op: string) => {
    if (previousValue === null) {
      setPreviousValue(display);
    } else if (operation) {
      const result = calculate();
      setDisplay(String(result));
      setPreviousValue(String(result));
    }
    setOperation(op);
    setWaitingForOperand(true);
  };

  const calculate = () => {
    const prev = parseFloat(previousValue || "0");
    const current = parseFloat(display);
    switch (operation) {
      case "+": return prev + current;
      case "-": return prev - current;
      case "*": return prev * current;
      case "/": return current !== 0 ? prev / current : 0;
      default: return current;
    }
  };

  const handleEquals = () => {
    if (operation && previousValue !== null) {
      const result = calculate();
      setDisplay(String(result));
      setPreviousValue(null);
      setOperation(null);
      setWaitingForOperand(true);
    }
  };

  const handleClear = () => {
    setDisplay("0");
    setPreviousValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const handleDecimal = () => {
    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const CalcButton = ({ label, onPress, color, wide }: { label: string; onPress: () => void; color?: string; wide?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.calcButton,
        { backgroundColor: pressed ? theme.backgroundDefault : (color || theme.border) },
        wide ? styles.calcButtonWide : null,
      ]}
    >
      <ThemedText style={[styles.calcButtonText, color ? { color: "#FFFFFF" } : null]}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.calculatorContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.calculatorHeader}>
          <ThemedText type="h4">Calculator</ThemedText>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>
        
        <View style={[styles.calculatorDisplay, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText style={styles.calculatorDisplayText} numberOfLines={1} adjustsFontSizeToFit>
            {display}
          </ThemedText>
        </View>
        
        <View style={styles.calculatorKeypad}>
          <View style={styles.calcRow}>
            <CalcButton label="C" onPress={handleClear} />
            <CalcButton label="+/-" onPress={() => setDisplay(String(-parseFloat(display)))} />
            <CalcButton label="%" onPress={() => setDisplay(String(parseFloat(display) / 100))} />
            <CalcButton label="/" onPress={() => handleOperation("/")} color="#F59E0B" />
          </View>
          <View style={styles.calcRow}>
            <CalcButton label="7" onPress={() => handleNumber("7")} />
            <CalcButton label="8" onPress={() => handleNumber("8")} />
            <CalcButton label="9" onPress={() => handleNumber("9")} />
            <CalcButton label="x" onPress={() => handleOperation("*")} color="#F59E0B" />
          </View>
          <View style={styles.calcRow}>
            <CalcButton label="4" onPress={() => handleNumber("4")} />
            <CalcButton label="5" onPress={() => handleNumber("5")} />
            <CalcButton label="6" onPress={() => handleNumber("6")} />
            <CalcButton label="-" onPress={() => handleOperation("-")} color="#F59E0B" />
          </View>
          <View style={styles.calcRow}>
            <CalcButton label="1" onPress={() => handleNumber("1")} />
            <CalcButton label="2" onPress={() => handleNumber("2")} />
            <CalcButton label="3" onPress={() => handleNumber("3")} />
            <CalcButton label="+" onPress={() => handleOperation("+")} color="#F59E0B" />
          </View>
          <View style={styles.calcRow}>
            <CalcButton label="0" onPress={() => handleNumber("0")} wide />
            <CalcButton label="." onPress={handleDecimal} />
            <CalcButton label="=" onPress={handleEquals} color={Colors.light.primary} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QRScannerMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    
    Alert.alert(
      "QR Code Scanned",
      data,
      [
        {
          text: "Copy to Clipboard",
          onPress: async () => {
            await Clipboard.setStringAsync(data);
            Alert.alert("Copied", "QR data copied to clipboard");
          },
        },
        {
          text: "Scan Again",
          onPress: () => setScanned(false),
        },
        {
          text: "Close",
          onPress: onClose,
          style: "cancel",
        },
      ]
    );
  };

  const handleClose = () => {
    setScanned(false);
    onClose();
  };

  if (Platform.OS === "web") {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.miniAppHeader}>
            <ThemedText type="h4">QR Scanner</ThemedText>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.webFallback}>
            <Feather name="smartphone" size={48} color={theme.textSecondary} />
            <ThemedText style={[styles.webFallbackText, { color: theme.textSecondary }]}>
              Run in Expo Go to use QR Scanner
            </ThemedText>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.miniAppHeader}>
            <ThemedText type="h4">QR Scanner</ThemedText>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.miniAppHeader}>
            <ThemedText type="h4">QR Scanner</ThemedText>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.permissionContainer}>
            <View style={[styles.permissionIcon, { backgroundColor: Colors.light.primaryLight }]}>
              <Feather name="camera" size={40} color={Colors.light.primary} />
            </View>
            <ThemedText type="h3" style={styles.permissionTitle}>Camera Access Required</ThemedText>
            <ThemedText style={[styles.permissionSubtitle, { color: theme.textSecondary }]}>
              Allow camera access to scan QR codes
            </ThemedText>
            {permission.status === "denied" && !permission.canAskAgain ? (
              <Button onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (e) {}
              }} style={styles.permissionButton}>
                Open Settings
              </Button>
            ) : (
              <Button onPress={requestPermission} style={styles.permissionButton}>
                Allow Camera Access
              </Button>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.miniAppHeader}>
          <ThemedText type="h4">QR Scanner</ThemedText>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
          </View>
          <ThemedText style={styles.scanHint}>Point camera at a QR code</ThemedText>
        </View>
      </View>
    </Modal>
  );
}

function PolymarketMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const webViewRef = useRef<any>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webViewHeader}>
          <View style={styles.webViewNavButtons}>
            <Pressable 
              onPress={() => webViewRef.current?.goBack()} 
              style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
              disabled={!canGoBack}
            >
              <Feather name="chevron-left" size={24} color={canGoBack ? theme.text : theme.textSecondary} />
            </Pressable>
            <Pressable 
              onPress={() => webViewRef.current?.goForward()} 
              style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
              disabled={!canGoForward}
            >
              <Feather name="chevron-right" size={24} color={canGoForward ? theme.text : theme.textSecondary} />
            </Pressable>
            <Pressable onPress={() => webViewRef.current?.reload()} style={styles.navButton}>
              <Feather name="refresh-cw" size={20} color={theme.text} />
            </Pressable>
          </View>
          <ThemedText type="h4" style={styles.webViewTitle}>Predictions</ThemedText>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>
        <WebView
          ref={webViewRef}
          source={{ uri: "https://polymarket.com" }}
          style={styles.webView}
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
            setCanGoForward(navState.canGoForward);
          }}
        />
      </View>
    </Modal>
  );
}

function BrowserMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const webViewRef = useRef<any>(null);
  const [url, setUrl] = useState("https://google.com");
  const [inputUrl, setInputUrl] = useState("https://google.com");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const handleGo = () => {
    let newUrl = inputUrl.trim();
    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
      newUrl = "https://" + newUrl;
    }
    setUrl(newUrl);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.browserHeader}>
            <View style={styles.webViewNavButtons}>
              <Pressable 
                onPress={() => webViewRef.current?.goBack()} 
                style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
                disabled={!canGoBack}
              >
                <Feather name="chevron-left" size={24} color={canGoBack ? theme.text : theme.textSecondary} />
              </Pressable>
              <Pressable 
                onPress={() => webViewRef.current?.goForward()} 
                style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
                disabled={!canGoForward}
              >
                <Feather name="chevron-right" size={24} color={canGoForward ? theme.text : theme.textSecondary} />
              </Pressable>
              <Pressable onPress={() => webViewRef.current?.reload()} style={styles.navButton}>
                <Feather name="refresh-cw" size={20} color={theme.text} />
              </Pressable>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={[styles.urlBar, { backgroundColor: theme.backgroundDefault }]}>
            <TextInput
              style={[styles.urlInput, { color: theme.text }]}
              value={inputUrl}
              onChangeText={setInputUrl}
              onSubmitEditing={handleGo}
              placeholder="Enter URL"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Pressable onPress={handleGo} style={[styles.goButton, { backgroundColor: theme.primary }]}>
              <Feather name="arrow-right" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
          <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={styles.webView}
            onNavigationStateChange={(navState) => {
              setCanGoBack(navState.canGoBack);
              setCanGoForward(navState.canGoForward);
              if (navState.url !== inputUrl) {
                setInputUrl(navState.url);
              }
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  USD: { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.50, ETH: 0.00028, BTC: 0.000011 },
  EUR: { USD: 1.09, EUR: 1, GBP: 0.86, JPY: 162.50, ETH: 0.00031, BTC: 0.000012 },
  GBP: { USD: 1.27, EUR: 1.16, GBP: 1, JPY: 189.20, ETH: 0.00036, BTC: 0.000014 },
  JPY: { USD: 0.0067, EUR: 0.0062, GBP: 0.0053, JPY: 1, ETH: 0.0000019, BTC: 0.000000074 },
  ETH: { USD: 3550, EUR: 3260, GBP: 2800, JPY: 530000, ETH: 1, BTC: 0.038 },
  BTC: { USD: 93000, EUR: 85500, GBP: 73400, JPY: 13900000, ETH: 26.2, BTC: 1 },
};

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "ETH", "BTC"];

function ConverterMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [amount, setAmount] = useState("1");
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("EUR");

  const convert = () => {
    const numAmount = parseFloat(amount) || 0;
    const rate = EXCHANGE_RATES[fromCurrency]?.[toCurrency] || 0;
    return (numAmount * rate).toFixed(toCurrency === "BTC" ? 8 : toCurrency === "ETH" ? 6 : 2);
  };

  const swapCurrencies = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.miniAppHeader}>
          <ThemedText type="h4">Converter</ThemedText>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>
        
        <View style={styles.converterContent}>
          <View style={[styles.converterCard, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={[styles.converterLabel, { color: theme.textSecondary }]}>From</ThemedText>
            <TextInput
              style={[styles.converterInput, { color: theme.text }]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setFromCurrency(c)}
                  style={[
                    styles.currencyChip,
                    { 
                      backgroundColor: fromCurrency === c ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <ThemedText style={[styles.currencyChipText, { color: fromCurrency === c ? "#FFFFFF" : theme.text }]}>
                    {c}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Pressable onPress={swapCurrencies} style={[styles.swapButton, { backgroundColor: theme.primary }]}>
            <Feather name="repeat" size={20} color="#FFFFFF" />
          </Pressable>

          <View style={[styles.converterCard, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={[styles.converterLabel, { color: theme.textSecondary }]}>To</ThemedText>
            <ThemedText style={styles.converterResult}>{convert()}</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyPicker}>
              {CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setToCurrency(c)}
                  style={[
                    styles.currencyChip,
                    { 
                      backgroundColor: toCurrency === c ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <ThemedText style={[styles.currencyChipText, { color: toCurrency === c ? "#FFFFFF" : theme.text }]}>
                    {c}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ThemedText style={[styles.rateInfo, { color: theme.textSecondary }]}>
            1 {fromCurrency} = {EXCHANGE_RATES[fromCurrency]?.[toCurrency]?.toFixed(toCurrency === "BTC" ? 8 : toCurrency === "ETH" ? 6 : 4)} {toCurrency}
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}

interface DiaryEntry {
  id: string;
  date: string;
  content: string;
}

const DIARY_STORAGE_KEY = "swipeme_diary_entries";

function DiaryMiniApp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryContent, setNewEntryContent] = useState("");

  useEffect(() => {
    if (visible) {
      setIsAuthenticated(false);
      setEntries([]);
      authenticate();
    } else {
      setEntries([]);
      setIsAuthenticated(false);
    }
  }, [visible]);

  const authenticate = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Not Available",
        "Biometric authentication is only available on mobile devices. Please use Expo Go to access your diary securely."
      );
      return;
    }

    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          "No Biometrics",
          "Please set up biometric authentication (fingerprint or face) on your device to use the secure diary."
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to access your diary",
        fallbackLabel: "Use Passcode",
      });

      if (result.success) {
        setIsAuthenticated(true);
        await loadEntries();
      }
    } catch (error) {
      console.error("Authentication error:", error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const loadEntries = async () => {
    try {
      const stored = await SecureStore.getItemAsync(DIARY_STORAGE_KEY);
      if (stored) {
        setEntries(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load diary entries:", error);
    }
  };

  const saveEntry = async () => {
    if (!newEntryContent.trim()) return;

    const newEntry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      content: newEntryContent.trim(),
    };

    const updatedEntries = [newEntry, ...entries];
    setEntries(updatedEntries);

    try {
      await SecureStore.setItemAsync(DIARY_STORAGE_KEY, JSON.stringify(updatedEntries));
    } catch (error) {
      console.error("Failed to save diary entry:", error);
    }

    setNewEntryContent("");
    setShowNewEntry(false);
  };

  const deleteEntry = async (id: string) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const updatedEntries = entries.filter((e) => e.id !== id);
            setEntries(updatedEntries);
            try {
              await SecureStore.setItemAsync(DIARY_STORAGE_KEY, JSON.stringify(updatedEntries));
            } catch (error) {
              console.error("Failed to delete diary entry:", error);
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    setEntries([]);
    setIsAuthenticated(false);
    setShowNewEntry(false);
    setNewEntryContent("");
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      weekday: "short", 
      month: "short", 
      day: "numeric",
      year: "numeric",
    });
  };

  if (!isAuthenticated) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.miniAppHeader}>
            <ThemedText type="h4">Diary</ThemedText>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <View style={styles.authContainer}>
            {isAuthenticating ? (
              <>
                <ActivityIndicator size="large" color={theme.primary} />
                <ThemedText style={[styles.authText, { color: theme.textSecondary }]}>
                  Authenticating...
                </ThemedText>
              </>
            ) : Platform.OS === "web" ? (
              <>
                <View style={[styles.authIcon, { backgroundColor: Colors.light.primaryLight }]}>
                  <Feather name="smartphone" size={40} color={Colors.light.primary} />
                </View>
                <ThemedText type="h3" style={styles.authTitle}>Mobile Only</ThemedText>
                <ThemedText style={[styles.authSubtitle, { color: theme.textSecondary, textAlign: "center" }]}>
                  The secure diary requires biometric authentication which is only available on mobile devices.
                </ThemedText>
                <ThemedText style={[styles.authSubtitle, { color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }]}>
                  Please use Expo Go on your phone to access your diary.
                </ThemedText>
              </>
            ) : (
              <>
                <View style={[styles.authIcon, { backgroundColor: Colors.light.primaryLight }]}>
                  <Feather name="lock" size={40} color={Colors.light.primary} />
                </View>
                <ThemedText type="h3" style={styles.authTitle}>Protected Diary</ThemedText>
                <ThemedText style={[styles.authSubtitle, { color: theme.textSecondary }]}>
                  Use biometric authentication to access your diary
                </ThemedText>
                <Button onPress={authenticate} style={styles.authButton}>
                  Authenticate
                </Button>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.miniAppContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.diaryHeader}>
            <ThemedText type="h4">Diary</ThemedText>
            <View style={styles.diaryHeaderButtons}>
              <Pressable 
                onPress={() => setShowNewEntry(true)} 
                style={[styles.addButton, { backgroundColor: theme.primary }]}
              >
                <Feather name="plus" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
          </View>

          {showNewEntry ? (
            <View style={styles.newEntryContainer}>
              <TextInput
                style={[styles.newEntryInput, { backgroundColor: theme.backgroundDefault, color: theme.text }]}
                placeholder="Write your thoughts..."
                placeholderTextColor={theme.textSecondary}
                value={newEntryContent}
                onChangeText={setNewEntryContent}
                multiline
                autoFocus
              />
              <View style={styles.newEntryButtons}>
                <Pressable 
                  onPress={() => { setShowNewEntry(false); setNewEntryContent(""); }} 
                  style={[styles.newEntryBtn, { backgroundColor: theme.border }]}
                >
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable 
                  onPress={saveEntry} 
                  style={[styles.newEntryBtn, { backgroundColor: theme.primary }]}
                >
                  <ThemedText style={{ color: "#FFFFFF" }}>Save</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.entriesList}
            ListEmptyComponent={
              <View style={styles.emptyDiary}>
                <Feather name="book-open" size={48} color={theme.textSecondary} />
                <ThemedText style={[styles.emptyDiaryText, { color: theme.textSecondary }]}>
                  No entries yet. Tap + to add your first entry.
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.diaryEntry, { backgroundColor: theme.backgroundDefault }]}>
                <View style={styles.entryHeader}>
                  <ThemedText style={[styles.entryDate, { color: theme.textSecondary }]}>
                    {formatDate(item.date)}
                  </ThemedText>
                  <Pressable onPress={() => deleteEntry(item.id)}>
                    <Feather name="trash-2" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText style={styles.entryContent}>{item.content}</ThemedText>
              </View>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FABMenuProps {
  visible: boolean;
  onClose: () => void;
  onNewContact: () => void;
  onNewGroup: () => void;
  onPayAnyone: () => void;
}

function FABMenu({ visible, onClose, onNewContact, onNewGroup, onPayAnyone }: FABMenuProps) {
  const { theme } = useTheme();

  const menuItems = [
    { icon: "user" as const, label: "New Contact", onPress: onNewContact },
    { icon: "users" as const, label: "New Group", onPress: onNewGroup },
    { icon: "send" as const, label: "Pay Anyone", onPress: onPayAnyone },
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

interface NewGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateGroup: (name: string, selectedContacts: Contact[]) => void;
}

function NewGroupModal({ visible, onClose, onCreateGroup }: NewGroupModalProps) {
  const { theme } = useTheme();
  const [groupName, setGroupName] = useState("");

  const handleClose = () => {
    setGroupName("");
    onClose();
  };

  const handleCreate = () => {
    if (!groupName.trim()) {
      Alert.alert("Error", "Please enter a group name");
      return;
    }
    onCreateGroup(groupName.trim(), []);
    handleClose();
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
        <View style={[styles.newGroupModalContainer, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
            <ThemedText type="h4">New Group</ThemedText>
            <Pressable 
              onPress={handleCreate}
              style={styles.createButton}
              disabled={!groupName.trim()}
            >
              <ThemedText style={{ color: groupName.trim() ? theme.primary : theme.textSecondary, fontWeight: "600" }}>
                Create
              </ThemedText>
            </Pressable>
          </View>

          <View style={[styles.groupNameContainer, { backgroundColor: theme.backgroundDefault }]}>
            <TextInput
              style={[styles.groupNameInput, { color: theme.text }]}
              placeholder="Group Name"
              placeholderTextColor={theme.textSecondary}
              value={groupName}
              onChangeText={setGroupName}
              autoCapitalize="words"
            />
          </View>

          <ThemedText style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Group members can be added after creation
          </ThemedText>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DiscoverScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  
  const [showMenu, setShowMenu] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [showDiary, setShowDiary] = useState(false);

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
    setShowNewGroup(true);
  };

  const handleCreateGroup = async (groupName: string, selectedContacts: Contact[]) => {
    Alert.alert(
      "Group Created",
      `Group "${groupName}" created with ${selectedContacts.length} member(s).`
    );
  };

  const handlePayAnyone = () => {
    navigation.navigate("WalletTab" as any);
  };

  const handleMiniAppPress = (app: MiniApp) => {
    switch (app.id) {
      case "calculator":
        setShowCalculator(true);
        break;
      case "scanner":
        setShowScanner(true);
        break;
      case "predictions":
        setShowPredictions(true);
        break;
      case "browser":
        setShowBrowser(true);
        break;
      case "converter":
        setShowConverter(true);
        break;
      case "diary":
        setShowDiary(true);
        break;
      case "swap":
      case "bridge":
      case "stake":
        Alert.alert(
          "Coming Soon",
          `${app.name} will be available soon!`,
          [{ text: "OK" }]
        );
        break;
      default:
        Alert.alert(
          app.name,
          `${app.name} mini-app coming soon!`,
          [{ text: "OK" }]
        );
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerHeight + Spacing.md,
            paddingBottom: tabBarHeight + Spacing.xl + 70,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MiniAppsSection onAppPress={handleMiniAppPress} />
      </ScrollView>

      <FABMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onNewContact={handleNewContact}
        onNewGroup={handleNewGroup}
        onPayAnyone={handlePayAnyone}
      />

      <NewContactModal
        visible={showNewContact}
        onClose={() => setShowNewContact(false)}
        onStartChat={handleStartChatWithUser}
      />

      <NewGroupModal
        visible={showNewGroup}
        onClose={() => setShowNewGroup(false)}
        onCreateGroup={handleCreateGroup}
      />

      <CalculatorMiniApp
        visible={showCalculator}
        onClose={() => setShowCalculator(false)}
      />

      <QRScannerMiniApp
        visible={showScanner}
        onClose={() => setShowScanner(false)}
      />

      <PolymarketMiniApp
        visible={showPredictions}
        onClose={() => setShowPredictions(false)}
      />

      <BrowserMiniApp
        visible={showBrowser}
        onClose={() => setShowBrowser(false)}
      />

      <ConverterMiniApp
        visible={showConverter}
        onClose={() => setShowConverter(false)}
      />

      <DiaryMiniApp
        visible={showDiary}
        onClose={() => setShowDiary(false)}
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
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },
  miniAppsSection: {
    marginBottom: Spacing.lg,
  },
  miniAppsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  miniAppsSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  miniAppsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  miniAppItem: {
    width: "22%",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  miniAppIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  miniAppName: {
    fontSize: 12,
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
  newGroupModalContainer: {
    flex: 1,
    paddingTop: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  createButton: {
    padding: Spacing.xs,
  },
  groupNameContainer: {
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
  },
  groupNameInput: {
    height: 48,
    fontSize: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "400",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  calculatorContainer: {
    flex: 1,
    padding: Spacing.lg,
  },
  calculatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  calculatorDisplay: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    minHeight: 80,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  calculatorDisplayText: {
    fontSize: 48,
    fontWeight: "300",
  },
  calculatorKeypad: {
    flex: 1,
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  calcButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    maxHeight: 80,
  },
  calcButtonWide: {
    flex: 2.1,
    aspectRatio: undefined,
  },
  calcButtonText: {
    fontSize: 28,
    fontWeight: "500",
  },
  miniAppContainer: {
    flex: 1,
  },
  miniAppHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  webFallbackText: {
    marginTop: Spacing.md,
    textAlign: "center",
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
  },
  scanHint: {
    position: "absolute",
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 16,
  },
  webViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  webViewNavButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  webViewTitle: {
    flex: 1,
    textAlign: "center",
  },
  navButton: {
    padding: Spacing.xs,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  webView: {
    flex: 1,
  },
  browserHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    paddingTop: Spacing.lg,
  },
  urlBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    paddingLeft: Spacing.md,
    height: 44,
  },
  urlInput: {
    flex: 1,
    fontSize: 14,
    height: "100%",
  },
  goButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.xs,
  },
  converterContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  converterCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  converterLabel: {
    fontSize: 14,
    marginBottom: Spacing.sm,
  },
  converterInput: {
    fontSize: 32,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  converterResult: {
    fontSize: 32,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  currencyPicker: {
    flexDirection: "row",
  },
  currencyChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  currencyChipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  swapButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginVertical: Spacing.sm,
  },
  rateInfo: {
    textAlign: "center",
    marginTop: Spacing.md,
    fontSize: 14,
  },
  authContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  authIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  authTitle: {
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  authSubtitle: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  authText: {
    marginTop: Spacing.md,
  },
  authButton: {
    width: "100%",
  },
  diaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
  },
  diaryHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  newEntryContainer: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  newEntryInput: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    minHeight: 120,
    fontSize: 16,
    textAlignVertical: "top",
  },
  newEntryButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  newEntryBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  entriesList: {
    padding: Spacing.lg,
    paddingTop: 0,
  },
  emptyDiary: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
  },
  emptyDiaryText: {
    marginTop: Spacing.md,
    textAlign: "center",
    lineHeight: 22,
  },
  diaryEntry: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  entryDate: {
    fontSize: 12,
  },
  entryContent: {
    fontSize: 16,
    lineHeight: 24,
  },
});
