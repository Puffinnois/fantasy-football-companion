import { type BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import type { McpCopy, McpStatus } from '@shared/ask'
import { IPC } from '@shared/ipc'
import type { McpService } from './service'

/** Stats › Ask, Claude over MCP (Ask spec §6.1). */
export function registerMcpHandlers(mcp: McpService, getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.askMcpStatus, (): McpStatus => mcp.status())
  ipcMain.handle(IPC.askMcpSetEnabled, (_event, on: boolean) => mcp.setEnabled(on === true))
  ipcMain.handle(IPC.askMcpResetToken, () => mcp.resetToken())
  ipcMain.handle(IPC.askMcpAddToClaudeDesktop, async (): Promise<McpStatus> => {
    const path = mcp.desktopConfig()
    if (!path)
      throw new Error('Claude desktop was not found on this computer; copy its config instead')
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['Add', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Add to Claude desktop',
      message: 'Add FantasyCompanion to Claude desktop?',
      detail: `This edits ${path}; the file as it is now is kept beside it as a backup.\n\nQuit Claude desktop first, or quit and reopen it afterwards: it reads the file when it starts.`
    }
    const window = getWindow()
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    if (response === 0) mcp.addToClaudeDesktop()
    return mcp.status()
  })
  ipcMain.handle(IPC.askMcpCopy, (_event, kind: McpCopy): void => {
    clipboard.writeText(mcp.command(kind))
  })
}
