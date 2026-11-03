// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StatsAsk } from '@/screens/stats/StatsAsk'
import { api } from '@/lib/api'
import type { McpStatus } from '@shared/ask'

vi.mock('@/lib/api', () => ({
  api: {
    ask: {
      mcp: {
        status: vi.fn(),
        setEnabled: vi.fn(),
        resetToken: vi.fn(),
        addToClaudeDesktop: vi.fn(),
        copy: vi.fn()
      }
    }
  }
}))
const mcp = vi.mocked(api.ask.mcp)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PATH = 'C:\\Users\\me\\AppData\\Local\\Claude-Data\\claude_x\\claude_desktop_config.json'
const OFF: McpStatus = {
  enabled: false,
  windows: true,
  running: false,
  url: null,
  error: null,
  claudeDesktop: { path: PATH, state: 'absent' }
}
const ON: McpStatus = { ...OFF, enabled: true, running: true, url: 'http://127.0.0.1:41234/mcp' }

describe('Stats › Ask: Claude over MCP (Ask spec §6.1)', () => {
  it('is off until turned on; then shows the server and the Claude Code command', async () => {
    mcp.status.mockResolvedValue(OFF)
    mcp.setEnabled.mockResolvedValue(ON)
    render(<StatsAsk />)
    const toggle = await screen.findByRole('switch', { name: 'Let Claude read the app’s stats' })
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
    expect(screen.getByText('off')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy command' })).toBeNull()
    fireEvent.click(toggle)
    await screen.findByText('http://127.0.0.1:41234/mcp')
    expect(mcp.setEnabled).toHaveBeenCalledWith(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(mcp.copy).toHaveBeenCalledWith('claude-code')
  })

  it('adds the app to Claude desktop and shows where', async () => {
    mcp.status.mockResolvedValue(ON)
    mcp.addToClaudeDesktop.mockResolvedValue({
      ...ON,
      claudeDesktop: { path: PATH, state: 'added' }
    })
    render(<StatsAsk />)
    expect(await screen.findByText(PATH)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to Claude desktop' }))
    await screen.findByText(/^Added\. Quit and reopen Claude desktop/)
    // An update replaces the exe the bridge runs from (review, plan AF2).
    expect(
      screen.getByText(/After FantasyCompanion updates, quit and reopen Claude desktop/)
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add to Claude desktop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy command for WSL' }))
    await waitFor(() => expect(mcp.copy).toHaveBeenCalledWith('claude-code-wsl'))
  })

  it('says why the server is not running, and when Claude desktop is not found', async () => {
    mcp.status.mockResolvedValue({
      ...OFF,
      enabled: true,
      error:
        'The stats database could not be opened on this computer, so Claude has nothing to read.',
      claudeDesktop: { path: null, state: 'not-found' }
    })
    render(<StatsAsk />)
    await screen.findByText(/stats database could not be opened/)
    expect(screen.getByText(/Claude desktop was not found on this computer/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy config entry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /make a new key/ })).toBeNull()
  })
})
