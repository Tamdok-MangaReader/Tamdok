const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Gradle 9 removed `jcenter()`, which @react-native-cookies/cookies (6.2.1, unmaintained)
 * still calls, so the Android build fails while configuring that project.
 * Rewrite it to mavenCentral() on prebuild; idempotent and Android-only.
 */
const PATCHED_LIBRARIES = ['@react-native-cookies/cookies'];

module.exports = function withAndroidGradleCompat(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      for (const name of PATCHED_LIBRARIES) {
        const file = path.join(cfg.modRequest.projectRoot, 'node_modules', name, 'android', 'build.gradle');
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const patched = source.replace(/\bjcenter\(\)/g, 'mavenCentral()');
        if (patched !== source) fs.writeFileSync(file, patched);
      }
      return cfg;
    },
  ]);
};
