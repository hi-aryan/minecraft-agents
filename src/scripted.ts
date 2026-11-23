import { Bot } from 'mineflayer'
import { gather, depositToChest } from './skills'
import { Run } from './run'
import { log } from './log'

const ROUNDS = 8 // at most 8 x 4 = 32 wood per bot

// A "brain" with a fixed plan and no AI: gather 4 wood, deposit, repeat until the run is over.
// Used to test that the skills work, without the cost of LLM calls. The real brain is agent.ts.
export async function runScripted(bot: Bot, name: string, run: Run) {
  for (let round = 1; round <= ROUNDS && !run.over; round++) {
    log(name, 'gather', { result: (await gather(bot, 'wood', 4)).text })
    const deposit = await depositToChest(bot)
    log(name, 'depositToChest', { result: deposit.text })
    run.record(name, deposit)
  }
}
