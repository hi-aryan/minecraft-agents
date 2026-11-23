import { Bot } from 'mineflayer'
import { createBot } from './bot'
import { runAgent } from './agent'
import { runScripted } from './scripted'
import { Run } from './run'
import { config } from './config'
import { log } from './log'

// A brain decides what a bot does.
const brains: Record<string, (bot: Bot, name: string, run: Run) => Promise<void>> = {
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

async function main() {
  const names = config.botNames.slice(0, botCount)

  // Everyone joins first, so joining time isn't part of the run. If a bot can't join, there is no run.
  const bots = await Promise.all(names.map(createBot)).catch((err) => {
    console.error(`Could not start the run: ${err}`)
    process.exit(1)
  })

  const run = new Run(names, brainName) // the clock starts here
  await Promise.all(names.map((name, i) => startBrain(bots[i], name, run)))
  run.end('all agents stopped') // e.g. every agent crashed; does nothing if the run already ended
}

// Runs one bot's brain. If it crashes, the others keep going.
async function startBrain(bot: Bot, name: string, run: Run) {
  try {
    await brain(bot, name, run)
    log(name, 'finished')
  } catch (err) {
    log(name, 'crashed', { message: String(err) })
  } finally {
    bot.quit() // always leave the server, also when the brain crashed
  }
}

main()
