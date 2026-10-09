// 100% local, rule-based analysis. No network, no API key, no model download.
import type { Item, Msg, Priority, Summary, Tag, Task } from './types'

const LINE = /^\s*((?:\[?\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\]?\s*[-–]?\s*|\[?\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?\]?\s*[-–]?\s*)?)([^:\n]{1,40}):\s+(.*)$/
const DATE = /\b(today|tonight|tomorrow|eod|end of (?:day|week)|next week|(?:by|before|on|due|until)\s+(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat|sun)[a-z]*|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}\s?(?:am|pm)|\d{1,2}[\/-]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b/i
const RX = {
  urgent: /\b(urgent|asap|immediately|critical|emergency|important|right now|last call|cancelled|canceled)\b|!{2,}/i,
  task: /\b(please|can you|could you|need(?:s)? to|have to|must|todo|to-do|action item|don't forget|remember to|i'll|i will|submit|send|bring|prepare|finish|review|update|upload)\b/i,
  decision: /\b(decided|decision|let'?s go with|going with|agreed|we(?:'ll| will) (?:go|use|meet)|confirmed|approved|settled|moved to|rescheduled)\b/i,
}
const WEIGHT: Record<Tag, number> = { urgent: 3, deadline: 2, mention: 3, task: 2, decision: 2, question: 1 }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function parse(raw: string): Msg[] {
  const out: Msg[] = []
  for (const l of raw.split(/\r?\n/)) {
    if (!l.trim()) continue
    const m = l.match(LINE)
    if (m) out.push({ id: out.length, time: m[1].trim() || undefined, author: m[2].trim(), text: m[3].trim() })
    else if (out.length) out[out.length - 1].text += ' ' + l.trim()
  }
  return out
}

const prio = (s: number): Priority => (s >= 6 ? 'high' : s >= 3 ? 'medium' : 'low')
const clip = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function analyze(raw: string, user: string, title: string): Summary {
  const msgs = parse(raw)
  const me = user.trim()
  const meRx = me ? new RegExp(`(^|\\W)@?${esc(me)}\\b`, 'i') : null
  const bcast = /@(all|everyone|channel|here)\b/i
  const items: Item[] = []
  for (const msg of msgs) {
    const t = msg.text
    const tags: Tag[] = []
    const mine = !!me && msg.author.toLowerCase() === me.toLowerCase()
    const due = t.match(DATE)?.[0]
    if (RX.urgent.test(t)) tags.push('urgent')
    if (due) tags.push('deadline')
    if (RX.decision.test(t)) tags.push('decision')
    if (RX.task.test(t)) tags.push('task')
    if (!mine && ((meRx && meRx.test(t)) || bcast.test(t))) tags.push('mention')
    if (t.includes('?') && tags.includes('mention')) tags.push('question')
    if (!tags.length) continue
    const score = tags.reduce((n, g) => n + WEIGHT[g], 0)
    items.push({ msg, score, priority: prio(score), tags, due })
  }
  const tasks: Task[] = items.filter(i => i.tags.includes('task') || (i.tags.includes('mention') && i.due)).map(i => {
    const t = i.msg.text
    const at = t.match(/@(\w+)/)?.[1]
    const owner = i.tags.includes('mention') && me ? me : at ?? (/\b(i'll|i will)\b/i.test(t) ? i.msg.author : 'Unassigned')
    return { id: uid(), text: clip(t), owner, due: i.due, priority: i.priority, done: false }
  })
  const high = items.filter(i => i.priority === 'high').length
  const top = [...items].sort((a, b) => b.score - a.score)[0]
  const overview = msgs.length
    ? `${msgs.length} messages from ${new Set(msgs.map(m => m.author)).size} people. ${high} high-priority, ${items.filter(i => i.tags.includes('decision')).length} decisions, ${tasks.length} tasks, ${items.filter(i => i.tags.includes('mention')).length} mention you.` +
      (top ? ` Start with: "${clip(top.msg.text, 90)}"` : '')
    : 'No messages recognised. Use lines like "Name: message".'
  return { id: uid(), title: title || 'Untitled chat', createdAt: new Date().toISOString(), user: me, messages: msgs.length, people: new Set(msgs.map(m => m.author)).size, overview, items, tasks }
}

export function toMarkdown(s: Summary): string {
  const sec = (h: string, rows: string[]) => (rows.length ? `\n## ${h}\n${rows.join('\n')}\n` : '')
  const line = (i: Item) => `- [${i.priority.toUpperCase()}] **${i.msg.author}**: ${i.msg.text}${i.due ? ` _(when: ${i.due})_` : ''}`
  const by = [...s.items].sort((a, b) => b.score - a.score)
  return `# CatchUp: ${s.title}\n_${new Date(s.createdAt).toLocaleString()}_\n\n${s.overview}\n` +
    sec('Needs attention first', by.filter(i => i.priority === 'high').map(line)) +
    sec('Decisions', by.filter(i => i.tags.includes('decision')).map(line)) +
    sec('Deadlines', by.filter(i => i.due).map(line)) +
    sec('Mentions', by.filter(i => i.tags.includes('mention')).map(line)) +
    sec('Tasks', s.tasks.map(t => `- [${t.done ? 'x' : ' '}] ${t.text} (owner: ${t.owner}${t.due ? `, due: ${t.due}` : ''}, ${t.priority})`))
}
