import React, { useState } from "react";
import { View, StyleSheet, Image, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

type AuthStep = "login" | "signup-email" | "signup-verify" | "signup-password";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { signIn, startSignUp, verifyCode, completeSignUp, isLoading } = useAuth();
  
  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleLogin = async () => {
    setError("");
    
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    
    if (!validateEmail(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    
    if (!password) {
      setError("Please enter your password");
      return;
    }
    
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err.message || "Incorrect email or password");
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
  };

  const switchToLogin = () => {
    setStep("login");
    setError("");
    setPassword("");
    setVerificationCode("");
  };

  const goBack = () => {
    if (step === "signup-verify") {
      setStep("signup-email");
    } else if (step === "signup-password") {
      setStep("signup-verify");
    } else {
      setStep("login");
    }
    setError("");
  };

  const renderLoginForm = () => (
    <>
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
          />
        </View>

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
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : "Sign In"}
        </Button>
      </View>

      <View style={styles.footer}>
        <ThemedText style={{ color: theme.textSecondary }}>Don't have an account? </ThemedText>
        <Pressable onPress={switchToSignUp}>
          <ThemedText type="link">Sign Up</ThemedText>
        </Pressable>
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
          <ThemedText type="link">Sign In</ThemedText>
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
      case "login":
        return renderLoginForm();
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
        {step === "login" ? (
          <View style={styles.header}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <ThemedText type="h2" style={styles.title}>SwipeMe</ThemedText>
            <ThemedText style={[styles.tagline, { color: Colors.light.primary }]}>
              Just SwipeMe – instant money, straight from your chat
            </ThemedText>
          </View>
        ) : null}

        {renderCurrentStep()}

        {step === "login" ? (
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
        ) : null}
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
  subtitle: {
    textAlign: "center",
  },
  tagline: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "500",
    marginTop: Spacing.sm,
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
  submitButton: {
    marginTop: Spacing.sm,
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
