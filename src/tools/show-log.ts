import fs from 'fs'
import path from 'path'
import { logDir } from '../log'

// Prints a run's log as readable text, including everything sent to and from the LLM.
// Usage: "npm run log" (the latest run, also while it is still running) or "npm run log -- logs/<file>.jsonl"

const file = process.argv[2] ?? latestLog()

// Per-agent numbers for the summary at the end.
type Stats = { steps: number; failedSteps: number; takenByOthers: number; tokensIn: number; tokensOut: number }
const stats = new Map<string, Stats>()
function statsFor(agent: string): Stats {
  if (!stats.has(agent)) stats.set(agent, { steps: 0, failedSteps: 0, takenByOthers: 0, tokensIn: 0, tokensOut: 0 })
  return stats.get(agent)!
}

for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const { agent, type, time, ...data } = JSON.parse(line)
  addToStats(agent, type, data)

  if (type === 'system-prompt') {
    console.log(`\n===== ${agent}: SYSTEM PROMPT =====\n${data.text}`)
  } else if (type === 'llm') {
    console.log(`\n----- ${agent}: message to the LLM (${data.ms} ms, ${data.tokensIn} tokens in, ${data.tokensOut} out) -----`)
    console.log(data.message ?? '(not recorded in this log)')
    console.log(`>>> reply: ${data.reply ?? '(not recorded in this log)'}`)
  } else {
    console.log(`[${agent}] ${type} ${JSON.stringify(data)}`)
  }
}

console.log('\n===== SUMMARY =====')
console.table(Object.fromEntries(stats))

function addToStats(agent: string, type: string, data: Record<string, any>) {
  if (type === 'llm') {
    statsFor(agent).tokensIn += data.tokensIn
    statsFor(agent).tokensOut += data.tokensOut
  } else if (type === 'step') {
    statsFor(agent).steps++
    if (/^(Failed|Invalid)/.test(data.result)) statsFor(agent).failedSteps++
  } else if (type === 'taken-by-other') {
    statsFor(agent).takenByOthers++
  }
}

function latestLog(): string {
  const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.jsonl')).sort()
  if (files.length === 0) throw new Error(`No logs in ${logDir}`)
  return path.join(logDir, files[files.length - 1])
}
