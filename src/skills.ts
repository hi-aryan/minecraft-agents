import { Bot, Chest } from 'mineflayer'
import { Block } from 'prismarine-block'
import { goals, Move } from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { config } from './config'
import { log } from './log'
import { withTimeout } from './timeout'

// Skills are the actions a bot can do. Each one returns a short sentence about what happened
// (`text`, which the LLM reads). The chest skills also return numbers: what was in the chest
// (`chest`, for the agent's memory) and what was deposited (`deposited`, for the referee).

// The resources the team can collect. A block and the item it drops can have different names
// (stone drops cobblestone), so each resource says how to recognise both.
// To add stone later: stone: { isBlock: (n) => n === 'stone', isItem: (n) => n === 'cobblestone' }
export const resources = {
  wood: { isBlock: (name: string) => name.endsWith('_log'), isItem: (name: string) => name.endsWith('_log') },
}
export type Resource = keyof typeof resources
export type Counts = Record<Resource, number> // e.g. { wood: 12 }

export type SkillResult = { text: string; chest?: Counts; deposited?: Counts }

// Time limits, in seconds. A bot gives up instead of getting stuck forever.
const GATHER_TIMEOUT = 60 // for the whole gather action: after this, no new blocks are started
const WALK_TIMEOUT = 60
const DIG_TIMEOUT = 15
const PICKUP_TIMEOUT = 10
const OPEN_CHEST_TIMEOUT = 10
const SEARCH_DISTANCE = 64
const MIN_CANDIDATES = 10 // how many nearby blocks gather considers, at least

// Blocks each bot could not reach (e.g. too high up a tree), so gather doesn't try them again and again.
const unreachable = new WeakMap<Bot, Set<string>>()
function unreachableFor(bot: Bot): Set<string> {
  if (!unreachable.has(bot)) unreachable.set(bot, new Set())
  return unreachable.get(bot)!
}

// ---------- Skills ----------

// Collects up to `amount` blocks of a resource, nearest first. Blocks it can't reach are skipped.
// Stops starting new blocks after GATHER_TIMEOUT, so the agent gets to think again soon.
export async function gather(bot: Bot, resource: Resource, amount: number): Promise<SkillResult> {
  const deadline = Date.now() + GATHER_TIMEOUT * 1000
  try {
    const skip = unreachableFor(bot)
    const blocks = findNearest(bot, resource, Math.max(MIN_CANDIDATES, amount * 3) + skip.size)
      .filter((block) => !skip.has(block.position.toString()))
    if (blocks.length === 0) return { text: `No ${resource} within ${SEARCH_DISTANCE} blocks.` }

    const before = countItems(bot.inventory.items(), resource)
    let lastProblem = ''
    let taken = 0 // blocks a teammate got to first
    for (const block of blocks) {
      if (countItems(bot.inventory.items(), resource) - before >= amount) break
      if (Date.now() > deadline) {
        lastProblem = `ran out of time after ${GATHER_TIMEOUT} seconds`
        break
      }
      try {
        await mine(bot, block)
      } catch (err) {
        lastProblem = describeError(err)
        if (err instanceof TakenByOther) {
          taken++
          log(bot.username, 'taken-by-other', { resource }) // duplicated work, for the analysis
        } else if (bot.blockAt(block.position)?.name === block.name) {
          skip.add(block.position.toString()) // still there, but we couldn't get it: don't try it again
        }
      }
    }

    const gained = countItems(bot.inventory.items(), resource) - before
    const takenText = taken > 0 ? ` ${taken} ${resource} you went for was taken by another player first.` : ''
    if (gained === 0) return { text: `Failed: could not get any ${resource} (${lastProblem}).${takenText}` }
    return { text: `Collected ${gained} ${resource}.${takenText} Carrying ${describe(bot.inventory.items())}.` }
  } catch (err) {
    return failed(err)
  }
}

// Walks to the shared chest and puts every resource item in it.
export async function depositToChest(bot: Bot): Promise<SkillResult> {
  const items = bot.inventory.items().filter((item) => isResource(item.name))
  if (items.length === 0) return { text: 'Nothing to deposit.' } // don't walk to the chest for nothing
  try {
    return await useChest(bot, async (chest) => {
      for (const item of items) {
        await chest.deposit(item.type, null, item.count)
      }
      const inChest = chest.containerItems()
      return {
        text: `Deposited ${describe(items)}. The chest now has ${describe(inChest)}.`,
        chest: count(inChest),
        deposited: count(items),
      }
    })
  } catch (err) {
    return failed(err)
  }
}

