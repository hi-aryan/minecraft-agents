import fs from 'fs'
import path from 'path'

// One log file per run, e.g. logs/2026-11-02T16-30-00-000Z.jsonl, always in the project's logs/ folder.
export const logDir = path.join(__dirname, '..', 'logs')
fs.mkdirSync(logDir, { recursive: true })
const file = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)

const MAX_TERMINAL_TEXT = 200 // longer texts (like full prompts) are only shown in the log file

// Prints "[benny] gather {...}" and saves the same event, in full, as one JSON line.
export function log(agent: string, type: string, data: object = {}) {
  const entry = { time: Date.now(), agent, type, ...data }
  fs.appendFileSync(file, JSON.stringify(entry) + '\n')

  const short = Object.fromEntries(
    Object.entries(data).map(([key, value]) =>
      typeof value === 'string' && value.length > MAX_TERMINAL_TEXT ? [key, `(${value.length} characters, see log)`] : [key, value],
    ),
  )
  const details = Object.keys(short).length > 0 ? JSON.stringify(short) : ''
  console.log(`[${agent}] ${type} ${details}`)
}
