// 导出工具：Blob 下载（原型阶段前端本地导出，正式环境走后端导出接口）
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob(['﻿' + content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
