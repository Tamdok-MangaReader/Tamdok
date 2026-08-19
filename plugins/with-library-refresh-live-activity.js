const { withInfoPlist, withXcodeProject, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_NAME = 'LibraryRefreshWidget';
const SOURCE_FILES = ['LibraryRefreshAttributes.swift', 'LibraryRefreshLiveActivity.swift'];
const FRAMEWORKS = ['WidgetKit.framework', 'SwiftUI.framework', 'ActivityKit.framework'];

function copyWidgetSources(projectRoot, platformProjectRoot) {
  const fromDir = path.join(projectRoot, 'plugins/library-refresh-widget');
  const toDir = path.join(platformProjectRoot, TARGET_NAME);
  const nestedDir = path.join(toDir, TARGET_NAME);
  fs.mkdirSync(toDir, { recursive: true });

  fs.copyFileSync(path.join(fromDir, 'Info.plist'), path.join(toDir, 'Info.plist'));
  for (const file of SOURCE_FILES) {
    fs.copyFileSync(path.join(fromDir, file), path.join(toDir, file));
  }

  if (fs.existsSync(nestedDir)) {
    fs.rmSync(nestedDir, { recursive: true, force: true });
  }
}

function objects(project) {
  return project.hash.project.objects;
}

function nativeTarget(project, name) {
  const section = objects(project).PBXNativeTarget;
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const target = section[key];
    if (target?.name === `"${name}"` || target?.name === name) {
      return { uuid: key, target };
    }
  }
  return null;
}

function firstDevelopmentTeam(project) {
  const configs = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configs)) {
    const team = configs[key]?.buildSettings?.DEVELOPMENT_TEAM;
    if (team) return team;
  }
  return undefined;
}

function commentOf(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.comment ?? '';
}

function valueOf(entry) {
  if (!entry) return undefined;
  if (typeof entry === 'string') return entry;
  return entry.value;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function phaseIdFor(target, comment) {
  return ensureArray(target.buildPhases).find((phase) => commentOf(phase) === comment)?.value;
}

function ensureBuildPhase(project, targetUuid, isa, comment) {
  const objs = objects(project);
  const target = objs.PBXNativeTarget[targetUuid];
  const existing = phaseIdFor(target, comment);
  if (existing) return existing;

  const uuid = project.generateUuid();
  if (!objs[isa]) objs[isa] = {};
  objs[isa][uuid] = {
    isa,
    buildActionMask: 2147483647,
    files: [],
    runOnlyForDeploymentPostprocessing: 0,
  };
  objs[isa][`${uuid}_comment`] = comment;
  target.buildPhases.push({ value: uuid, comment });
  return uuid;
}

function quoted(value) {
  return (value ?? '').replace(/"/g, '');
}

function fileRefByPath(project, filePath) {
  const section = objects(project).PBXFileReference;
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const ref = section[key];
    if (quoted(ref.path) === filePath || quoted(ref.name) === filePath) return key;
  }
  return null;
}

function groupsContaining(project, childUuid) {
  const section = objects(project).PBXGroup;
  const matches = [];
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const group = section[key];
    if (ensureArray(group.children).some((child) => valueOf(child) === childUuid)) {
      matches.push(key);
    }
  }
  return matches;
}

function fileRefInGroup(project, groupUuid, fileName) {
  const group = objects(project).PBXGroup[groupUuid];
  for (const child of ensureArray(group?.children)) {
    const uuid = valueOf(child);
    const ref = objects(project).PBXFileReference[uuid];
    if (!ref) continue;
    if (quoted(ref.name) === fileName || quoted(ref.path) === fileName || commentOf(child) === fileName) {
      return uuid;
    }
  }
  return null;
}

