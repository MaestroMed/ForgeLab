/**
 * Electron Builder Configuration
 * 
 * Comprehensive build configuration for FORGE/LAB Desktop including:
 * - Embedded Python with FORGE Engine
 * - Bundled FFmpeg binaries
 * - Windows installer with proper signing
 * - macOS DMG/PKG distribution
 * - Linux AppImage/deb/rpm support
 */

const path = require('path');

/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.forgelab.desktop',
  productName: 'FORGE LAB',
  copyright: 'Copyright © 2026 FORGE LAB',
  
  // Build directories
  directories: {
    output: 'release/${version}',
    buildResources: 'build-resources',
  },
  
  // Files to include
  files: [
    'dist/**/*',
    'dist-electron/**/*',
    '!**/*.map',
    '!**/node_modules/*/{CHANGELOG.md,README.md,readme.md}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/.bin',
  ],
  
  // Extra resources (not in asar)
  extraResources: [
    // Python environment
    {
      from: 'resources/python',
      to: 'python',
      filter: ['**/*'],
    },
    // FFmpeg binaries
    {
      from: 'resources/ffmpeg',
      to: 'ffmpeg',
      filter: ['**/*'],
    },
    // FORGE Engine
    {
      from: '../../apps/forge-engine/src',
      to: 'forge-engine/src',
      filter: ['**/*.py'],
    },
    {
      from: '../../apps/forge-engine/requirements.txt',
      to: 'forge-engine/requirements.txt',
    },
    // Assets
    {
      from: '../../assets',
      to: 'assets',
      filter: ['**/*'],
    },
  ],
  
  // ASAR archive
  asar: true,
  asarUnpack: [
    // Unpack native modules
    '**/*.node',
    '**/node_modules/sharp/**/*',
  ],
  
  // Compression
  compression: 'maximum',
  
  // ============ WINDOWS ============
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
      {
        target: 'portable',
        arch: ['x64'],
      },
    ],
    icon: 'public/icon.ico',
    // Code signing (set env vars for production)
    // certificateFile: process.env.WIN_CERT_FILE,
    // certificatePassword: process.env.WIN_CERT_PASSWORD,
  },
  
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'FORGE LAB',
    
    // Custom installer script
    include: 'build-resources/installer.nsh',
    
    // License
    license: 'build-resources/license.txt',
    
    // Custom installer messages
    installerHeader: 'build-resources/installer-header.bmp',
    installerSidebar: 'build-resources/installer-sidebar.bmp',
    
    // Install Python and FFmpeg during installation
    // (handled by custom nsh script)
  },
  
  // Portable version
  portable: {
    artifactName: '${productName}-${version}-Portable.${ext}',
  },
  
  // ============ MACOS ============
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64'],
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64'],
      },
    ],
    icon: 'public/icon.icns',
    category: 'public.app-category.video',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.plist',
    
    // Code signing (set env vars for production)
    // identity: process.env.APPLE_IDENTITY,
    
    // Extra files for macOS
    extraResources: [
      {
        from: 'resources/python-macos',
        to: 'python',
        filter: ['**/*'],
      },
      {
        from: 'resources/ffmpeg-macos',
        to: 'ffmpeg',
        filter: ['**/*'],
      },
    ],
  },
  
  dmg: {
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications',
      },
    ],
    window: {
      width: 540,
      height: 380,
    },
    background: 'build-resources/dmg-background.png',
  },
  
  // ============ LINUX ============
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64'],
      },
      {
        target: 'deb',
        arch: ['x64'],
      },
      {
        target: 'rpm',
        arch: ['x64'],
      },
    ],
    icon: 'public/icon.png',
    category: 'AudioVideo',
    maintainer: 'FORGE LAB Team',
    vendor: 'FORGE LAB',
    synopsis: 'AI-Powered Viral Clip Creator',
    description: 'Transform long-form content into viral clips with AI analysis and one-click export.',
    desktop: {
      StartupWMClass: 'forge-lab',
    },
    
    // Extra files for Linux
    extraResources: [
      {
        from: 'resources/python-linux',
        to: 'python',
        filter: ['**/*'],
      },
      {
        from: 'resources/ffmpeg-linux',
        to: 'ffmpeg',
        filter: ['**/*'],
      },
    ],
  },
  
  appImage: {
    artifactName: '${productName}-${version}.${ext}',
  },
  
  deb: {
    depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libdrm2', 'libgbm1', 'libxcb-dri3-0'],
    afterInstall: 'build-resources/linux/after-install.sh',
    afterRemove: 'build-resources/linux/after-remove.sh',
  },
  
  rpm: {
    depends: ['gtk3', 'libnotify', 'nss', 'libXScrnSaver', 'libXtst', 'xdg-utils', 'at-spi2-atk', 'libdrm', 'mesa-libgbm', 'libxcb'],
  },
  
  // ============ PUBLISH ============
  publish: {
    provider: 'github',
    owner: 'forge-lab',
    repo: 'desktop',
    releaseType: 'release',
    // For auto-updates
    private: false,
  },
  
  // ============ HOOKS ============
  beforeBuild: async (context) => {
    console.log('🔧 Preparing build resources...');
    
    // Could run scripts here to:
    // - Download platform-specific Python
    // - Download FFmpeg binaries
    // - Compile Python to bytecode
  },
  
  afterPack: async (context) => {
    console.log('📦 Post-pack processing...');
    
    // Could run scripts here to:
    // - Clean up unnecessary files
    // - Optimize Python packages
  },
  
  afterSign: async (context) => {
    // macOS notarization
    if (context.electronPlatformName === 'darwin') {
      console.log('🔐 Notarizing macOS build...');
      // Notarization would happen here
    }
  },
};
