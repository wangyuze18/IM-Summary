import { contextBridge, ipcRenderer } from 'electron'

// 预加载脚本：通过 contextBridge 向渲染进程暴露最小文件能力
export interface ImportFileRef {
  path: string
  name: string
}

const api = {
  isElectron: true,
  openImportFiles: (): Promise<ImportFileRef[]> => ipcRenderer.invoke('dialog:openImportFiles'),
  readTextFile: (path: string): Promise<string> => ipcRenderer.invoke('file:readText', path)
}

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('desktopApi', api)