function ensureGroupFileRef(project, groupUuid, fileName, fileType) {
  const existing = fileRefInGroup(project, groupUuid, fileName);
  if (existing && groupsContaining(project, existing).every((uuid) => uuid === groupUuid)) {
    const ref = objects(project).PBXFileReference[existing];
    ref.path = fileName;
    ref.name = fileName;
    ref.sourceTree = '"<group>"';
    ref.lastKnownFileType = fileType;
    return existing;
  }

  if (existing) {
    removeGroupChildren(project, groupUuid, (child) => valueOf(child) === existing);
  }

  const uuid = project.generateUuid();
  objects(project).PBXFileReference[uuid] = {
    isa: 'PBXFileReference',
    explicitFileType: undefined,
    fileEncoding: 4,
    includeInIndex: 0,
    lastKnownFileType: fileType,
    name: fileName,
    path: fileName,
    sourceTree: '"<group>"',
  };
  objects(project).PBXFileReference[`${uuid}_comment`] = fileName;
  ensureGroupChild(project, groupUuid, uuid, fileName);
  return uuid;
}

function restoreTamdokInfoPlist(project, widgetGroupUuid) {
  const section = objects(project).PBXGroup;
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const group = section[key];
    if (group?.name !== 'Tamdok' && group?.name !== '"Tamdok"') continue;

    for (const child of ensureArray(group.children)) {
      if (commentOf(child) !== 'Info.plist') continue;
      const uuid = valueOf(child);
      const ref = objects(project).PBXFileReference[uuid];
      if (ref) {
        ref.path = 'Tamdok/Info.plist';
        ref.name = 'Info.plist';
      }
      removeGroupChildren(project, widgetGroupUuid, (entry) => valueOf(entry) === uuid);
    }
  }
}

function ensureGroupChild(project, groupUuid, childUuid, comment) {
  const group = objects(project).PBXGroup[groupUuid];
  group.children = ensureArray(group.children);
  if (group.children.some((child) => valueOf(child) === childUuid)) return;
  group.children.push({ value: childUuid, comment });
}

function removeGroupChildren(project, groupUuid, predicate) {
  const group = objects(project).PBXGroup[groupUuid];
  group.children = ensureArray(group.children).filter((child) => !predicate(child));
}

function findWidgetGroup(project) {
  const section = objects(project).PBXGroup;
  for (const key of Object.keys(section)) {
    if (key.endsWith('_comment')) continue;
    const group = section[key];
    if (group?.name === `"${TARGET_NAME}"` || group?.name === TARGET_NAME) {
      return { uuid: key, group };
    }
  }
  return null;
}

function ensureWidgetGroup(project) {
  const existing = findWidgetGroup(project);
  if (existing) {
    existing.group.path = TARGET_NAME;
    existing.group.name = TARGET_NAME;
    existing.group.sourceTree = '"<group>"';
    return existing.uuid;
  }

  const uuid = project.generateUuid();
  objects(project).PBXGroup[uuid] = {
    isa: 'PBXGroup',
    children: [],
    name: TARGET_NAME,
    path: TARGET_NAME,
    sourceTree: '"<group>"',
  };
  objects(project).PBXGroup[`${uuid}_comment`] = TARGET_NAME;

  const mainGroupId = project.getFirstProject().firstProject.mainGroup;
  objects(project).PBXGroup[mainGroupId].children.push({ value: uuid, comment: TARGET_NAME });
  return uuid;
}

function removeBuildFilesFromPhase(phase, fileRefUuids, fileNames) {
  if (!phase) return;
  phase.files = ensureArray(phase.files).filter((entry) => {
    const comment = commentOf(entry);
    return !fileNames.some((name) => comment.includes(name));
  });
}

function removeWidgetSourcesFromOtherTargets(project, widgetUuid) {
  const objs = objects(project);
  const phases = objs.PBXSourcesBuildPhase ?? {};
  const widgetPhaseId = phaseIdFor(objs.PBXNativeTarget[widgetUuid], 'Sources');

  for (const key of Object.keys(phases)) {
    if (key.endsWith('_comment') || key === widgetPhaseId) continue;
    removeBuildFilesFromPhase(phases[key], [], SOURCE_FILES);
  }
}

