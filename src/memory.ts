import { Counts } from './skills'

// One agent's memory. The LLM itself remembers nothing between calls,
// so everything it should know is kept here and put into every prompt.

const MAX_STEPS_REMEMBERED = 10

export type Step = { action: string; result: string }

export class Memory {
  notes = '' // the agent's latest note to itself (replaced every step)
  steps: Step[] = [] // the last 10 steps, oldest first
  chest: { counts: Counts; seenAt: number } | null = null // what was in the chest last time it looked

  remember(step: Step, notes: string, chest?: Counts) {
    this.steps.push(step)
    if (this.steps.length > MAX_STEPS_REMEMBERED) this.steps.shift() // forget the oldest
    this.notes = notes
    if (chest) this.chest = { counts: chest, seenAt: Date.now() }
  }
}
