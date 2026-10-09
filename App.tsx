import { useEffect, useRef, useState } from 'react'
import { analyze, toMarkdown, uid } from './analyzer'
import { SAMPLES } from './samples'
import type { Item, Priority, Summary, Task } from './types'

function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init } catch { return init }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full/blocked */ } }, [key, v])
  return [v, setV] as const
}

const PC: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 ring-red-200',
  medium: 'bg-amber-100 text-amber-700 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
}
const Badge = ({ p }: { p: Priority }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${PC[p]}`}>{p}</span>
)
const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
    {children}
  </section>
)
const btn = 'rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-300'
const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`
const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100`

function download(name: string, data: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function ItemRow({ i }: { i: Item }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge p={i.priority} />
        <span className="text-sm font-semibold text-slate-800">{i.msg.author}</span>
        {i.msg.time && <span className="text-xs text-slate-400">{i.msg.time.replace(/[\[\]]/g, '')}</span>}
        {i.due && <span className="rounded bg-indigo-50 px-1.5 text-xs text-indigo-700">⏰ {i.due}</span>}
      </div>
      <p className="text-sm text-slate-700">{i.msg.text}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {i.tags.map(t => <span key={t} className="text-[11px] text-slate-400">#{t}</span>)}
      </div>
    </li>
  )
}
const List = ({ items, empty }: { items: Item[]; empty: string }) =>
  items.length ? <ul className="space-y-2">{items.map(i => <ItemRow key={i.msg.id} i={i} />)}</ul> : <p className="text-sm text-slate-400">{empty}</p>

export default function App() {
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [user, setUser] = useLocal('catchup.user', '')
  const [cur, setCur] = useLocal<Summary | null>('catchup.current', null)
  const [saved, setSaved] = useLocal<Summary[]>('catchup.saved', [])
  const [note, setNote] = useState('')
  const [newTask, setNewTask] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const say = (m: string) => { setNote(m); setTimeout(() => setNote(''), 2500) }
  const run = () => {
    if (!text.trim()) return say('Paste or upload a conversation first.')
    const s = analyze(text, user, title)
    setCur(s)
    say(s.messages ? 'Summary ready.' : 'No messages recognised – use "Name: message" lines.')
  }
  const onFile = async (f?: File) => {
    if (!f) return
    setText(await f.text())
    setTitle(f.name.replace(/\.[^.]+$/, ''))
    if (fileRef.current) fileRef.current.value = ''
    say(`Loaded ${f.name}`)
  }
  const patch = (id: string, p: Partial<Task>) =>
    setCur(c => c && { ...c, tasks: c.tasks.map(t => (t.id === id ? { ...t, ...p } : t)) })
  const addTask = () => {
    if (!cur || !newTask.trim()) return
    setCur({ ...cur, tasks: [...cur.tasks, { id: uid(), text: newTask.trim(), owner: user || 'Me', priority: 'medium', done: false }] })
    setNewTask('')
  }
  const save = () => {
    if (!cur) return
    setSaved([cur, ...saved.filter(s => s.id !== cur.id)])
    say('Saved on this device.')
  }
  useEffect(() => { /* keep a saved copy in sync if edited after saving */
    if (cur && saved.some(s => s.id === cur.id)) setSaved(sv => sv.map(s => (s.id === cur.id ? cur : s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur])

  const sorted = cur ? [...cur.items].sort((a, b) => b.score - a.score) : []
  const high = sorted.filter(i => i.priority === 'high')
  const stats = cur ? [
    ['Messages', cur.messages], ['High priority', high.length],
    ['Decisions', sorted.filter(i => i.tags.includes('decision')).length],
    ['Deadlines', sorted.filter(i => i.due).length],
    ['Open tasks', cur.tasks.filter(t => !t.done).length],
  ] : []
  const safeName = (cur?.title || 'catchup').replace(/[^\w-]+/g, '_')

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CatchUp AI <span className="font-normal text-slate-500">– What Did I Miss?</span></h1>
          <p className="text-sm text-slate-500">🔒 Runs entirely in your browser. Nothing is uploaded; data stays on this device.</p>
        </div>
        {note && <div role="status" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">{note}</div>}
      </header>

      <Card title="1 · Add a conversation" className="mb-6">
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">Your name (to find your mentions)
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={user} onChange={e => setUser(e.target.value)} placeholder="e.g. Alex" />
          </label>
          <label className="text-sm text-slate-600">Chat title
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Project group" />
          </label>
        </div>
        <textarea className="h-40 w-full rounded-lg border border-slate-300 p-3 font-mono text-sm" value={text} onChange={e => setText(e.target.value)}
          placeholder={'Paste chat here, e.g.\n[12/03/2025, 10:02] Sam: Please send the report by Friday'} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={primary} onClick={run}>Catch me up</button>
          <button className={ghost} onClick={() => fileRef.current?.click()}>Upload .txt file</button>
          <input ref={fileRef} type="file" accept=".txt,.md,.log,.csv,text/plain" hidden onChange={e => onFile(e.target.files?.[0])} />
          {SAMPLES.map(s => <button key={s.title} className={ghost} onClick={() => { setText(s.text); setTitle(s.title) }}>Sample: {s.title.split('–')[0].trim()}</button>)}
          <button className={ghost} onClick={() => { setText(''); setTitle('') }}>Clear</button>
        </div>
      </Card>

      {!cur ? (
        <p className="py-10 text-center text-slate-400">Your summary will appear here.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-slate-900">{v}</div>
                <div className="text-xs text-slate-500">{k}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-600 p-4 text-white">
            <p className="max-w-3xl text-sm">{cur.overview}</p>
            <div className="flex flex-wrap gap-2">
              <button className={`${btn} bg-white text-indigo-700 hover:bg-indigo-50`} onClick={save}>Save</button>
              <button className={`${btn} bg-indigo-500 hover:bg-indigo-400`} onClick={() => download(`${safeName}.md`, toMarkdown(cur), 'text/markdown')}>Export .md</button>
              <button className={`${btn} bg-indigo-500 hover:bg-indigo-400`} onClick={() => download(`${safeName}.json`, JSON.stringify(cur, null, 2), 'application/json')}>Export .json</button>
              <button className={`${btn} bg-indigo-500 hover:bg-indigo-400`} onClick={() => navigator.clipboard?.writeText(toMarkdown(cur)).then(() => say('Copied.'), () => say('Copy blocked by browser.'))}>Copy</button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="🔥 Needs attention first"><List items={high.length ? high : sorted.slice(0, 3)} empty="Nothing urgent 🎉" /></Card>
              <Card title="Mentions of you"><List items={sorted.filter(i => i.tags.includes('mention'))} empty={user ? 'No mentions found.' : 'Enter your name above to find mentions.'} /></Card>
              <Card title="Decisions"><List items={sorted.filter(i => i.tags.includes('decision'))} empty="No decisions detected." /></Card>
              <Card title="Deadlines & dates"><List items={sorted.filter(i => i.due)} empty="No deadlines detected." /></Card>
            </div>

            <div className="space-y-6">
              <Card title="Task list">
                <ul className="space-y-2">
                  {[...cur.tasks].sort((a, b) => Number(a.done) - Number(b.done)).map(t => (
                    <li key={t.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                      <div className="flex items-start gap-2">
                        <input type="checkbox" className="mt-2 h-4 w-4" checked={t.done} onChange={e => patch(t.id, { done: e.target.checked })} aria-label="Done" />
                        <textarea rows={2} className={`w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm hover:border-slate-300 ${t.done ? 'text-slate-400 line-through' : ''}`}
                          value={t.text} onChange={e => patch(t.id, { text: e.target.value })} />
                        <button className="text-slate-400 hover:text-red-600" aria-label="Delete task" onClick={() => setCur(c => c && { ...c, tasks: c.tasks.filter(x => x.id !== t.id) })}>✕</button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 pl-6 text-xs">
                        <select className="rounded border border-slate-300 bg-white px-1 py-0.5" value={t.priority} onChange={e => patch(t.id, { priority: e.target.value as Priority })}>
                          <option value="high">high</option><option value="medium">medium</option><option value="low">low</option>
                        </select>
                        <input className="w-20 rounded border border-slate-300 px-1 py-0.5" value={t.owner} onChange={e => patch(t.id, { owner: e.target.value })} aria-label="Owner" />
                        <input className="w-24 rounded border border-slate-300 px-1 py-0.5" placeholder="due" value={t.due ?? ''} onChange={e => patch(t.id, { due: e.target.value })} aria-label="Due" />
                      </div>
                    </li>
                  ))}
                </ul>
                {!cur.tasks.length && <p className="text-sm text-slate-400">No tasks found. Add your own below.</p>}
                <div className="mt-3 flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Add a task" value={newTask}
                    onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} />
                  <button className={primary} onClick={addTask}>Add</button>
                </div>
              </Card>

              <Card title={`Saved summaries (${saved.length})`}>
                {!saved.length && <p className="text-sm text-slate-400">Nothing saved yet.</p>}
                <ul className="space-y-2">
                  {saved.map(s => (
                    <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 text-sm">
                      <button className="min-w-0 truncate text-left text-indigo-700 hover:underline" onClick={() => setCur(s)}>
                        {s.title}<span className="block text-xs text-slate-400">{new Date(s.createdAt).toLocaleString()}</span>
                      </button>
                      <button className="text-slate-400 hover:text-red-600" aria-label="Delete saved summary" onClick={() => setSaved(saved.filter(x => x.id !== s.id))}>✕</button>
                    </li>
                  ))}
                </ul>
                {!!saved.length && <button className={`${ghost} mt-3 w-full`} onClick={() => confirm('Delete all saved summaries?') && setSaved([])}>Delete all</button>}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
