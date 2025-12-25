import React, { useState } from "react";
import { View, StyleSheet, Image, TextInput, Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";

let Passkey: any = null;
if (Platform.OS !== "web") {
  try {
    Passkey = require("react-native-passkeys").Passkey;
  } catch (e) {
    console.log("react-native-passkeys not available");
  }
}

type AuthStep = 
  | "login-email" 
  | "login-password" 
  | "login-2fa"
  | "signup-email" 
  | "signup-verify" 
  | "signup-password";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { signIn, verify2FA, signInWithPasskey, startSignUp, verifyCode, completeSignUp, isLoading } = useAuth();
  
  const [step, setStep] = useState<AuthStep>("login-email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleEmailContinue = () => {
    setError("");
    
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    
    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    
    setStep("login-password");
  };

  const handleLogin = async () => {
    setError("");
    
    if (!password) {
      setError("Please enter your password");
      return;
    }
    
    try {
      const result = await signIn(email.trim(), password);
      
      if (result.requires2FA && result.userId) {
        setPendingUserId(result.userId);
        setStep("login-2fa");
      }
    } catch (err: any) {
      setError(err.message || "Incorrect email or password");
    }
  };

  const handle2FAVerify = async () => {
    setError("");
    
    if (twoFACode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    
    if (!pendingUserId) {
      setError("Session expired. Please login again.");
      setStep("login-email");
      return;
    }
    
    try {
      await verify2FA(pendingUserId, twoFACode);
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    }
  };

  const handlePasskeyLogin = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not Available", "Passkey login requires the mobile app. Please download the app to use passkey authentication.");
      return;
    }
    
    if (!Passkey) {
      Alert.alert("Not Available", "Passkey authentication requires a development build. Please use the Android or iOS app.");
      return;
    }
    
    const isSupported = Passkey.isSupported();
    if (!isSupported) {
      Alert.alert("Not Supported", "Your device does not support passkey authentication.");
      return;
    }
    
    setError("");
    
    try {
      const response = await apiRequest("POST", "/api/auth/passkey/login/options", {});
      const data = await response.json();
      
      if (!data.success || !data.options) {
        Alert.alert("No Passkeys", "No passkeys found. Please log in with your email and password, then set up a passkey in your profile settings.");
        return;
      }
      
      const result = await Passkey.get({
        ...data.options,
        challenge: data.options.challenge,
      });
      
      if (result && result.id && result.response) {
        await signInWithPasskey(
          result.id,
          result.rawId,
          result.response.authenticatorData,
          result.response.clientDataJSON,
          result.response.signature
        );
      } else {
        throw new Error("Passkey authentication failed");
      }
    } catch (err: any) {
      if (err.message?.includes("cancelled") || err.message?.includes("cancel")) {
        return;
      }
      console.error("Passkey login error:", err);
      setError("Passkey authentication failed. Please try logging in with email and password.");
    }
  };

  const handleStartSignUp = async () => {
    setError("");
    
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    
    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    
    try {
      await startSignUp(email.trim());
      setStep("signup-verify");
    } catch (err: any) {
      setError(err.message || "Failed to send verification code");
    }
  };

  const handleVerifyCode = async () => {
    setError("");
    
    if (verificationCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    
    try {
      await verifyCode(email.trim(), verificationCode);
      setStep("signup-password");
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    }
  };

  const handleCompleteSignUp = async () => {
    setError("");
    
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    try {
      await completeSignUp(email.trim(), verificationCode, password);
    } catch (err: any) {
      setError(err.message || "Signup failed");
    }
  };

  const handleResendCode = async () => {
    setError("");
    try {
      await startSignUp(email.trim());
      Alert.alert("Code Sent", "A new verification code has been sent to your email");
    } catch (err: any) {
      setError(err.message || "Failed to resend code");
    }
  };

  const switchToSignUp = () => {
    setStep("signup-email");
    setError("");
    setPassword("");
    setVerificationCode("");
    setTwoFACode("");
    setPendingUserId(null);
  };

  const switchToLogin = () => {
    setStep("login-email");
    setError("");
    setPassword("");
    setVerificationCode("");
    setTwoFACode("");
    setPendingUserId(null);
  };

  const goBack = () => {
    setError("");
    if (step === "login-password") {
      setStep("login-email");
      setPassword("");
    } else if (step === "login-2fa") {
      setStep("login-password");
      setTwoFACode("");
    } else if (step === "signup-verify") {
      setStep("signup-email");
    } else if (step === "signup-password") {
      setStep("signup-verify");
    } else {
      setStep("login-email");
    }
  };

  const renderLoginEmailForm = () => (
    <>
      <View style={styles.header}>
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <ThemedText type="h2" style={styles.title}>Log in</ThemedText>
      </View>

      <View style={styles.form}>
        <ThemedText style={[styles.inputLabel, { color: theme.textSecondary }]}>Email</ThemedText>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Enter your email"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={(text) => { setEmail(text); setError(""); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {email.length > 0 ? (
            <Pressable onPress={() => setEmail("")} style={styles.clearButton}>
              <Feather name="x" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handleEmailContinue} disabled={isLoading} style={styles.continueButton}>
          Continue
        </Button>

        <View style={styles.dividerContainer}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <ThemedText style={[styles.dividerText, { color: theme.textSecondary }]}>or</ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <Pressable 
          style={[styles.alternativeButton, { borderColor: theme.border }]} 
          onPress={handlePasskeyLogin}
        >
          <Feather name="key" size={20} color={theme.text} />
          <ThemedText style={styles.alternativeButtonText}>Continue with Passkey</ThemedText>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={switchToSignUp}>
          <ThemedText style={{ color: Colors.light.primary }}>Create a SwipeMe Account</ThemedText>
        </Pressable>
      </View>

      <View style={styles.features}>
        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: Colors.light.primaryLight }]}>
            <Feather name="shield" size={18} color={Colors.light.primary} />
          </View>
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>End-to-end encrypted</ThemedText>
        </View>
        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: Colors.light.primaryLight }]}>
            <Feather name="zap" size={18} color={Colors.light.primary} />
          </View>
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>Instant payments</ThemedText>
        </View>
        <View style={styles.featureItem}>
          <View style={[styles.featureIcon, { backgroundColor: Colors.light.primaryLight }]}>
            <Feather name="lock" size={18} color={Colors.light.primary} />
          </View>
          <ThemedText style={[styles.featureText, { color: theme.textSecondary }]}>Self-custodial wallet</ThemedText>
        </View>
      </View>
    </>
  );

  const renderLoginPasswordForm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
      </View>

      <ThemedText type="h3" style={styles.stepTitle}>Enter your password</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        {email}
      </ThemedText>

      <View style={styles.form}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={(text) => { setPassword(text); setError(""); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoFocus
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handleLogin} disabled={isLoading} style={styles.submitButton}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Log In"}
        </Button>
      </View>
    </>
  );

  const renderLogin2FAForm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.securityIconContainer}>
        <View style={[styles.securityIcon, { backgroundColor: Colors.light.primaryLight }]}>
          <Feather name="shield" size={32} color={Colors.light.primary} />
        </View>
      </View>

      <ThemedText type="h3" style={[styles.stepTitle, { textAlign: "center" }]}>Two-Factor Authentication</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary, textAlign: "center" }]}>
        Enter the 6-digit code from your authenticator app
      </ThemedText>

      <View style={styles.form}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="hash" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, styles.codeInput, { color: theme.text }]}
            placeholder="000000"
            placeholderTextColor={theme.textSecondary}
            value={twoFACode}
            onChangeText={(text) => { setTwoFACode(text.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handle2FAVerify} disabled={isLoading || twoFACode.length !== 6} style={styles.submitButton}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Verify"}
        </Button>
      </View>
    </>
  );

  const renderSignUpEmailForm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={switchToLogin} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
          <View style={[styles.stepDot, { backgroundColor: theme.border }]} />
          <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
          <View style={[styles.stepDot, { backgroundColor: theme.border }]} />
        </View>
      </View>

      <ThemedText type="h3" style={styles.stepTitle}>Create your account</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        Enter your email to get started
      </ThemedText>

      <View style={styles.form}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="mail" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            value={email}
            onChangeText={(text) => { setEmail(text); setError(""); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handleStartSignUp} disabled={isLoading} style={styles.submitButton}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Continue"}
        </Button>
      </View>

      <View style={styles.footer}>
        <ThemedText style={{ color: theme.textSecondary }}>Already have an account? </ThemedText>
        <Pressable onPress={switchToLogin}>
          <ThemedText type="link">Log In</ThemedText>
        </Pressable>
      </View>
    </>
  );

  const renderVerifyCodeForm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, styles.stepDotCompleted]}>
            <Feather name="check" size={12} color="#FFFFFF" />
          </View>
          <View style={[styles.stepLine, styles.stepLineActive]} />
          <View style={[styles.stepDot, styles.stepDotActive]} />
          <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
          <View style={[styles.stepDot, { backgroundColor: theme.border }]} />
        </View>
      </View>

      <ThemedText type="h3" style={styles.stepTitle}>Verify your email</ThemedText>
      <ThemedText style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
        We sent a 6-digit code to {email}
      </ThemedText>

      <View style={styles.form}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="hash" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, styles.codeInput, { color: theme.text }]}
            placeholder="000000"
            placeholderTextColor={theme.textSecondary}
            value={verificationCode}
            onChangeText={(text) => { setVerificationCode(text.replace(/[^0-9]/g, "").slice(0, 6)); setError(""); }}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handleVerifyCode} disabled={isLoading || verificationCode.length !== 6} style={styles.submitButton}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Verify"}
        </Button>

        <Pressable onPress={handleResendCode} disabled={isLoading} style={styles.resendButton}>
          <ThemedText style={{ color: Colors.light.primary }}>Resend code</ThemedText>
        </Pressable>
      </View>
    </>
  );

  const renderPasswordForm = () => (
    <>
      <View style={styles.stepHeader}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
      </View>

      <ThemedText type="h3" style={styles.stepTitle}>Create a password</ThemedText>

      <View style={styles.form}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={(text) => { setPassword(text); setError(""); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoFocus
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: error ? Colors.light.error : theme.border }]}>
          <Feather name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Confirm password"
            placeholderTextColor={theme.textSecondary}
            value={confirmPassword}
            onChangeText={(text) => { setConfirmPassword(text); setError(""); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color={Colors.light.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <Button onPress={handleCompleteSignUp} disabled={isLoading} style={styles.submitButton}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Create Account"}
        </Button>
      </View>
    </>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case "login-email":
        return renderLoginEmailForm();
      case "login-password":
        return renderLoginPasswordForm();
      case "login-2fa":
        return renderLogin2FAForm();
      case "signup-email":
        return renderSignUpEmailForm();
      case "signup-verify":
        return renderVerifyCodeForm();
      case "signup-password":
        return renderPasswordForm();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
      >
        {renderCurrentStep()}
      </KeyboardAwareScrollViewCompat>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
    marginTop: Spacing.xl,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: Spacing.xs,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    marginTop: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginRight: Spacing.md,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: Colors.light.primary,
  },
  stepDotCompleted: {
    backgroundColor: Colors.light.success,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: Colors.light.success,
  },
  stepTitle: {
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    marginBottom: Spacing.xl,
  },
  securityIconContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  securityIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    gap: Spacing.md,
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
  codeInput: {
    letterSpacing: 8,
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
  },
  clearButton: {
    padding: Spacing.xs,
  },
  eyeButton: {
    padding: Spacing.xs,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    color: Colors.light.error,
    fontSize: 14,
  },
  continueButton: {
    marginTop: Spacing.sm,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    fontSize: 14,
  },
  alternativeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  alternativeButtonText: {
    fontSize: 16,
  },
  resendButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
  features: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: Spacing["2xl"],
    paddingTop: Spacing.lg,
  },
  featureItem: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 11,
    textAlign: "center",
  },
});
