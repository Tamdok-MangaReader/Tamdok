const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.assetExts.push('bundle');

const tsconfigPaths = {
  '@/assets': path.resolve(projectRoot, 'assets'),
  '@/parsers': path.resolve(projectRoot, 'parsers'),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [alias, targetDir] of Object.entries(tsconfigPaths)) {
    if (moduleName === alias || moduleName.startsWith(`${alias}/`)) {
      const remainder = moduleName.slice(alias.length).replace(/^\//, '');
      const candidate = path.join(targetDir, remainder);
      return context.resolveRequest(context, candidate, platform);
    }
  }

  if (typeof defaultResolveRequest === 'function') {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
