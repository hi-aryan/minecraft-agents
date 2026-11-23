import { Bot } from 'mineflayer'
import { ask } from './llm'
import { choiceSchema, runChoice, describeChoice, Choice } from './actions'
import { Memory } from './memory'
import { systemPrompt, stepMessage } from './prompt'
import { Run } from './run'
import { log } from './log'

// The LLM brain. Repeats LOOK -> THINK -> ACT -> REMEMBER until the run is over
// (the referee decides: goal reached or time up) or the bot is disconnected.
export async function runAgent(bot: Bot, name: string, run: Run) {
  const teammates = run.agents.filter((agent) => agent !== name)
  const memory = new Memory()
  const system = systemPrompt(name, teammates)
  log(name, 'system-prompt', { text: system })

  let connected = true
  bot.once('end', () => {
    connected = false
  })

  for (let step = 1; ; step++) {
    if (run.over) return log(name, 'stopped', { reason: 'the run is over' })
    if (!connected) return log(name, 'stopped', { reason: 'disconnected' })

    const message = stepMessage(bot, memory, step, teammates) // LOOK
    const choice = (await ask(name, system, message, choiceSchema)) as Choice // THINK
    const result = await runChoice(bot, choice) // ACT
    memory.remember({ action: describeChoice(choice), result: result.text }, choice.notes, result.chest) // REMEMBER
    run.record(name, result)

    log(name, 'step', { step, thought: choice.thought, action: describeChoice(choice), result: result.text, notes: choice.notes })
  }
}
