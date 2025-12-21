const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === './hooks' && context.originModulePath.includes('async-storage')) {
    return {
      filePath: require.resolve('@react-native-async-storage/async-storage/lib/module/hooks.js'),
      type: 'sourceFile',
    };
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
