import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import FeedScreen from "@/screens/FeedScreen";
import MomentsScreen from "@/screens/MomentsScreen";
import CreatePostScreen from "@/screens/CreatePostScreen";
import CreatorProfileScreen from "@/screens/CreatorProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MomentsStackParamList = {
  Feed: undefined;
  MomentsList: undefined;
  CreatePost: undefined;
  CreatorProfile: { userId: string };
};

const Stack = createNativeStackNavigator<MomentsStackParamList>();

export default function MomentsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Feed"
        component={FeedScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MomentsList"
        component={MomentsScreen}
        options={{ headerTitle: "Moments" }}
      />
      <Stack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{ headerTitle: "New Post" }}
      />
      <Stack.Screen
        name="CreatorProfile"
        component={CreatorProfileScreen}
        options={{ headerTitle: "Profile" }}
      />
    </Stack.Navigator>
  );
}
