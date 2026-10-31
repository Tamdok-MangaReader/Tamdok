const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs the Android release build with the keystore described by Gradle properties
 * (TAMDOK_KEYSTORE_FILE, TAMDOK_KEYSTORE_PASSWORD, TAMDOK_KEY_ALIAS, TAMDOK_KEY_PASSWORD),
 * normally kept in ~/.gradle/gradle.properties. Without them the debug key is used, so
 * development builds keep working. Idempotent across prebuilds.
 */
const MARKER = '// tamdok-release-signing';

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    src = src.replace(
      /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s{8}\}\n/,
      (block) =>
        `${block}        ${MARKER}
        if (project.hasProperty('TAMDOK_KEYSTORE_FILE')) {
            release {
                storeFile file(project.property('TAMDOK_KEYSTORE_FILE'))
                storePassword project.property('TAMDOK_KEYSTORE_PASSWORD')
                keyAlias project.property('TAMDOK_KEY_ALIAS')
                keyPassword project.property('TAMDOK_KEY_PASSWORD')
            }
        }
`,
    );

    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('TAMDOK_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
