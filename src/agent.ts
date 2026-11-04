import { Bot } from 'mineflayer'
import { ask } from './llm'
import { choiceSchema, runChoice, describeChoice, Choice } from './actions'
import { Memory } from './memory'
import { systemPrompt, stepMessage } from './prompt'
import { config } from './config'
import { Counts, Resource } from './skills'
import { log } from './log'

// The LLM brain. Repeats LOOK -> THINK -> ACT -> REMEMBER until the goal is reached,
// the step limit is hit, or the bot is disconnected.
export async function runAgent(bot: Bot, name: string) {
  const memory = new Memory()
  const system = systemPrompt(name)
  log(name, 'system-prompt', { text: system })

  let connected = true
  bot.once('end', () => {
    connected = false
  })

  for (let step = 1; step <= config.maxSteps; step++) {
    if (!connected) return log(name, 'stopped', { reason: 'disconnected' })
    if (memory.chest && goalReached(memory.chest.counts)) return log(name, 'goal-reached', { step })

    const message = stepMessage(bot, memory, step) // LOOK
    const choice = (await ask(name, system, message, choiceSchema)) as Choice // THINK
    const result = await runChoice(bot, choice) // ACT
    memory.remember({ action: describeChoice(choice), result: result.text }, choice.notes, result.chest) // REMEMBER

    log(name, 'step', { step, thought: choice.thought, action: describeChoice(choice), result: result.text, notes: choice.notes })
  }
  log(name, 'stopped', { reason: `reached the limit of ${config.maxSteps} steps` })
}

function goalReached(chest: Counts): boolean {
  return (Object.keys(config.goal) as Resource[]).every((r) => chest[r] >= config.goal[r])
}
