import mineflayer, { Bot } from 'mineflayer'
import { pathfinder, Movements } from 'mineflayer-pathfinder'
import { config } from './config'
import { log } from './log'

// Creates a bot, loads its plugins, and resolves once it has spawned in the world.
export function createBot(name: string): Promise<Bot> {
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    version: config.version,
    username: name,
    auth: 'offline',
  })

  bot.loadPlugin(pathfinder)

  bot.on('kicked', (reason) => log(name, 'kicked', { reason }))
  bot.on('end', (reason) => log(name, 'disconnected', { reason }))
  bot.on('error', (err) => log(name, 'error', { message: err.message }))

  return new Promise((resolve, reject) => {
    bot.once('spawn', async () => {
      bot.pathfinder.setMovements(new Movements(bot))
      bot.pathfinder.thinkTimeout = 10000 // ms to plan a route; several bots planning at once are slower
      await bot.waitForChunksToLoad() // otherwise the bot can't see the world yet
      log(name, 'spawned')
      resolve(bot)
    })
    bot.once('error', reject) // e.g. the server isn't running
    bot.once('end', (reason) => reject(new Error(`${name} disconnected before spawning: ${reason}`)))
  })
}
