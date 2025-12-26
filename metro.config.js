const { getDefaultConfig } = require('expo/metro-config');
const resolveFrom = require('resolve-from');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './hooks' && context.originModulePath.includes('async-storage')) {
    return {
      filePath: require.resolve('@react-native-async-storage/async-storage/lib/module/hooks.js'),
      type: 'sourceFile',
    };
  }
  
  if (
    moduleName.startsWith("event-target-shim") &&
    context.originModulePath.includes("@videosdk.live/react-native-webrtc")
  ) {
    const updatedModuleName = moduleName.endsWith("/index")
      ? moduleName.replace("/index", "")
      : moduleName;
    
    const eventTargetShimPath = resolveFrom(
      context.originModulePath,
      updatedModuleName
    );
    
    return {
      filePath: eventTargetShimPath,
      type: "sourceFile",
    };
  }

  if (moduleName === "isows") {
    const ctx = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  if (moduleName.startsWith("zustand")) {
    const ctx = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  if (moduleName === "jose") {
    const ctx = {
      ...context,
      unstable_conditionNames: ["browser"],
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
