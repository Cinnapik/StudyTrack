/** Конфигурационный плагин Expo: короткий путь сборки CMake для ограничения длины путей Windows. */
const { withAppBuildGradle } = require('expo/config-plugins');

// Keep Ninja object paths within the Windows limit without changing global OS settings.
module.exports = function withShortCmakePaths(config) {
  return withAppBuildGradle(config, (result) => {
    const marker = '// StudyTrack: bounded CMake object paths';
    // This block is owned by this plugin; regenerate it on repeated prebuilds.
    result.modResults.contents = result.modResults.contents.replace(
      /\/\/ StudyTrack: bounded CMake object paths\r?\nandroid \{[\s\S]*?\r?\n\}\r?\n/g, '',
    );
    result.modResults.contents += `\n${marker}\nandroid {\n  externalNativeBuild { cmake { buildStagingDirectory file("../../../../.work/cxx-app") } }\n  defaultConfig {\n    externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" } }\n  }\n}\n`;
    return result;
  });
};
