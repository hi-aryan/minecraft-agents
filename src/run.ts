import { config } from './config'
import { count, Counts, Resource, SkillResult } from './skills'
import { log } from './log'

// The referee of one run. It keeps the real score (everything deposited into the chest)
// and ends the run when the goal is reached or the time is up.
// Agents never see this: each agent only knows what it saw itself.
export class Run {
  readonly agents: string[]
  private readonly started = Date.now()
  private readonly deposited: Counts = count([]) // starts at 0 of everything
  private endReason: string | null = null
  private readonly timer: NodeJS.Timeout

  constructor(agents: string[], brain: string) {
    this.agents = agents
    log('run', 'run-start', { agents, brain, goal: config.goal, timeLimitMinutes: config.timeLimitMinutes, model: config.model })
    this.timer = setTimeout(() => this.end('time limit'), config.timeLimitMinutes * 60 * 1000)
  }

  get over(): boolean {
    return this.endReason !== null
  }

  // Called with every skill result. Only deposits change the score, and only while the run is going.
  record(agent: string, result: SkillResult) {
    if (!result.deposited || this.over) return
    for (const r of Object.keys(this.deposited) as Resource[]) this.deposited[r] += result.deposited[r]
    log('run', 'progress', { by: agent, score: { ...this.deposited } })
    if (goalReached(this.deposited)) this.end('goal reached')
  }

  // Ends the run once. Later calls do nothing.
  end(reason: string) {
    if (this.over) return
    this.endReason = reason
    clearTimeout(this.timer)
    log('run', 'run-end', { reason, seconds: Math.round((Date.now() - this.started) / 1000), score: { ...this.deposited } })
  }
}

function goalReached(score: Counts): boolean {
  return (Object.keys(config.goal) as Resource[]).every((r) => score[r] >= config.goal[r])
}
