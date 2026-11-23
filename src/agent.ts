import { Bot } from 'mineflayer'
import { ask } from './llm'
import { choiceSchema, runChoice, describeChoice, Choice } from './actions'
import { Memory } from './memory'
import { systemPrompt, stepMessage } from './prompt'
import { Run } from './run'
import { config } from './config'
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
    tellObserver(bot, `[step ${step}] ${describeChoice(choice)}: ${choice.thought}`)
    const result = await runChoice(bot, choice) // ACT
    memory.remember({ action: describeChoice(choice), result: result.text }, choice.notes, result.chest) // REMEMBER
    run.record(name, result)

    log(name, 'step', { step, thought: choice.thought, action: describeChoice(choice), result: result.text, notes: choice.notes })
  }
}

const MAX_CHAT_LENGTH = 256 // Minecraft's limit for one chat message, including the command

// Whispers to the human observer, if they are online. A whisper is private: other agents never see it,
// so it doesn't count as communication between agents.
function tellObserver(bot: Bot, text: string) {
  const observer = config.observer
  if (!observer || !bot.players[observer]) return
  bot.chat(`/msg ${observer} ${text}`.slice(0, MAX_CHAT_LENGTH))
}
