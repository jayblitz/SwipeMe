import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { MomentsStackParamList } from "@/navigation/MomentsStackNavigator";

const MAX_DURATION = 60;
const MIN_DURATION = 15;

type NavigationProp = NativeStackNavigationProp<MomentsStackParamList, "RecordVideo">;


const TIMER_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "3s", value: 3 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
];

export default function RecordVideoScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedTimer, setSelectedTimer] = useState(0);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  const toggleCameraFacing = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing(current => (current === "back" ? "front" : "back"));
  }, []);

  const toggleFlash = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlash(current => (current === "off" ? "on" : "off"));
  }, []);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsRecording(true);
      setRecordingDuration(0);
      progressAnim.setValue(0);

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_DURATION * 1000,
        useNativeDriver: false,
      }).start();

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          if (newDuration >= MAX_DURATION) {
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);

      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION,
      });

      if (video?.uri) {
        navigation.navigate("VideoPreview", { 
          videoUri: video.uri,
        });
      }
    } catch (error) {
      console.error("Recording error:", error);
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  }, [isRecording, navigation, progressAnim]);

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      progressAnim.stopAnimation();
      setIsRecording(false);
      
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error("Stop recording error:", error);
      setIsRecording(false);
    }
  }, [isRecording, progressAnim]);

  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      if (recordingDuration >= MIN_DURATION) {
        stopRecording();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else {
      if (selectedTimer > 0) {
        setCountdown(selectedTimer);
        countdownTimerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev === null || prev <= 1) {
              if (countdownTimerRef.current) {
                clearInterval(countdownTimerRef.current);
              }
              startRecording();
              return null;
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            return prev - 1;
          });
        }, 1000);
      } else {
        startRecording();
      }
    }
  }, [isRecording, recordingDuration, selectedTimer, startRecording, stopRecording]);

  const handleClose = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    navigation.goBack();
  }, [isRecording, navigation, stopRecording]);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    const isDeniedPermanently = permission.status === "denied" && !permission.canAskAgain;
    
    return (
      <View style={[styles.container, styles.permissionContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="video-off" size={64} color={theme.textSecondary} />
        <Text style={[styles.permissionTitle, { color: theme.text }]}>
          Camera Access Required
        </Text>
        <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
          {isDeniedPermanently 
            ? "Camera access was denied. Please enable it in your device settings."
            : "To record videos, please allow camera access"
          }
        </Text>
        {isDeniedPermanently && Platform.OS !== "web" ? (
          <Pressable
            style={[styles.permissionButton, { backgroundColor: "#FF2D55" }]}
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch (error) {
                console.error("Could not open settings:", error);
              }
            }}
          >
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </Pressable>
        ) : isDeniedPermanently ? (
          <Text style={[styles.permissionHint, { color: theme.textSecondary }]}>
            Run in Expo Go on your device to use camera
          </Text>
        ) : (
          <Pressable
            style={[styles.permissionButton, { backgroundColor: "#FF2D55" }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </Pressable>
        )}
        <Pressable style={styles.closeButtonPermission} onPress={handleClose}>
          <Text style={[styles.closeButtonText, { color: theme.textSecondary }]}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        mode="video"
      >
        <View style={[styles.topControls, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable style={styles.controlButton} onPress={handleClose}>
            <Feather name="x" size={28} color="#FFF" />
          </Pressable>
          
          <View style={styles.topRightControls}>
            <Pressable style={styles.controlButton} onPress={toggleCameraFacing}>
              <Feather name="refresh-cw" size={24} color="#FFF" />
            </Pressable>
            
            <Pressable style={styles.controlButton} onPress={toggleFlash}>
              <Feather name={flash === "on" ? "zap" : "zap-off"} size={24} color="#FFF" />
            </Pressable>
            
            <Pressable 
              style={styles.controlButton} 
              onPress={() => setShowTimerMenu(!showTimerMenu)}
            >
              <Feather name="clock" size={24} color="#FFF" />
              {selectedTimer > 0 ? (
                <View style={styles.controlBadge}>
                  <Text style={styles.controlBadgeText}>{selectedTimer}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {showTimerMenu ? (
          <View style={styles.menuOverlay}>
            <View style={styles.menuContainer}>
              <Text style={styles.menuTitle}>Countdown Timer</Text>
              <View style={styles.menuOptions}>
                {TIMER_OPTIONS.map(option => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.menuOption,
                      selectedTimer === option.value && styles.menuOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedTimer(option.value);
                      setShowTimerMenu(false);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[
                      styles.menuOptionText,
                      selectedTimer === option.value && styles.menuOptionTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {countdown !== null ? (
          <View style={styles.countdownOverlay}>
            <Text style={styles.countdownText}>{countdown}</Text>
          </View>
        ) : null}

        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
          <View 
            style={[
              styles.minDurationMarker, 
              { left: `${(MIN_DURATION / MAX_DURATION) * 100}%` }
            ]} 
          />
        </View>

        <View style={[styles.bottomControls, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.durationContainer}>
            {isRecording ? (
              <View style={styles.durationBadge}>
                <View style={styles.recordingDot} />
                <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
              </View>
            ) : (
              <Text style={styles.hintText}>Hold to record, tap to stop</Text>
            )}
          </View>

          <View style={styles.recordButtonContainer}>
            <Pressable 
              onPress={handleRecordPress}
              style={styles.recordButtonOuter}
            >
              <Animated.View 
                style={[
                  styles.recordButton,
                  isRecording && styles.recordButtonActive,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                {isRecording ? (
                  <View style={styles.stopIcon} />
                ) : null}
              </Animated.View>
            </Pressable>
          </View>

          <View style={styles.bottomHint}>
            {!isRecording ? (
              <Text style={styles.hintTextSmall}>
                Min: {MIN_DURATION}s | Max: {MAX_DURATION}s
              </Text>
            ) : recordingDuration < MIN_DURATION ? (
              <Text style={[styles.hintTextSmall, { color: "#FF9500" }]}>
                Record at least {MIN_DURATION - recordingDuration}s more
              </Text>
            ) : (
              <Text style={[styles.hintTextSmall, { color: "#34C759" }]}>
                Tap to finish
              </Text>
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  permissionText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  permissionHint: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  permissionButton: {
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  permissionButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButtonPermission: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  closeButtonText: {
    fontSize: 16,
  },
  topControls: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  topRightControls: {
    flexDirection: "column",
    alignItems: "center",
    gap: Spacing.md,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FF2D55",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  speedLabel: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  menuContainer: {
    backgroundColor: "rgba(30,30,30,0.95)",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    minWidth: 200,
  },
  menuTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  menuSubtitle: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  menuOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  menuOption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  menuOptionActive: {
    backgroundColor: "#FF2D55",
  },
  menuOptionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "500",
  },
  menuOptionTextActive: {
    fontWeight: "700",
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  countdownText: {
    color: "#FFF",
    fontSize: 120,
    fontWeight: "700",
  },
  progressContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    zIndex: 5,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#FF2D55",
  },
  minDurationMarker: {
    position: "absolute",
    top: 0,
    width: 2,
    height: 8,
    backgroundColor: "#FFF",
    marginTop: -2,
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  durationContainer: {
    marginBottom: Spacing.lg,
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF2D55",
    marginRight: Spacing.sm,
  },
  durationText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  hintText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  recordButtonContainer: {
    marginBottom: Spacing.lg,
  },
  recordButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FF2D55",
  },
  recordButtonActive: {
    borderRadius: 8,
    width: 36,
    height: 36,
  },
  stopIcon: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FF2D55",
    borderRadius: 8,
  },
  bottomHint: {
    marginBottom: Spacing.md,
  },
  hintTextSmall: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    textAlign: "center",
  },
});
