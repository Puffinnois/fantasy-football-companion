import type { BrowserWindow, MessageBoxOptions } from 'electron'

/** The slice of electron-updater's `autoUpdater` this module uses; injectable for tests. */
export interface UpdaterLike {
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
  on(event: 'error', listener: (err: Error) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown
}

/** The slice of Electron's `dialog` this module uses; injectable for tests. */
export interface DialogLike {
  showMessageBox(options: MessageBoxOptions): Promise<{ response: number }>
  showMessageBox(window: BrowserWindow, options: MessageBoxOptions): Promise<{ response: number }>
}

export interface UpdaterDeps {
  /** `app.isPackaged && process.platform === 'win32'` in production; false disables everything. */
  enabled: boolean
  updater: UpdaterLike
  dialog: DialogLike
  getWindow: () => BrowserWindow | null
  /** Defaults to console.error. Every updater failure ends here and nowhere else. */
  log?: (message: string, err: unknown) => void
}

const RESTART_NOW = 0

/**
 * One update check at launch. electron-updater downloads a newer version in the background
 * (autoDownload) and installs it on quit (autoInstallOnAppQuit); once it is downloaded we offer
 * an immediate restart. Failures — offline, no release yet, rate limit — are logged and swallowed.
 */
export function installAutoUpdater(deps: UpdaterDeps): void {
  if (!deps.enabled) return
  const log = deps.log ?? ((message, err) => console.error(message, err))

  deps.updater.on('error', (err) => log('auto-update failed', err))
  deps.updater.on('update-downloaded', (info) =>
    promptRestart(deps, info.version).catch((err) => log('auto-update prompt failed', err))
  )
  deps.updater.checkForUpdates().catch((err) => log('auto-update check failed', err))
}

async function promptRestart(deps: UpdaterDeps, version: string): Promise<void> {
  const options: MessageBoxOptions = {
    type: 'info',
    title: 'Update ready',
    message: `FantasyCompanion ${version} is ready to install.`,
    detail: 'Restart now to update, or it will install the next time you quit.',
    buttons: ['Restart now', 'Later'],
    defaultId: RESTART_NOW,
    cancelId: 1
  }
  const window = deps.getWindow()
  const { response } = window
    ? await deps.dialog.showMessageBox(window, options)
    : await deps.dialog.showMessageBox(options)
  if (response === RESTART_NOW) deps.updater.quitAndInstall()
}
