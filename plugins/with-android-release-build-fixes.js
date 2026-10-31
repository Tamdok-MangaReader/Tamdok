const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

/**
 * Release build fixes (Android only):
 * - Expo writes the iOS Info.plist strings (CFBundleName, NS*UsageDescription) into
 *   values-b+xx/strings.xml, and lintVitalRelease fails on them as "ExtraTranslation". They are
 *   unused on Android, so lint must not abort the release build.
 * - Raise the Gradle daemon heap/metaspace, which the release build exhausts.
 */
const MARKER = '// tamdok-lint-fix';

module.exports = function withAndroidReleaseBuildFixes(config) {
  config = withAppBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (!src.includes(MARKER)) {
      cfg.modResults.contents = src.replace(
        /^android \{\n/m,
        `android {\n    ${MARKER}\n    lint {\n        disable 'ExtraTranslation', 'MissingTranslation'\n        abortOnError false\n        checkReleaseBuilds false\n    }\n`,
      );
    }
    return cfg;
  });
  return withGradleProperties(config, (cfg) => {
    const args = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';
    const item = cfg.modResults.find((i) => i.type === 'property' && i.key === 'org.gradle.jvmargs');
    if (item) item.value = args;
    else cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: args });
    return cfg;
  });
};
