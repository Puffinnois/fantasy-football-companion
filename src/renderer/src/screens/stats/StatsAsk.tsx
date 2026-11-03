import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { StatsButton } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { McpCopy, McpStatus } from '@shared/ask'

const DESKTOP: Record<McpStatus['claudeDesktop']['state'], string> = {
  added: 'Added. Quit and reopen Claude desktop if it was open, then ask it about your stats.',
  outdated:
    'Claude desktop has an older entry for FantasyCompanion (the app moved or was updated).',
  absent: 'Not added yet.',
  unreadable:
    'Claude desktop’s config is not valid JSON, so the app leaves it alone. Copy the entry and add it by hand.',
  'not-found':
    'Claude desktop was not found on this computer. Copy the entry and paste it into its config (Settings › Developer › Edit config).'
}

/** A copy button that says "Copied" for a moment. */
function CopyButton({
  done,
  disabled,
  onCopy,
  children
}: {
  done: boolean
  disabled: boolean
  onCopy: () => void
  children: string
}): React.JSX.Element {
  return (
    <StatsButton onClick={onCopy} disabled={disabled}>
      {done ? <Check className="size-3.5 text-good" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : children}
    </StatsButton>
  )
}

/**
 * Stats › Ask (Ask spec §6.1, §8): until Ask itself comes (Plan AH), this is where you let Claude read
 * the app's stats over MCP: on or off, Claude desktop's config, and the commands for Claude Code.
 */
export function StatsAsk(): React.JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<McpCopy | null>(null)

  useEffect(() => {
    void api.ask.mcp
      .status()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  async function act(fn: () => Promise<McpStatus>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setStatus(await fn())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy(kind: McpCopy): Promise<void> {
    setError(null)
    try {
      await api.ask.mcp.copy(kind)
      setCopied(kind)
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2_000)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const desktop = status?.claudeDesktop
  return (
    <div className="flex max-w-[760px] flex-col gap-6 px-8 pt-[22px] pb-7">
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">Ask</h1>
        <div className="text-[13px] leading-[1.45] text-fg-2">
          Ask questions about the app’s stats in Claude, with your own Claude plan. Asking from
          inside the app comes in a later version.
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
        <SectionHead title="Use Claude" note="MCP" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={status?.enabled ?? false}
            aria-label="Let Claude read the app’s stats"
            disabled={!status || busy}
            onClick={() => status && void act(() => api.ask.mcp.setEnabled(!status.enabled))}
            className={cn(
              'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-60',
              status?.enabled ? 'bg-cobalt' : 'bg-line'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-4 rounded-full bg-panel shadow transition-[left]',
                status?.enabled ? 'left-[18px]' : 'left-0.5'
              )}
            />
          </button>
          <span className="text-[13.5px] font-medium">Let Claude read the app’s stats</span>
          <span className="ml-auto font-mono text-[12px] text-fg-3">
            {status?.running ? status.url : status?.enabled ? 'starting…' : 'off'}
          </span>
        </div>
        <p className="m-0 text-[12.5px] leading-[1.45] text-fg-3">
          Claude desktop or Claude Code then calls the app’s read-only tools while it is open. The
          question and the rows Claude reads go to Anthropic as part of your chat; nothing else
          leaves this computer.
        </p>
        {status?.error && (
          <div className="rounded-[4px] bg-bad-s px-3 py-2 text-[12.5px] text-bad">
            {status.error}
          </div>
        )}
      </section>

      {status?.windows && (
        <section className="flex flex-col gap-3">
          <SectionHead title="Claude desktop" />
          <p className="m-0 text-[13px] leading-[1.45] text-fg-2">
            {desktop ? DESKTOP[desktop.state] : 'Looking for Claude desktop…'}
          </p>
          {desktop?.path && (
            <div className="truncate font-mono text-[11.5px] text-fg-3" title={desktop.path}>
              {desktop.path}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {desktop && (desktop.state === 'absent' || desktop.state === 'outdated') && (
              <StatsButton
                disabled={busy}
                onClick={() => void act(() => api.ask.mcp.addToClaudeDesktop())}
              >
                {desktop.state === 'absent' ? 'Add to Claude desktop' : 'Update Claude desktop'}
              </StatsButton>
            )}
            <CopyButton
              done={copied === 'claude-desktop'}
              disabled={busy}
              onCopy={() => void copy('claude-desktop')}
            >
              Copy config entry
            </CopyButton>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHead title="Claude Code" />
        <p className="m-0 text-[13px] leading-[1.45] text-fg-2">
          Run the command in a terminal; it adds the app for all your projects. Claude Code on
          Windows talks to the app directly; in WSL it goes through the same bridge as Claude
          desktop.
        </p>
        <div className="flex flex-wrap gap-2">
          {status?.running && (
            <CopyButton
              done={copied === 'claude-code'}
              disabled={busy}
              onCopy={() => void copy('claude-code')}
            >
              Copy command
            </CopyButton>
          )}
          {status?.windows && (
            <CopyButton
              done={copied === 'claude-code-wsl'}
              disabled={busy}
              onCopy={() => void copy('claude-code-wsl')}
            >
              Copy command for WSL
            </CopyButton>
          )}
        </div>
      </section>

      {status?.running && (
        <p className="m-0 text-[12px] leading-[1.45] text-fg-3">
          A copied Claude Code command holds a key. If you shared one by mistake,{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => api.ask.mcp.resetToken())}
            className="cursor-pointer text-fg-2 underline hover:text-fg"
          >
            make a new key
          </button>
          : copy the command again afterwards (Claude desktop follows on its own).
        </p>
      )}
      {error && <div className="text-[12.5px] text-bad">{error}</div>}
    </div>
  )
}