function ensureSourceInPhase(project, phaseId, fileRefUuid, fileName) {
  const phase = objects(project).PBXSourcesBuildPhase[phaseId];
  phase.files = ensureArray(phase.files);
  const already = phase.files.some((entry) => {
    const buildFile = objects(project).PBXBuildFile[valueOf(entry)];
    return buildFile?.fileRef === fileRefUuid;
  });
  if (already) return;

  const uuid = project.generateUuid();
  objects(project).PBXBuildFile[uuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: fileName,
  };
  objects(project).PBXBuildFile[`${uuid}_comment`] = `${fileName} in Sources`;
  phase.files.push({ value: uuid, comment: `${fileName} in Sources` });
}

function ensureFrameworkInPhase(project, phaseId, fileRefUuid, fileName) {
  const phase = objects(project).PBXFrameworksBuildPhase[phaseId];
  phase.files = ensureArray(phase.files);
  const already = phase.files.some((entry) => {
    const buildFile = objects(project).PBXBuildFile[valueOf(entry)];
    return buildFile?.fileRef === fileRefUuid;
  });
  if (already) return;

  const uuid = project.generateUuid();
  objects(project).PBXBuildFile[uuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRefUuid,
    fileRef_comment: fileName,
  };
  objects(project).PBXBuildFile[`${uuid}_comment`] = `${fileName} in Frameworks`;
  phase.files.push({ value: uuid, comment: `${fileName} in Frameworks` });
}

function ensureTargetDependency(project, appUuid, widgetUuid) {
  const objs = objects(project);
  const app = objs.PBXNativeTarget[appUuid];
  app.dependencies = ensureArray(app.dependencies);
  if (app.dependencies.some((dep) => commentOf(dep).includes(TARGET_NAME))) return;

  if (!objs.PBXContainerItemProxy) objs.PBXContainerItemProxy = {};
  if (!objs.PBXTargetDependency) objs.PBXTargetDependency = {};

  const proxyUuid = project.generateUuid();
  const projectUuid = project.getFirstProject().uuid;
  objs.PBXContainerItemProxy[proxyUuid] = {
    isa: 'PBXContainerItemProxy',
    containerPortal: projectUuid,
    containerPortal_comment: 'Project object',
    proxyType: 1,
    remoteGlobalIDString: widgetUuid,
    remoteInfo: TARGET_NAME,
  };
  objs.PBXContainerItemProxy[`${proxyUuid}_comment`] = 'PBXContainerItemProxy';

  const depUuid = project.generateUuid();
  objs.PBXTargetDependency[depUuid] = {
    isa: 'PBXTargetDependency',
    target: widgetUuid,
    target_comment: TARGET_NAME,
    targetProxy: proxyUuid,
    targetProxy_comment: 'PBXContainerItemProxy',
  };
  objs.PBXTargetDependency[`${depUuid}_comment`] = 'PBXTargetDependency';
  app.dependencies.push({ value: depUuid, comment: 'PBXTargetDependency' });
}

function applyWidgetBuildSettings(project, marketingVersion, projectVersion, bundleIdentifier, developmentTeam) {
  const configs = project.pbxXCBuildConfigurationSection();
  for (const key of Object.keys(configs)) {
    const buildSettings = configs[key]?.buildSettings;
    if (!buildSettings || buildSettings.PRODUCT_NAME !== `"${TARGET_NAME}"`) continue;

    buildSettings.INFOPLIST_FILE = `"${TARGET_NAME}/Info.plist"`;
    buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '"16.2"';
    buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
    buildSettings.SWIFT_VERSION = '"5.0"';
    buildSettings.SKIP_INSTALL = '"YES"';
    buildSettings.GENERATE_INFOPLIST_FILE = '"NO"';
    buildSettings.APPLICATION_EXTENSION_API_ONLY = '"YES"';
    buildSettings.CURRENT_PROJECT_VERSION = `"${projectVersion}"`;
    buildSettings.MARKETING_VERSION = `"${marketingVersion}"`;
    buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${bundleIdentifier}"`;
    buildSettings.LD_RUNPATH_SEARCH_PATHS =
      '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
    buildSettings.ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = '"YES"';
    if (developmentTeam) buildSettings.DEVELOPMENT_TEAM = developmentTeam;
  }
}

