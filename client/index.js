import "fast-text-encoding";
import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
global.Buffer = Buffer;

import { registerRootComponent } from "expo";
import { Platform } from "react-native";

if (Platform.OS !== "web") {
  try {
    const { register } = require("@videosdk.live/react-native-sdk");
    register();
  } catch (e) {
    console.log("VideoSDK not available:", e.message);
  }
}

import App from "@/App";

registerRootComponent(App);
