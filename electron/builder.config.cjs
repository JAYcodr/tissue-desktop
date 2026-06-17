/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.tissue.desktop',
  productName: 'Tissue Desktop',
  copyright: 'Copyright © 2026 Tissue Desktop Contributors',
  directories: {
    output: 'release',
    buildResources: 'electron/resources',
  },
  files: [
    'dist-electron/**/*',
    'frontend/dist/**/*',
    'package.json',
  ],
  // DESKTOP-MODIFIED: ship the PyInstaller-built backend executable as an extra
  // resource so it lives outside the asar and can be spawned by the main process.
  extraResources: [
    {
      from: 'backend_dist',
      to: 'backend',
      filter: ['tissue-backend', 'tissue-backend.exe'],
    },
  ],
  asarUnpack: ['dist-electron/preload/**/*'],
  publish: {
    provider: 'github',
    releaseType: 'draft',
  },
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.entertainment',
    icon: 'electron/resources/icon.png',
  },
  win: {
    target: ['nsis', 'portable'],
    icon: 'electron/resources/icon.png',
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'AudioVideo',
    icon: 'electron/resources/icon.png',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
