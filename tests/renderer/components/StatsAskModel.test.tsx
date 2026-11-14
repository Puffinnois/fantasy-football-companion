// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AskModel } from '@/screens/stats/ask/AskModel'
import { AskTry } from '@/screens/stats/ask/AskTry'
import { api } from '@/lib/api'
import type { AskEvent, AskMessage, ProviderSettings } from '@shared/ask'

let listener: ((e: AskEvent) => void) | null = null
vi.mock('@/lib/api', () => ({
  api: {
    ask: {
      providers: {
        list: vi.fn(),
        save: vi.fn(),
        remove: vi.fn(),
        activate: vi.fn(),
        models: vi.fn(),
        detect: vi.fn(),
        test: vi.fn(),
        openDashboard: vi.fn()
      },
      send: vi.fn(),
      stop: vi.fn(),
      onEvent: vi.fn((l: (e: AskEvent) => void) => {
        listener = l
        return () => {
          listener = null
        }
      })
    }
  }
}))
const providers = vi.mocked(api.ask.providers)
const ask = vi.mocked(api.ask)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const GROQ: ProviderSettings = {
  id: 1,
  kind: 'openai',
  preset: 'groq',
  label: 'Groq (free tier)',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-x',
  profile: 'full',
  mode: 'native',
  reasoning: 'off',
  hasKey: true,
  active: true
}

describe('Stats › Ask › Model (Plan AG1)', () => {
  it('adds an API model with its key, and says what leaves the PC', async () => {
    providers.list.mockResolvedValueOnce([]).mockResolvedValue([GROQ])
    providers.save.mockResolvedValue(GROQ)
    const onChange = vi.fn()
    render(<AskModel onChange={onChange} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add a model' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Service' }), {
      target: { value: 'groq' }
    })
    expect((screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement).value).toBe(
      'https://api.groq.com/openai/v1'
    )
    expect(screen.getByText(/go to this service/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'gsk-1' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'llama-x' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('llama-x')
    expect(providers.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'openai', preset: 'groq', model: 'llama-x', key: 'gsk-1' })
    )
    expect(onChange).toHaveBeenLastCalledWith([GROQ])
  })

  it('finds local models and sets a small one up for the compact profile', async () => {
    providers.list.mockResolvedValue([])
    providers.detect.mockResolvedValue([
      {
        kind: 'ollama',
        baseUrl: 'http://localhost:11434',
        models: [{ id: 'gemma3:4b', tools: false, thinking: false, context: null }]
      }
    ])
    render(<AskModel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Find models on this PC' }))
    fireEvent.click(await screen.findByRole('button', { name: /gemma3:4b/ }))
    expect((screen.getByRole('combobox', { name: 'Model' }) as HTMLInputElement).value).toBe(
      'gemma3:4b'
    )
    expect((screen.getByRole('combobox', { name: 'Tools' }) as HTMLSelectElement).value).toBe(
      'compact'
    )
    expect((screen.getByRole('combobox', { name: 'Calling' }) as HTMLSelectElement).value).toBe(
      'structured'
    )
    expect(screen.getByText(/Nothing leaves this computer/)).toBeTruthy()
    expect(screen.queryByLabelText('API key')).toBeNull()
  })

  it('tests a saved model', async () => {
    providers.list.mockResolvedValue([GROQ])
    providers.test.mockResolvedValue({ ok: false, message: 'Groq refused the key (401)', ms: 300 })
    render(<AskModel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Test' }))
    await screen.findByText(/Groq refused the key/)
  })

  it('promises to keep a saved key only for the same address', async () => {
    providers.list.mockResolvedValue([GROQ])
    render(<AskModel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByText('API key (leave empty to keep it)')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Address' }), {
      target: { value: 'https://elsewhere.example/v1' }
    })
    expect(screen.queryByText('API key (leave empty to keep it)')).toBeNull()
    expect(screen.getByText('API key')).toBeTruthy()
  })
})

describe('Stats › Ask › Try a question', () => {
  const answer: AskMessage = {
    id: 2,
    threadId: 7,
    role: 'assistant',
    text: 'Puka Nacua leads with 3.10.',
    calls: [{ tool: 'leaderboard', args: { metric: 'yprr' } }],
    results: [],
    flags: [],
    outcome: 'answer',
    model: 'Groq · llama-x',
    tokens: { input: 900, output: 20 },
    ms: 2100,
    createdAt: '2026-11-03T12:00:00Z'
  }

  it('streams the turn, then keeps the thread for a follow-up', async () => {
    let resolve: (m: AskMessage) => void = () => {}
    ask.send.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    render(<AskTry ready />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Who leads WRs in YPRR?' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(ask.send).toHaveBeenCalledWith(null, 'Who leads WRs in YPRR?'))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    listener!({ type: 'call', call: { tool: 'leaderboard', args: { metric: 'yprr' } } })
    listener!({ type: 'text', delta: 'Puka Nacua leads' })
    await screen.findByText('Puka Nacua leads')
    resolve(answer)
    await screen.findByText('Puka Nacua leads with 3.10.')
    expect(screen.getByText(/Groq · llama-x/)).toBeTruthy()
    ask.send.mockResolvedValueOnce({ ...answer, id: 4 })
    fireEvent.change(screen.getByRole('textbox', { name: 'Question' }), {
      target: { value: 'now 2024' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(ask.send).toHaveBeenLastCalledWith(7, 'now 2024'))
  })

  it('waits for a model', () => {
    render(<AskTry ready={false} />)
    expect((screen.getByRole('textbox', { name: 'Question' }) as HTMLInputElement).disabled).toBe(
      true
    )
  })
})
