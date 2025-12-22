import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { BorderRadius } from "@/constants/theme";

const avatarImages: Record<string, any> = {
  coral: require("../../assets/images/avatars/avatar-coral.png"),
  teal: require("../../assets/images/avatars/avatar-teal.png"),
  purple: require("../../assets/images/avatars/avatar-purple.png"),
  amber: require("../../assets/images/avatars/avatar-amber.png"),
  rose: require("../../assets/images/avatars/avatar-rose.png"),
  ocean: require("../../assets/images/avatars/avatar-ocean.png"),
  orange: require("../../assets/images/avatars/avatar-orange.png"),
  green: require("../../assets/images/avatars/avatar-green.png"),
};

interface AvatarProps {
  avatarId?: string;
  imageUri?: string | null;
  size?: number;
}

export function Avatar({ avatarId = "coral", imageUri, size = 48 }: AvatarProps) {
  const imageSource = imageUri 
    ? { uri: imageUri } 
    : (avatarImages[avatarId] || avatarImages.coral);
  
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={imageSource}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
