import { createBot } from './bot'
import { runScripted } from './scripted'
import { config } from './config'
import { log } from './log'

// Starts one bot and gives it a brain. Right now the brain is the fixed test plan.
// In Phase 2 we swap runScripted for the LLM brain.
async function startAgent(name: string) {
  const bot = await createBot(name)
  await runScripted(bot, name)
  log(name, 'finished')
  bot.quit()
}

// "npm start" runs 1 bot. "npm start 4" runs 4 bots at the same time.
const botCount = Number(process.argv[2] ?? 1)
const maxBots = config.botNames.length
if (!Number.isInteger(botCount) || botCount < 1 || botCount > maxBots) {
  console.error(`Usage: npm start [number of bots, 1-${maxBots}]`)
  process.exit(1)
}

for (const name of config.botNames.slice(0, botCount)) {
  // If one bot crashes, the others keep going.
  startAgent(name).catch((err) => log(name, 'crashed', { message: String(err) }))
}
