import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { join } from 'node:path'

// Electron 主进程：窗口管理、系统文件选择器、本地文件读取
// 详见 frontend/README.md 架构说明

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: '企业IM智能摘要平台',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 系统文件选择器：支持多选批量导入（txt / json / csv）
  ipcMain.handle('dialog:openImportFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入离线会话',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '离线会话文件', extensions: ['txt', 'json', 'csv'] }]
    })
    if (result.canceled) return []
    return result.filePaths.map((p) => ({ path: p, name: basename(p) }))
  })

  // 读取本地文件内容（主进程侧读取，渲染进程不直接接触文件系统）
  ipcMain.handle('file:readText', async (_event, filePath: string) => {
    return readFile(filePath, 'utf-8')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
