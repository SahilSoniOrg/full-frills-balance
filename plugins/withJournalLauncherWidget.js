const fs = require('fs/promises');
const path = require('path');
const {
  withAndroidManifest,
  createRunOncePlugin,
  withDangerousMod,
  withEntitlementsPlist,
  withStringsXml,
  withXcodeProject,
  AndroidConfig,
} = require('@expo/config-plugins');
const {
  addBuildSourceFileToGroup,
  addFileToGroupAndLink,
  ensureGroupRecursively,
  getBuildConfigurationsForListId,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj');

const PLUGIN_NAME = 'withJournalLauncherWidget';
const PLUGIN_VERSION = '1.0.0';
const IOS_WIDGET_TARGET_NAME = 'FullFrillsBalanceWidget';
const IOS_WIDGET_SOURCE_FILE = `${IOS_WIDGET_TARGET_NAME}.swift`;
const IOS_WIDGET_INFO_FILE = `${IOS_WIDGET_TARGET_NAME}-Info.plist`;
const IOS_WIDGET_ENTITLEMENTS_FILE = `${IOS_WIDGET_TARGET_NAME}.entitlements`;
const TEMPLATE_ROOT = path.join(__dirname, '..', 'modules', 'expo-widgets', 'templates');
const ANDROID_WIDGETS = [
  {
    className: 'JournalLauncherWidgetProvider',
    template: 'JournalLauncherWidgetProvider.kt.template',
    infoResource: 'journal_launcher_widget_info',
    infoFile: 'journal_launcher_widget_info.xml',
  },
  {
    className: 'SafeToSpendWidgetProvider',
    template: 'SafeToSpendWidgetProvider.kt.template',
    infoResource: 'safe_to_spend_widget_info',
    infoFile: 'safe_to_spend_widget_info.xml',
  },
  {
    className: 'SafeToSpendActionsWidgetProvider',
    template: 'SafeToSpendActionsWidgetProvider.kt.template',
    infoResource: 'safe_to_spend_actions_widget_info',
    infoFile: 'safe_to_spend_actions_widget_info.xml',
  },
  {
    className: 'SafeToSpendActionsSquareWidgetProvider',
    template: 'SafeToSpendActionsSquareWidgetProvider.kt.template',
    infoResource: 'safe_to_spend_actions_square_widget_info',
    infoFile: 'safe_to_spend_actions_square_widget_info.xml',
  },
];

function getScheme(config) {
  if (Array.isArray(config.scheme)) {
    return config.scheme[0] || 'fullfrillsbalance';
  }
  return config.scheme || 'fullfrillsbalance';
}

function getAndroidPackage(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error(`${PLUGIN_NAME} requires expo.android.package to be defined.`);
  }
  return packageName;
}

function escapeKotlinPackage(packageName) {
  const kotlinKeywords = new Set([
    'as',
    'break',
    'class',
    'continue',
    'do',
    'else',
    'false',
    'for',
    'fun',
    'if',
    'in',
    'interface',
    'is',
    'null',
    'object',
    'package',
    'return',
    'super',
    'this',
    'throw',
    'true',
    'try',
    'typealias',
    'val',
    'var',
    'when',
    'while',
  ]);

  return packageName
    .split('.')
    .map((segment) => (kotlinKeywords.has(segment) ? `\`${segment}\`` : segment))
    .join('.');
}

function getIosBundleIdentifier(config) {
  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error(`${PLUGIN_NAME} requires expo.ios.bundleIdentifier to be defined.`);
  }
  return bundleIdentifier;
}

function getIosAppGroupIdentifier(config) {
  return `group.${getIosBundleIdentifier(config)}.widgets`;
}

async function writeFileIfChanged(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const existing = await fs.readFile(filePath, 'utf8').catch(() => null);
  if (existing !== contents) {
    await fs.writeFile(filePath, contents, 'utf8');
  }
}

async function renderTemplate(templatePath, replacements = {}) {
  let contents = await fs.readFile(templatePath, 'utf8');

  Object.entries(replacements).forEach(([key, value]) => {
    contents = contents.replaceAll(key, value);
  });

  return contents;
}

