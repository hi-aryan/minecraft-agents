import { Bot } from 'mineflayer'
import { createBot } from './bot'
import { runAgent } from './agent'
import { runScripted } from './scripted'
import { config } from './config'
import { log } from './log'

// A brain decides what a bot does.
const brains: Record<string, (bot: Bot, name: string) => Promise<void>> = {
  llm: runAgent, // the LLM decides every step
  scripted: runScripted, // fixed test plan, no AI, no cost
}

// Usage: "npm start" = 1 LLM agent. "npm start 4" = 4 LLM agents. "npm start 4 scripted" = 4 scripted bots.
const [countArg = '1', brainName = 'llm'] = process.argv.slice(2)
const botCount = Number(countArg)
const maxBots = config.botNames.length
const brain = brains[brainName]
if (!Number.isInteger(botCount) || botCount < 1 || botCount > maxBots || !brain) {
  console.error(`Usage: npm start [number of bots, 1-${maxBots}] [${Object.keys(brains).join(' | ')}]`)
  process.exit(1)
}

// Starts one bot and gives it the brain.
async function startAgent(name: string) {
  const bot = await createBot(name)
  try {
    await brain(bot, name)
    log(name, 'finished')
  } finally {
    bot.quit() // always leave the server, also when the brain crashed
  }
}

for (const name of config.botNames.slice(0, botCount)) {
  // If one bot crashes, the others keep going.
  startAgent(name).catch((err) => log(name, 'crashed', { message: String(err) }))
}
