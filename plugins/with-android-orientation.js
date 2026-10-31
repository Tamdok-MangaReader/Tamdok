const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Top-level "orientation": "portrait" in app.json also writes screenOrientation=portrait into
 * the Android manifest, which blocks landscape on tablets. Android-only: relax it to
 * "unspecified" and let the app lock portrait at runtime on phones.
 */
module.exports = function withAndroidOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) main.$['android:screenOrientation'] = 'unspecified';
    return cfg;
  });
};
