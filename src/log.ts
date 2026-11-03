import fs from 'fs'
import path from 'path'

// One log file per run, e.g. logs/2026-11-02T16-30-00-000Z.jsonl, always in the project's logs/ folder.
const dir = path.join(__dirname, '..', 'logs')
fs.mkdirSync(dir, { recursive: true })
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)

// Prints "[benny] gather {...}" and saves the same event as one JSON line.
export function log(agent: string, type: string, data: object = {}) {
  const entry = { time: Date.now(), agent, type, ...data }
  const details = Object.keys(data).length > 0 ? JSON.stringify(data) : ''
  console.log(`[${agent}] ${type} ${details}`)
  fs.appendFileSync(file, JSON.stringify(entry) + '\n')
}
