const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const PHASE_NAME = '[Expo Dev Launcher] Strip Local Network Keys for Release';
const PODFILE_MARK = 'TAMDOK_XCODE_SCRIPT_FIX';
const JSI_MARK = 'TAMDOK_CAPTURE_XCODEBUILD';

function unquote(value) {
  return String(value ?? '').replace(/^"+|"+$/g, '');
}

function resolveJsiScript(projectRoot) {
  try {
    const pkg = require.resolve('expo-modules-jsi/package.json', { paths: [projectRoot] });
    return path.join(path.dirname(pkg), 'apple/scripts/build-xcframework.sh');
  } catch {
    return null;
  }
}

const NESTED_XCODEBUILD = `(cd "$PACKAGE_DIR" && env -i "\${env_args[@]}" \\
    xcodebuild \\
    build \\
    -scheme "$PACKAGE_NAME" \\
    -sdk "$sdk" \\
    -destination "generic/platform=\${destination}" \\
    -derivedDataPath "$DERIVED_DATA_PATH" \\
    -configuration "$CONFIGURATION" \\
    -quiet \\
    -disableAutomaticPackageResolution \\
    -skipPackagePluginValidation \\
    -skipMacroValidation \\
    -parallelizeTargets \\
    SYMROOT="\${BUILD_PRODUCTS_PATH}" \\
    OBJROOT="\${DERIVED_DATA_PATH}/Build/Intermediates.noindex" \\
    BUILD_LIBRARY_FOR_DISTRIBUTION=YES \\
    SKIP_INSTALL=NO \\
    DEBUG_INFORMATION_FORMAT=dwarf-with-dsym \\
    COMPILER_INDEX_STORE_ENABLE=NO \\
    SWIFT_COMPILATION_MODE=wholemodule \\
  )`;

const CAPTURED_XCODEBUILD = `# ${JSI_MARK}: Xcode 27 treats nested \`xcodebuild -quiet\` as
# "failed with exit code 0 but produced no further output" and fails the
# parent archive even when the framework was built. Keep the log unless
# the nested build actually fails.
  mkdir -p "$DERIVED_DATA_PATH"
  local xcodebuild_log="\${DERIVED_DATA_PATH}/xcodebuild-\${platform}.log"
  set +e
  (cd "$PACKAGE_DIR" && env -i "\${env_args[@]}" \\
    xcodebuild \\
    build \\
    -scheme "$PACKAGE_NAME" \\
    -sdk "$sdk" \\
    -destination "generic/platform=\${destination}" \\
    -derivedDataPath "$DERIVED_DATA_PATH" \\
    -configuration "$CONFIGURATION" \\
    -quiet \\
    -disableAutomaticPackageResolution \\
    -skipPackagePluginValidation \\
    -skipMacroValidation \\
    -parallelizeTargets \\
    SYMROOT="\${BUILD_PRODUCTS_PATH}" \\
    OBJROOT="\${DERIVED_DATA_PATH}/Build/Intermediates.noindex" \\
    BUILD_LIBRARY_FOR_DISTRIBUTION=YES \\
    SKIP_INSTALL=NO \\
    DEBUG_INFORMATION_FORMAT=dwarf-with-dsym \\
    COMPILER_INDEX_STORE_ENABLE=NO \\
    SWIFT_COMPILATION_MODE=wholemodule \\
  ) >"\$xcodebuild_log" 2>&1
  local xcodebuild_status=\$?
  set -e
  if [[ \$xcodebuild_status -ne 0 ]]; then
    cat "\$xcodebuild_log"
    log "error: xcodebuild failed for \${platform} (exit \${xcodebuild_status})"
    exit 1
  fi`;

function patchJsiScript(projectRoot) {
  // Idempotent patch: redirect nested xcodebuild stdout so Xcode 27 does not fail the archive.
  const scriptPath = resolveJsiScript(projectRoot);
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return;
  }
  const original = fs.readFileSync(scriptPath, 'utf8');
  if (original.includes(JSI_MARK)) {
    return;
  }
  if (!original.includes('SWIFT_COMPILATION_MODE=wholemodule')) {
    console.warn('[tamdok] expo-modules-jsi build-xcframework.sh changed; skip capture patch');
    return;
  }
  if (!original.includes(NESTED_XCODEBUILD)) {
    console.warn('[tamdok] could not find nested xcodebuild block in expo-modules-jsi');
    return;
  }
  fs.writeFileSync(scriptPath, original.replace(NESTED_XCODEBUILD, CAPTURED_XCODEBUILD));
}

function patchPodfile(podfilePath) {
  if (!fs.existsSync(podfilePath)) {
    return;
  }
  let podfile = fs.readFileSync(podfilePath, 'utf8');
  if (podfile.includes(PODFILE_MARK)) {
    return;
  }
  const snippet = `
  # ${PODFILE_MARK}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |bc|
      bc.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
    end
    target.shell_script_build_phases.each do |phase|
      phase.always_out_of_date = "1"
    end
  end
`;
  if (!podfile.includes('post_install do |installer|')) {
    podfile += `\npost_install do |installer|${snippet}end\n`;
  } else {
    podfile = podfile.replace('post_install do |installer|', `post_install do |installer|${snippet}`);
  }
  fs.writeFileSync(podfilePath, podfile);
}

/**
 * Xcode 27 archive fixes: script phase output rules and ExpoModulesJSI nested xcodebuild noise.
 */
module.exports = function withXcodeScriptPhaseFix(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      patchJsiScript(config.modRequest.projectRoot);
      patchPodfile(path.join(config.modRequest.platformProjectRoot, 'Podfile'));
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    project.addBuildProperty('ENABLE_USER_SCRIPT_SANDBOXING', 'NO');
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const [id, phase] of Object.entries(phases)) {
      if (id.endsWith('_comment') || !phase || typeof phase !== 'object') {
        continue;
      }
      if (unquote(phase.name) === PHASE_NAME) {
        phase.alwaysOutOfDate = 1;
      }
    }
    return config;
  });
};
