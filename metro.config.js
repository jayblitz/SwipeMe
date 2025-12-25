const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './hooks' && context.originModulePath.includes('async-storage')) {
    return {
      filePath: require.resolve('@react-native-async-storage/async-storage/lib/module/hooks.js'),
      type: 'sourceFile',
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

  if (moduleName.startsWith('@privy-io/')) {
    if (platform === 'web') {
      return {
        type: 'empty',
      };
    }
    const ctx = {
      ...context,
      unstable_enablePackageExports: true,
    };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }

  if (moduleName === 'expo-apple-authentication' && platform === 'web') {
    return {
      type: 'empty',
    };
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
