import { describe, expect, it } from 'vitest'
import type { MessageBoxOptions } from 'electron'
import { installAutoUpdater, type UpdaterDeps, type UpdaterLike } from '@main/updater'

interface Harness {
  counts: { checks: number; installs: number }
  dialogs: MessageBoxOptions[]
  logs: string[]
  /** Event names the module subscribed to, in order. */
  registered: string[]
  /** Fires the listener registered for `error`. */
  emitError: (err: Error) => void
  /** Fires the listener registered for `update-downloaded` and waits for the prompt to settle. */
  emitDownloaded: (version: string) => Promise<void>
}

interface Options {
  enabled?: boolean
  /** Index of the dialog button the fake user presses. */
  response?: number
  checkFails?: boolean
}

type ErrorListener = (err: Error) => void
type DownloadedListener = (info: { version: string }) => unknown

function setup({ enabled = true, response = 0, checkFails = false }: Options = {}): Harness {
  const counts = { checks: 0, installs: 0 }
  const dialogs: MessageBoxOptions[] = []
  const logs: string[] = []
  const registered: string[] = []
  let onError: ErrorListener | undefined
  let onDownloaded: DownloadedListener | undefined

  const updater: UpdaterLike = {
    checkForUpdates() {
      counts.checks++
      return checkFails ? Promise.reject(new Error('offline')) : Promise.resolve(null)
    },
    quitAndInstall() {
      counts.installs++
    },
    on(event: 'error' | 'update-downloaded', listener: ErrorListener | DownloadedListener) {
      registered.push(event)
      if (event === 'error') onError = listener as ErrorListener
      else onDownloaded = listener as DownloadedListener
      return updater
    }
  }

  const deps: UpdaterDeps = {
    enabled,
    updater,
    dialog: {
      showMessageBox(...args: unknown[]) {
        dialogs.push(args[args.length - 1] as MessageBoxOptions)
        return Promise.resolve({ response })
      }
    },
    getWindow: () => null,
    log: (message) => {
      logs.push(message)
    }
  }
  installAutoUpdater(deps)

  return {
    counts,
    dialogs,
    logs,
    registered,
    emitError: (err) => onError?.(err),
    emitDownloaded: async (version) => {
      await onDownloaded?.({ version })
    }
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('installAutoUpdater', () => {
  it('does nothing when disabled', () => {
    const h = setup({ enabled: false })
    expect(h.counts.checks).toBe(0)
    expect(h.registered).toEqual([])
  })

  it('checks once at launch and subscribes to error and update-downloaded', () => {
    const h = setup()
    expect(h.counts.checks).toBe(1)
    expect(h.registered.sort()).toEqual(['error', 'update-downloaded'])
  })

  it('installs when the user picks Restart now', async () => {
    const h = setup({ response: 0 })
    await h.emitDownloaded('0.10.2')
    expect(h.dialogs).toHaveLength(1)
    expect(h.dialogs[0].title).toBe('Update ready')
    expect(h.dialogs[0].message).toBe('FantasyCompanion 0.10.2 is ready to install.')
    expect(h.dialogs[0].buttons).toEqual(['Restart now', 'Later'])
    expect(h.counts.installs).toBe(1)
  })

  it('does not install when the user picks Later', async () => {
    const h = setup({ response: 1 })
    await h.emitDownloaded('0.10.2')
    expect(h.dialogs).toHaveLength(1)
    expect(h.counts.installs).toBe(0)
  })

  it('logs updater errors without throwing', () => {
    const h = setup()
    expect(() => h.emitError(new Error('boom'))).not.toThrow()
    expect(h.logs).toEqual(['auto-update failed'])
  })

  it('logs a failed launch check without an unhandled rejection', async () => {
    const h = setup({ checkFails: true })
    await tick()
    expect(h.logs).toEqual(['auto-update check failed'])
  })
})