// Walks to the shared chest and reports what is in it.
export async function checkChest(bot: Bot): Promise<SkillResult> {
  try {
    return await useChest(bot, async (chest) => {
      const inChest = chest.containerItems()
      return { text: `The chest has ${describe(inChest)}.`, chest: count(inChest) }
    })
  } catch (err) {
    return failed(err)
  }
}

// ---------- Helpers ----------

type Item = { name: string; count: number }

function isResource(itemName: string): boolean {
  return Object.values(resources).some((r) => r.isItem(itemName))
}

function countItems(items: Item[], resource: Resource): number {
  return items.filter((item) => resources[resource].isItem(item.name)).reduce((sum, item) => sum + item.count, 0)
}

// e.g. { wood: 12 }
export function count(items: Item[]): Counts {
  const counts = {} as Counts
  for (const r of Object.keys(resources) as Resource[]) counts[r] = countItems(items, r)
  return counts
}

// e.g. "12 wood"
export function describeCounts(counts: Counts): string {
  return Object.entries(counts).map(([r, n]) => `${n} ${r}`).join(', ')
}

function describe(items: Item[]): string {
  return describeCounts(count(items))
}

function findNearest(bot: Bot, resource: Resource, max: number): Block[] {
  const ids = bot.registry.blocksArray.filter((b) => resources[resource].isBlock(b.name)).map((b) => b.id)
  return bot
    .findBlocks({ matching: ids, maxDistance: SEARCH_DISTANCE, count: max })
    .map((pos) => bot.blockAt(pos))
    .filter((block): block is Block => block !== null)
}

// Thrown when the block disappeared before we could break it: another player broke it first.
class TakenByOther extends Error {
  constructor() {
    super('another player took it first')
  }
}

// Walks to a block, breaks it, and picks up what it drops.
async function mine(bot: Bot, block: Block) {
  const pos = block.position
  const isGone = () => bot.blockAt(pos)?.name !== block.name
  try {
    await walk(bot, new goals.GoalLookAtBlock(pos, bot.world), WALK_TIMEOUT)
  } catch (err) {
    throw isGone() ? new TakenByOther() : err
  }
  if (isGone()) throw new TakenByOther()
  await withTimeout(bot.dig(bot.blockAt(pos)!), DIG_TIMEOUT, () => bot.stopDigging())

  await bot.waitForTicks(10) // give the dropped item a moment to land
  const drop = bot.nearestEntity((e) => e.name === 'item' && e.position.distanceTo(pos) < 8)
  if (drop) {
    const { x, y, z } = drop.position.floored()
    await walk(bot, new goals.GoalBlock(x, y, z), PICKUP_TIMEOUT)
    await bot.waitForTicks(5) // picking up happens a moment after arriving
  }
}

// Walks to the shared chest, opens it, runs `action`, and always closes the chest again.
async function useChest<T>(bot: Bot, action: (chest: Chest) => Promise<T>): Promise<T> {
  const { x, y, z } = config.chest
  await walk(bot, new goals.GoalNear(x, y, z, 2), WALK_TIMEOUT)
  const block = bot.blockAt(new Vec3(x, y, z))
  if (!block || block.name !== 'chest') throw new Error(`no chest at ${x} ${y} ${z}`)

  const chest = await withTimeout(bot.openChest(block), OPEN_CHEST_TIMEOUT)
  try {
    return await action(chest)
  } finally {
    chest.close()
  }
}

// Walks until `goal` is reached. Gives up (and stops walking) after `seconds`.
async function walk(bot: Bot, goal: goals.Goal, seconds: number): Promise<void> {
  // setGoal(null) stops right away. (stop() waits for a safe moment, which can cancel the next walk.)
  await withTimeout(bot.pathfinder.goto(goal), seconds, () => bot.pathfinder.setGoal(null))
  // pathfinder sometimes reports success without moving, so check that we really arrived
  const here = bot.entity.position.floored() as unknown as Move // isEnd only reads x, y, z
  if (!goal.isEnd(here)) throw new Error('did not arrive')
}

function failed(err: unknown): SkillResult {
  return { text: `Failed: ${describeError(err)}` }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  return String(err)
}
