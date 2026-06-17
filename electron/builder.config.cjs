/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.yourcompany.tissue-desktop',
  productName: 'Tissue Desktop',
  directories: {
    output: 'release',
    buildResources: 'electron/resources',
  },
  files: [
    'dist-electron/**/*',
    'frontend/dist/**/*',
    'app/**/*',
    'alembic/**/*',
    'alembic.ini',
    'requirements.txt',
  ],
  // Python source must live outside the asar so the system Python interpreter can reach it.
  // This duplicates the backend files intentionally until we bundle a Python runtime.
  extraResources: [
    { from: 'app', to: 'app' },
    { from: 'alembic', to: 'alembic' },
    { from: 'alembic.ini', to: 'alembic.ini' },
    { from: 'requirements.txt', to: 'requirements.txt' },
  ],
  asarUnpack: ['dist-electron/preload/**/*'],
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.entertainment',
  },
  win: {
    target: ['nsis', 'portable'],
  },
};
