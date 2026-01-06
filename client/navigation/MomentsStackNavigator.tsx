import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import FeedScreen from "@/screens/FeedScreen";
import MomentsScreen from "@/screens/MomentsScreen";
import MomentViewScreen from "@/screens/MomentViewScreen";
import CreatePostScreen from "@/screens/CreatePostScreen";
import CreatorProfileScreen from "@/screens/CreatorProfileScreen";
import RecordVideoScreen from "@/screens/RecordVideoScreen";
import VideoPreviewScreen from "@/screens/VideoPreviewScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MomentsStackParamList = {
  Feed: undefined;
  MomentsList: undefined;
  MomentView: { postId: string };
  CreatePost: undefined;
  CreatorProfile: { userId: string };
  RecordVideo: undefined;
  VideoPreview: { videoUri: string };
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
        name="MomentView"
        component={MomentViewScreen}
        options={{ headerTitle: "Moment" }}
      />
      <Stack.Screen
        name="CreatorProfile"
        component={CreatorProfileScreen}
        options={{ headerTitle: "Profile" }}
      />
      <Stack.Screen
        name="RecordVideo"
        component={RecordVideoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VideoPreview"
        component={VideoPreviewScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