function ensureAndroidWidgetReceivers(manifest) {
  const application = manifest.application?.[0];
  if (!application) {
    throw new Error(`${PLUGIN_NAME} could not locate Android application node in AndroidManifest.xml.`);
  }

  application.receiver = application.receiver || [];

  ANDROID_WIDGETS.forEach(({ className, infoResource }) => {
    const providerClass = `.${className}`;
    const receiver = application.receiver.find(
      (item) => item.$?.['android:name'] === providerClass
    );

    const receiverConfig = {
      $: {
        'android:name': providerClass,
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
              },
            },
          ],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': `@xml/${infoResource}`,
          },
        },
      ],
    };

    if (receiver) {
      receiver.$ = receiverConfig.$;
      receiver['intent-filter'] = receiverConfig['intent-filter'];
      receiver['meta-data'] = receiverConfig['meta-data'];
    } else {
      application.receiver.push(receiverConfig);
    }
  });
}

async function writeAndroidWidgetFiles(projectRoot, config) {
  const packagePath = getAndroidPackage(config).split('.').join(path.sep);
  const basePath = path.join(projectRoot, 'android', 'app', 'src', 'main');
  const replacements = {
    '__ANDROID_PACKAGE__': escapeKotlinPackage(getAndroidPackage(config)),
    '__APP_SCHEME__': getScheme(config),
  };

  await writeFileIfChanged(
    path.join(basePath, 'java', packagePath, 'FullFrillsBalanceWidgetSupport.kt'),
    await renderTemplate(path.join(TEMPLATE_ROOT, 'android', 'FullFrillsBalanceWidgetSupport.kt.template'), replacements)
  );
  for (const widget of ANDROID_WIDGETS) {
    await writeFileIfChanged(
      path.join(basePath, 'java', packagePath, `${widget.className}.kt`),
      await renderTemplate(path.join(TEMPLATE_ROOT, 'android', widget.template), replacements)
    );
  }
  await writeFileIfChanged(
    path.join(basePath, 'res', 'layout', 'widget_journal_launcher.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'layout', 'widget_safe_to_spend.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_safe_to_spend.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'layout', 'widget_safe_to_spend_actions.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_safe_to_spend_actions.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'layout', 'widget_safe_to_spend_actions_square.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_safe_to_spend_actions_square.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_background.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_background.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_background_ivy.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_background_ivy.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_background_light.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_background_light.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_background_ivy_light.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_background_ivy_light.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_divider.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_divider.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_income.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_income.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_action_income_circle.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_action_income_circle.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_expense.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_expense.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_action_expense_circle.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_action_expense_circle.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_transfer.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_transfer.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_action_transfer_circle.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_action_transfer_circle.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_safe_to_spend_actions_bar.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_safe_to_spend_actions_bar.xml'), 'utf8')
  );
  await writeFileIfChanged(
    path.join(basePath, 'res', 'drawable', 'widget_journal_launcher_button.xml'),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'android', 'widget_journal_launcher_button.xml'), 'utf8')
  );
  for (const widget of ANDROID_WIDGETS) {
    await writeFileIfChanged(
      path.join(basePath, 'res', 'xml', widget.infoFile),
      await fs.readFile(path.join(TEMPLATE_ROOT, 'android', widget.infoFile), 'utf8')
    );
  }
}

async function writeIosWidgetFiles(projectRoot, config) {
  const iosWidgetPath = path.join(projectRoot, 'ios', IOS_WIDGET_TARGET_NAME);
  const replacements = {
    '__APP_SCHEME__': getScheme(config),
    '__IOS_APP_GROUP__': getIosAppGroupIdentifier(config),
  };
  await writeFileIfChanged(
    path.join(iosWidgetPath, IOS_WIDGET_SOURCE_FILE),
    await renderTemplate(path.join(TEMPLATE_ROOT, 'ios', `${IOS_WIDGET_TARGET_NAME}.swift.template`), replacements)
  );
  await writeFileIfChanged(
    path.join(iosWidgetPath, IOS_WIDGET_INFO_FILE),
    await fs.readFile(path.join(TEMPLATE_ROOT, 'ios', IOS_WIDGET_INFO_FILE), 'utf8')
  );
  await writeFileIfChanged(
    path.join(iosWidgetPath, IOS_WIDGET_ENTITLEMENTS_FILE),
    await renderTemplate(path.join(TEMPLATE_ROOT, 'ios', IOS_WIDGET_ENTITLEMENTS_FILE), replacements)
  );
}

function findTargetByName(project, targetName) {
  const targets = project.pbxNativeTargetSection();
  for (const [key, value] of Object.entries(targets)) {
    if (key.endsWith('_comment')) {
      continue;
    }
    const normalizedName = String(value.name || '').replace(/^"|"$/g, '');
    if (normalizedName === targetName) {
      return { uuid: key, target: value };
    }
  }
  return null;
}

