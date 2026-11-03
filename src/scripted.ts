import { Bot } from 'mineflayer'
import { gather, depositToChest } from './skills'
import { log } from './log'

// A "brain" with a fixed plan and no AI: gather 4 wood, deposit, 4 times.
// Used to test that the skills work. In Phase 2 an LLM brain takes its place.
export async function runScripted(bot: Bot, name: string) {
  for (let round = 1; round <= 4; round++) {
    log(name, 'gather', { result: await gather(bot, 'wood', 4) })
    log(name, 'depositToChest', { result: await depositToChest(bot) })
  }
}
