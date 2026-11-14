import { useEffect, useRef, useState } from 'react'
import { StatsButton } from '@/components/stats/controls'
import { SectionHead } from '@/components/stats/parts'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AskCall, AskEvent, AskMessage, ToolOutcome } from '@shared/ask'

/**
 * Stats › Ask › Try a question (Plan AG1, amendment F): plain text until Plan AH builds Ask itself —
 * the streamed answer, the tool calls and the answer checks, with Stop. Questions in a row form a
 * thread, so follow-ups work ("now 2024"); New thread starts over.
 */
interface Turn {
  question: string
  calls: AskCall[]
  outcomes: ToolOutcome[]
  text: string
  message: AskMessage | null
  error: string | null
}

const OUTCOME: Partial<Record<NonNullable<AskMessage['outcome']>, string>> = {
  ask: 'asked back',
  decline: 'declined',
  stopped: 'stopped',
  error: 'failed'
}

function TurnView({ turn }: { turn: Turn }): React.JSX.Element {
  const m = turn.message
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="text-[13px] font-medium">{turn.question}</div>
      {turn.calls.map((c, i) => {
        const o = turn.outcomes[i]
        return (
          <div key={i} className="font-mono text-[11.5px] leading-[1.4] text-fg-3">
            {c.tool} {JSON.stringify(c.args)}
            {o && (o.ok ? ` → ${o.title} (${o.ms} ms)` : ` → ${o.error}`)}
          </div>
        )
      })}
      <div className="text-[13px] leading-[1.5] whitespace-pre-wrap">{m ? m.text : turn.text}</div>
      {m && m.flags.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {m.flags.map((f, i) => (
            <li
              key={i}
              className={cn('text-[12px]', f.severity === 'flag' ? 'text-bad' : 'text-fg-3')}
            >
              “{f.text}”: {f.message}
            </li>
          ))}
        </ul>
      )}
      {m && (
        <div className="text-[11.5px] text-fg-3">
          {[
            m.outcome && OUTCOME[m.outcome],
            m.model,
            m.tokens && `${m.tokens.input} tokens in, ${m.tokens.output} out`,
            m.ms !== null && `${(m.ms / 1000).toFixed(1)} s`
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {turn.error && <div className="text-[12.5px] text-bad">{turn.error}</div>}
    </div>
  )
}

export function AskTry({ ready }: { ready: boolean }): React.JSX.Element {
  const [question, setQuestion] = useState('')
  const [thread, setThread] = useState<number | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const live = useRef<Turn | null>(null)

  useEffect(
    () =>
      api.ask.onEvent((e: AskEvent) => {
        if (!live.current) return
        const t = { ...live.current }
        if (e.type === 'call') t.calls = [...t.calls, e.call]
        else if (e.type === 'result') t.outcomes = [...t.outcomes, e.outcome]
        else if (e.type === 'text') t.text += e.delta
        else if (e.type === 'done') t.message = e.message
        else if (e.type === 'error') t.error = e.error
        live.current = t
        setTurns((all) => [...all.slice(0, -1), t])
      }),
    []
  )

  async function ask(): Promise<void> {
    const q = question.trim()
    if (!q || busy) return
    const turn: Turn = {
      question: q,
      calls: [],
      outcomes: [],
      text: '',
      message: null,
      error: null
    }
    live.current = turn
    setTurns((all) => [...all, turn])
    setQuestion('')
    setBusy(true)
    try {
      const message = await api.ask.send(thread, q)
      setThread(message.threadId)
      // Read now: `live` is cleared below, before React runs the update.
      const done = { ...(live.current ?? turn), message }
      setTurns((all) => [...all.slice(0, -1), done])
    } catch (err) {
      const failed = { ...(live.current ?? turn), error: errorMessage(err) }
      setTurns((all) => [...all.slice(0, -1), failed])
    } finally {
      live.current = null
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-panel px-5 py-4">
      <SectionHead title="Try a question" note="Plain text until the Ask screen comes" />
      {turns.length > 0 && (
        <div className="flex flex-col gap-3" aria-label="Answers">
          {turns.map((t, i) => (
            <TurnView key={i} turn={t} />
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <input
          aria-label="Question"
          className="h-8 min-w-0 flex-1 rounded-[6px] border border-line bg-panel px-2.5 text-[13px] text-fg placeholder:text-fg-3"
          placeholder={
            ready ? 'Who leads WRs in yards per route run since week 5?' : 'Add a model above first'
          }
          disabled={!ready}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {busy ? (
          <StatsButton onClick={() => void api.ask.stop()}>Stop</StatsButton>
        ) : (
          <StatsButton type="submit" disabled={!ready || !question.trim()}>
            Ask
          </StatsButton>
        )}
        <StatsButton
          disabled={busy || turns.length === 0}
          onClick={() => {
            setThread(null)
            setTurns([])
          }}
        >
          New thread
        </StatsButton>
      </form>
    </section>
  )
}
