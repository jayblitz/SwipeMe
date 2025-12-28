import React, { useEffect, useMemo, memo } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const PARTICLE_SYMBOLS = ["$", "+", "*", "$", "+", "*", "$", "+"];
const PARTICLE_COLORS = [
  "#10B981", "#34D399", "#6EE7B7",
  "#6366F1", "#8B5CF6", "#A855F7",
  "#F59E0B", "#FBBF24",
];

interface ParticleData {
  id: number;
  delay: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  finalScale: number;
  rotation: number;
  symbol: string;
  color: string;
}

function generateParticles(centerX: number, centerY: number): ParticleData[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: i,
    delay: (i % 4) * 50,
    startX: centerX + ((i % 5) - 2) * 15,
    startY: centerY + ((i % 3) - 1) * 20,
    targetX: ((i % 2 === 0 ? 1 : -1) * (80 + (i * 15) % 100)),
    targetY: -(150 + (i * 20) % 150),
    finalScale: 1.0 + (i % 4) * 0.15,
    rotation: ((i % 2 === 0 ? 1 : -1) * (180 + (i * 45) % 360)),
    symbol: PARTICLE_SYMBOLS[i % PARTICLE_SYMBOLS.length],
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }));
}

interface ParticleProps {
  data: ParticleData;
}

const Particle = memo(function Particle({ data }: ParticleProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(data.delay, withTiming(1, { duration: 100 }));
    scale.value = withDelay(data.delay, withSpring(data.finalScale, {
      damping: 10,
      stiffness: 100,
    }));
    translateY.value = withDelay(data.delay, withTiming(data.targetY, {
      duration: 1200,
      easing: Easing.out(Easing.quad),
    }));
    translateX.value = withDelay(data.delay, withTiming(data.targetX, {
      duration: 1200,
      easing: Easing.out(Easing.quad),
    }));
    rotation.value = withDelay(data.delay, withTiming(data.rotation, {
      duration: 1200,
    }));
    opacity.value = withDelay(data.delay + 800, withTiming(0, { duration: 400 }));
    
    return () => {
      cancelAnimation(translateY);
      cancelAnimation(translateX);
      cancelAnimation(scale);
      cancelAnimation(opacity);
      cancelAnimation(rotation);
    };
  }, [data]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: data.startX, top: data.startY },
        animatedStyle,
      ]}
    >
      <ThemedText style={[styles.particleText, { color: data.color }]}>
        {data.symbol}
      </ThemedText>
    </Animated.View>
  );
});

interface PaymentCelebrationProps {
  visible: boolean;
  onComplete?: () => void;
}

export const PaymentCelebration = memo(function PaymentCelebration({ visible, onComplete }: PaymentCelebrationProps) {
  const centerX = SCREEN_WIDTH / 2 - 12;
  const centerY = SCREEN_HEIGHT / 2;
  
  const particles = useMemo(() => generateParticles(centerX, centerY), [centerX, centerY]);

  useEffect(() => {
    if (!visible) return;
    
    const timer = setTimeout(() => {
      onComplete?.();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [visible, onComplete]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((particle) => (
        <Particle key={particle.id} data={particle} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    pointerEvents: "none",
  },
  particle: {
    position: "absolute",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  particleText: {
    fontSize: 20,
    fontWeight: "700",
  },
});