function configureWidgetTarget(project, config) {
  const app = nativeTarget(project, 'Tamdok') ?? {
    uuid: project.getFirstTarget().uuid,
    target: objects(project).PBXNativeTarget[project.getFirstTarget().uuid],
  };

  let widget = nativeTarget(project, TARGET_NAME);
  if (!widget) {
    const bundleIdentifier = `${config.ios?.bundleIdentifier ?? 'com.solsticeleaf.Tamdok'}.${TARGET_NAME}`;
    const created = project.addTarget(TARGET_NAME, 'app_extension', TARGET_NAME, bundleIdentifier);
    widget = nativeTarget(project, TARGET_NAME) ?? (created?.uuid ? { uuid: created.uuid, target: created.pbxNativeTarget } : null);
  }
  if (!widget?.uuid) return;

  const groupUuid = ensureWidgetGroup(project);
  restoreTamdokInfoPlist(project, groupUuid);

  const sourceRefs = {};
  for (const file of SOURCE_FILES) {
    sourceRefs[file] = ensureGroupFileRef(project, groupUuid, file, 'sourcecode.swift');
  }
  ensureGroupFileRef(project, groupUuid, 'Info.plist', 'text.plist.xml');

  const sourcesPhaseId = ensureBuildPhase(project, widget.uuid, 'PBXSourcesBuildPhase', 'Sources');
  const frameworksPhaseId = ensureBuildPhase(project, widget.uuid, 'PBXFrameworksBuildPhase', 'Frameworks');

  removeWidgetSourcesFromOtherTargets(project, widget.uuid);
  for (const file of SOURCE_FILES) {
    ensureSourceInPhase(project, sourcesPhaseId, sourceRefs[file], file);
  }

  for (const framework of FRAMEWORKS) {
    try {
      project.addFramework(framework, { target: widget.uuid });
    } catch {
      // Framework file refs may already exist.
    }
    const frameworkRef = fileRefByPath(project, `System/Library/Frameworks/${framework}`) ?? fileRefByPath(project, framework);
    if (frameworkRef) {
      ensureFrameworkInPhase(project, frameworksPhaseId, frameworkRef, framework);
    }
  }

  // addFramework often attaches to the app target; keep ActivityKit there for the Expo module,
  // but WidgetKit/SwiftUI belong only on the extension.
  const appFrameworksId = phaseIdFor(app.target, 'Frameworks');
  if (appFrameworksId && objects(project).PBXFrameworksBuildPhase[appFrameworksId]) {
    const appFrameworks = objects(project).PBXFrameworksBuildPhase[appFrameworksId];
    appFrameworks.files = ensureArray(appFrameworks.files).filter((entry) => {
      const comment = commentOf(entry);
      return !comment.includes('WidgetKit.framework') && !comment.includes('SwiftUI.framework');
    });
  }

  ensureTargetDependency(project, app.uuid, widget.uuid);
  applyWidgetBuildSettings(
    project,
    config.version ?? '1.0',
    config.ios?.buildNumber ?? '1',
    `${config.ios?.bundleIdentifier ?? 'com.solsticeleaf.Tamdok'}.${TARGET_NAME}`,
    firstDevelopmentTeam(project)
  );
}

function withLibraryRefreshLiveActivity(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (mod) => {
      copyWidgetSources(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
      return mod;
    },
  ]);

  config = withXcodeProject(config, (mod) => {
    configureWidgetTarget(mod.modResults, mod);
    return mod;
  });

  return config;
}

module.exports = withLibraryRefreshLiveActivity;
