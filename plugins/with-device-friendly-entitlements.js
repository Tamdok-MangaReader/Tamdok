const { withEntitlementsPlist } = require('expo/config-plugins');

/** Removes capabilities that require special provisioning profiles for local device builds. */
module.exports = function withDeviceFriendlyEntitlements(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    delete config.modResults['com.apple.developer.icloud-container-identifiers'];
    delete config.modResults['com.apple.developer.icloud-services'];
    delete config.modResults['com.apple.developer.ubiquity-container-identifiers'];
    delete config.modResults['com.apple.developer.ubiquity-kvstore-identifier'];
    return config;
  });
};