function ensureInfoPlistReference(project, targetUuid) {
  const infoPlistPath = `${IOS_WIDGET_TARGET_NAME}/${IOS_WIDGET_INFO_FILE}`;
  if (project.hasFile(infoPlistPath)) {
    return;
  }

  addFileToGroupAndLink({
    filepath: infoPlistPath,
    groupName: IOS_WIDGET_TARGET_NAME,
    project,
    targetUuid,
    addFileToProject({ project: currentProject, file }) {
      currentProject.addToPbxFileReferenceSection(file);
    },
  });
}

function getQuotedOrRaw(value) {
  return String(value || '').replace(/^"|"$/g, '');
}

function findFileReference(project, filepath) {
  const basename = path.basename(filepath);
  const section = project.pbxFileReferenceSection();

  for (const [key, value] of Object.entries(section)) {
    if (key.endsWith('_comment')) {
      continue;
    }
    if (getQuotedOrRaw(value.path) === filepath || getQuotedOrRaw(value.name) === basename) {
      return { key, value };
    }
  }

  return null;
}

function removeSourceFileFromTarget(project, targetUuid, filepath) {
  const sources = project.pbxSourcesBuildPhaseObj(targetUuid);
  if (!sources?.files) {
    return;
  }

  const comment = `${path.basename(filepath)} in Sources`;
  const remainingFiles = [];

  sources.files.forEach((entry) => {
    if (entry.comment !== comment) {
      remainingFiles.push(entry);
      return;
    }

    delete project.pbxBuildFileSection()[entry.value];
    delete project.pbxBuildFileSection()[`${entry.value}_comment`];
  });

  sources.files = remainingFiles;
}

function ensureSourceFileInTarget(project, targetUuid, filepath) {
  const sources = project.pbxSourcesBuildPhaseObj(targetUuid);
  if (!sources?.files) {
    return;
  }

  const basename = path.basename(filepath);
  const comment = `${basename} in Sources`;
  if (sources.files.some((entry) => entry.comment === comment)) {
    return;
  }

  const fileRef = findFileReference(project, filepath);
  if (!fileRef) {
    throw new Error(`${PLUGIN_NAME} could not find file reference for ${filepath}.`);
  }

  const buildFileUuid = project.generateUuid();
  project.pbxBuildFileSection()[buildFileUuid] = {
    isa: 'PBXBuildFile',
    fileRef: fileRef.key,
    fileRef_comment: basename,
  };
  project.pbxBuildFileSection()[`${buildFileUuid}_comment`] = comment;
  sources.files.push({
    value: buildFileUuid,
    comment,
  });
}

function ensureWidgetBuildSettings(project, target, config) {
  const nativeTarget = target?.target || target?.pbxNativeTarget || target;
  if (!nativeTarget?.buildConfigurationList) {
    throw new Error(`${PLUGIN_NAME} could not resolve iOS widget build configuration list.`);
  }

  const buildConfigurations = getBuildConfigurationsForListId(project, nativeTarget.buildConfigurationList);
  const marketingVersion = config.version || '1.0.0';
  const bundleId = `${getIosBundleIdentifier(config)}.widget`;

  buildConfigurations.forEach(([, buildConfig]) => {
    buildConfig.buildSettings = buildConfig.buildSettings || {};
    buildConfig.buildSettings.APPLICATION_EXTENSION_API_ONLY = 'YES';
    buildConfig.buildSettings.CODE_SIGN_STYLE = 'Automatic';
    buildConfig.buildSettings.CURRENT_PROJECT_VERSION = '1';
    buildConfig.buildSettings.CODE_SIGN_ENTITLEMENTS = `${IOS_WIDGET_TARGET_NAME}/${IOS_WIDGET_ENTITLEMENTS_FILE}`;
    buildConfig.buildSettings.GENERATE_INFOPLIST_FILE = 'NO';
    buildConfig.buildSettings.INFOPLIST_FILE = `${IOS_WIDGET_TARGET_NAME}/${IOS_WIDGET_INFO_FILE}`;
    buildConfig.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.1';
    buildConfig.buildSettings.LD_RUNPATH_SEARCH_PATHS = [
      '"$(inherited)"',
      '"@executable_path/Frameworks"',
      '"@executable_path/../../Frameworks"',
    ];
    buildConfig.buildSettings.MARKETING_VERSION = marketingVersion;
    buildConfig.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = bundleId;
    buildConfig.buildSettings.PRODUCT_NAME = '"$(TARGET_NAME)"';
    buildConfig.buildSettings.SKIP_INSTALL = 'YES';
    buildConfig.buildSettings.SWIFT_VERSION = '5.0';
    buildConfig.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
  });
}

