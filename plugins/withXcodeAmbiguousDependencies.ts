import { ConfigPlugin, withXcodeProject } from 'expo/config-plugins';

const withXcodeAmbiguousDependencies: ConfigPlugin = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const scriptPhases = xcodeProject.hash.project.objects.PBXShellScriptBuildPhase || {};

    for (const key of Object.keys(scriptPhases)) {
      const phase = scriptPhases[key];
      // Only process actual objects, not comments (which end with _comment)
      if (typeof phase === 'object' && phase.name) {
        // Strip quotes if they exist around the name
        const name = phase.name.replace(/^"|"/g, '');
        if (
          name.includes('Upload Debug Symbols to Sentry') ||
          name.includes('Expo Dev Launcher')
        ) {
          phase.alwaysOutOfDate = '1';
          
          // Clear inputPaths to prevent cycle with App Extensions (Widgets) during Copy Files phase
          if (phase.inputPaths) {
            phase.inputPaths = [];
          }
        }
      }
    }

    // Move Bundle React Native code and images to the very end to fix the cycle
    const nativeTargets = xcodeProject.hash.project.objects.PBXNativeTarget || {};
    for (const targetKey of Object.keys(nativeTargets)) {
      const target = nativeTargets[targetKey];
      if (typeof target === 'object' && target.buildPhases) {
        let bundlePhaseIndex = -1;
        let bundlePhase = null;
        for (let i = 0; i < target.buildPhases.length; i++) {
          if (target.buildPhases[i].comment === 'Bundle React Native code and images') {
            bundlePhaseIndex = i;
            bundlePhase = target.buildPhases[i];
            break;
          }
        }
        if (bundlePhaseIndex !== -1 && bundlePhase) {
          target.buildPhases.splice(bundlePhaseIndex, 1);
          target.buildPhases.push(bundlePhase);
        }
      }
    }

    return config;
  });
};

export default withXcodeAmbiguousDependencies;
