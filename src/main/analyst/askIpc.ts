import { type BrowserWindow, ipcMain, shell } from 'electron'
import type { AskEvent, AskOptions, ProviderInput } from '@shared/ask'
import { IPC } from '@shared/ipc'
import type { AskService } from './askService'
import { ANTHROPIC_DASHBOARD, PRESETS } from '@shared/askPresets'

/** Ask in the app (Plan AG1): the providers, the turns (streamed as `ask:event`) and the threads. */
export function registerAskHandlers(ask: AskService, getWindow: () => BrowserWindow | null): void {
  const emit = (event: AskEvent): void => getWindow()?.webContents.send(IPC.askEvent, event)
  ipcMain.handle(IPC.askProviders, () => ask.providers())
  ipcMain.handle(IPC.askSaveProvider, (_e, input: ProviderInput & { id?: number }) =>
    ask.saveProvider(input)
  )
  ipcMain.handle(IPC.askRemoveProvider, (_e, id: number) => ask.removeProvider(id))
  ipcMain.handle(IPC.askActivateProvider, (_e, id: number) => ask.activate(id))
  ipcMain.handle(IPC.askModels, (_e, input: ProviderInput & { id?: number }) => ask.models(input))
  ipcMain.handle(IPC.askDetect, () => ask.detect())
  ipcMain.handle(IPC.askTest, (_e, id: number) => ask.test(id))
  ipcMain.handle(IPC.askOpenDashboard, async (_e, id: number) => {
    const p = ask.providers().find((x) => x.id === id)
    const url =
      p?.kind === 'anthropic' ? ANTHROPIC_DASHBOARD : p?.preset ? PRESETS[p.preset].dashboard : null
    if (url) await shell.openExternal(url)
  })
  ipcMain.handle(IPC.askSend, (_e, threadId: number | null, question: string) =>
    ask.send(threadId, question, emit)
  )
  ipcMain.handle(IPC.askStop, () => ask.stop())
  ipcMain.handle(IPC.askThreads, () => ask.threads())
  ipcMain.handle(IPC.askMessages, (_e, threadId: number) => ask.messages(threadId))
  ipcMain.handle(IPC.askDeleteThread, (_e, id: number) => ask.deleteThread(id))
  ipcMain.handle(IPC.askOptions, () => ask.options())
  ipcMain.handle(IPC.askSetOptions, (_e, o: AskOptions) => ask.setOptions(o))
}