function ensureIosWidgetTarget(project, config) {
  let target = findTargetByName(project, IOS_WIDGET_TARGET_NAME);
  if (!target) {
    const createdTarget = project.addTarget(
      IOS_WIDGET_TARGET_NAME,
      'app_extension',
      IOS_WIDGET_TARGET_NAME,
      `${getIosBundleIdentifier(config)}.widget`
    );
    target = findTargetByName(project, IOS_WIDGET_TARGET_NAME) || createdTarget;
  }

  ensureGroupRecursively(project, IOS_WIDGET_TARGET_NAME);

  const sourcePath = `${IOS_WIDGET_TARGET_NAME}/${IOS_WIDGET_SOURCE_FILE}`;
  if (!project.hasFile(sourcePath)) {
    addBuildSourceFileToGroup({
      filepath: sourcePath,
      groupName: IOS_WIDGET_TARGET_NAME,
      project,
      targetUuid: target.uuid,
    });
  }

  const appTargetUuid = project.getFirstTarget()?.uuid;
  if (appTargetUuid) {
    removeSourceFileFromTarget(project, appTargetUuid, sourcePath);
  }
  ensureSourceFileInTarget(project, target.uuid, sourcePath);

  ensureInfoPlistReference(project, target.uuid);
  ensureWidgetBuildSettings(project, target, config);

  if (!project.hasFile('SwiftUI.framework')) {
    project.addFramework('SwiftUI.framework', { target: target.uuid });
  }
  if (!project.hasFile('WidgetKit.framework')) {
    project.addFramework('WidgetKit.framework', { target: target.uuid });
  }
}

function withAndroidWidget(config) {
  config = withAndroidManifest(config, (modConfig) => {
    ensureAndroidWidgetReceivers(modConfig.modResults.manifest);
    return modConfig;
  });

  config = withStringsXml(config, (modConfig) => {
    const items = [
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_name', value: 'New Journal' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_add_transaction', value: 'Add transaction' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_subtitle', value: 'Create a transaction from your home screen.' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_income', value: 'Income' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_expense', value: 'Expense' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'journal_widget_transfer', value: 'Transfer' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_name', value: 'Safe to Spend' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_description', value: 'View your current safe-to-spend amount.' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_actions_name', value: 'Safe to Spend + Actions' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_actions_widget_description', value: 'View safe to spend and add a transaction.' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_square_widget_name', value: 'Safe to Spend + Quick Add' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_square_widget_description', value: 'View safe to spend with quick transaction actions.' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_title', value: 'Safe to spend' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_subtitle', value: 'After obligations' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_loading', value: 'Open app to load data' }),
      AndroidConfig.Resources.buildResourceItem({ name: 'safe_to_spend_widget_amount_placeholder', value: '--' }),
    ];
    modConfig.modResults = AndroidConfig.Strings.setStringItem(items, modConfig.modResults);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await writeAndroidWidgetFiles(modConfig.modRequest.projectRoot, config);
      return modConfig;
    },
  ]);

  return config;
}

function withIosWidget(config) {
  config = withEntitlementsPlist(config, (modConfig) => {
    const appGroupId = getIosAppGroupIdentifier(config);
    const existingGroups = modConfig.modResults['com.apple.security.application-groups'] || [];
    if (!existingGroups.includes(appGroupId)) {
      modConfig.modResults['com.apple.security.application-groups'] = [...existingGroups, appGroupId];
    }
    return modConfig;
  });

  config = withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      await writeIosWidgetFiles(modConfig.modRequest.projectRoot, config);
      return modConfig;
    },
  ]);

  config = withXcodeProject(config, (modConfig) => {
    ensureIosWidgetTarget(modConfig.modResults, config);
    return modConfig;
  });

  return config;
}

function withJournalLauncherWidget(config) {
  config = withAndroidWidget(config);
  config = withIosWidget(config);
  return config;
}

module.exports = createRunOncePlugin(withJournalLauncherWidget, PLUGIN_NAME, PLUGIN_VERSION);
