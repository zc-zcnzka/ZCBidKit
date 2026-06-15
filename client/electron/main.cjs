const { app, BrowserWindow, nativeTheme, shell, protocol, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { registerIpcHandlers } = require('./ipc/index.cjs');
const { setupAutoUpdate, checkAndDownloadUpdate, triggerUpdateDownload, quitAndInstall } = require('./services/updateService.cjs');
const { getGeneratedImagesDir, getImportedImagesDir } = require('./utils/paths.cjs');

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const iconPath = path.join(__dirname, '../assets/icon.ico');
const packagedIndexUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).toString();

// 数据目录策略：
// - 开发环境固定到 D:\AAAAbiaoshu\YibiaoData，便于本地管理与备份。
// - 打包分发版使用 Electron 默认用户目录（%APPDATA%\<产品名>），每台机器各自隔离，避免把开发机路径带给其他用户。
// - 任意环境都可用环境变量 YIBIAO_DATA_DIR 显式覆盖。
const explicitDataDir = process.env.YIBIAO_DATA_DIR;
const localDataDir = explicitDataDir || (app.isPackaged ? null : path.join('D:\\', 'AAAAbiaoshu', 'YibiaoData'));
if (localDataDir) {
  try {
    fs.mkdirSync(localDataDir, { recursive: true });
    app.setPath('userData', localDataDir);
  } catch (error) {
    console.warn('[electron] 设置本地数据目录失败，回退默认目录：', error?.message || error);
  }
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'yibiao-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

function registerAssetProtocol() {
  protocol.handle('yibiao-asset', (request) => {
    try {
      const url = new URL(request.url);
      const assetRoots = {
        'generated-images': getGeneratedImagesDir(app),
        'imported-images': getImportedImagesDir(app),
      };
      const rootDir = assetRoots[url.hostname];
      if (!rootDir) {
        return new Response('Not found', { status: 404 });
      }

      const relativePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!relativePath) {
        return new Response('Not found', { status: 404 });
      }

      const baseDir = path.resolve(rootDir);
      const filePath = path.resolve(baseDir, relativePath);
      if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${path.sep}`)) {
        return new Response('Forbidden', { status: 403 });
      }

      if (!fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Invalid asset url', { status: 400 });
    }
  });
}

function normalizeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isAllowedAppNavigation(value) {
  try {
    const url = new URL(value);
    if (rendererUrl) {
      return url.origin === new URL(rendererUrl).origin;
    }

    const indexUrl = new URL(packagedIndexUrl);
    return url.protocol === 'file:' && url.pathname === indexUrl.pathname;
  } catch {
    return false;
  }
}

async function openExternalUrl(value) {
  const externalUrl = normalizeExternalUrl(value);
  if (!externalUrl) return;
  try {
    await shell.openExternal(externalUrl);
  } catch (error) {
    const preview = externalUrl.length > 300 ? `${externalUrl.slice(0, 300)}...` : externalUrl;
    console.warn('[electron] 打开外部链接失败', { url: preview, message: error.message || String(error) });
  }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: '#f8fafd',
    title: 'ZC投标工具箱',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) {
      return;
    }

    event.preventDefault();
    void openExternalUrl(url);
  });

  return mainWindow;
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'light';
  registerAssetProtocol();
  const mainWindow = createMainWindow();
  registerIpcHandlers({ app, mainWindow, checkAndDownloadUpdate, triggerUpdateDownload, quitAndInstall });
  setupAutoUpdate({ app, mainWindow });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
