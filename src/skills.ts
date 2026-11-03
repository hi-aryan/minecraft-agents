import { Bot, Chest } from 'mineflayer'
import { Block } from 'prismarine-block'
import { goals, Move } from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { config } from './config'

// Skills are the actions a bot can do. Each one returns a short sentence about what happened.
// In Phase 2 the LLM chooses which skill to run, and reads that sentence.

// The resources the team can collect. A block and the item it drops can have different names
// (stone drops cobblestone), so each resource says how to recognise both.
// To add stone later: stone: { isBlock: (n) => n === 'stone', isItem: (n) => n === 'cobblestone' }
export const resources = {
  wood: { isBlock: (name: string) => name.endsWith('_log'), isItem: (name: string) => name.endsWith('_log') },
}
export type Resource = keyof typeof resources

// Time limits, in seconds. A bot gives up instead of getting stuck forever.
const WALK_TIMEOUT = 60
const DIG_TIMEOUT = 15
const PICKUP_TIMEOUT = 10
const OPEN_CHEST_TIMEOUT = 10
const SEARCH_DISTANCE = 64

// ---------- Skills ----------

// Collects up to `amount` blocks of a resource, nearest first. Blocks it can't reach are skipped.
export async function gather(bot: Bot, resource: Resource, amount: number): Promise<string> {
  try {
    const blocks = findNearest(bot, resource, amount * 3) // extra, in case some can't be reached
    if (blocks.length === 0) return `No ${resource} within ${SEARCH_DISTANCE} blocks.`

    const before = countItems(bot.inventory.items(), resource)
    let lastProblem = ''
    for (const block of blocks) {
      if (countItems(bot.inventory.items(), resource) - before >= amount) break
      try {
        await mine(bot, block)
      } catch (err) {
        lastProblem = describeError(err) // try the next block
      }
    }

    const gained = countItems(bot.inventory.items(), resource) - before
    if (gained === 0) return `Failed: could not get any ${resource} (${lastProblem}).`
    return `Collected ${gained} ${resource}. Carrying ${describe(bot.inventory.items())}.`
  } catch (err) {
    return failed(err)
  }
}

// Walks to the shared chest and puts every resource item in it.
export async function depositToChest(bot: Bot): Promise<string> {
  const items = bot.inventory.items().filter((item) => isResource(item.name))
  if (items.length === 0) return 'Nothing to deposit.' // don't walk to the chest for nothing
  try {
    return await useChest(bot, async (chest) => {
      for (const item of items) {
        await chest.deposit(item.type, null, item.count)
      }
      return `Deposited ${describe(items)}. The chest now has ${describe(chest.containerItems())}.`
    })
  } catch (err) {
    return failed(err)
  }
}

// Walks to the shared chest and reports what is in it.
export async function checkChest(bot: Bot): Promise<string> {
  try {
    return await useChest(bot, async (chest) => `The chest has ${describe(chest.containerItems())}.`)
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

// e.g. "12 wood"
function describe(items: Item[]): string {
  return (Object.keys(resources) as Resource[]).map((r) => `${countItems(items, r)} ${r}`).join(', ')
}

function findNearest(bot: Bot, resource: Resource, count: number): Block[] {
  const ids = bot.registry.blocksArray.filter((b) => resources[resource].isBlock(b.name)).map((b) => b.id)
  return bot
    .findBlocks({ matching: ids, maxDistance: SEARCH_DISTANCE, count })
    .map((pos) => bot.blockAt(pos))
    .filter((block): block is Block => block !== null)
}

// Walks to a block, breaks it, and picks up what it drops.
async function mine(bot: Bot, block: Block) {
  const pos = block.position
  const isGone = () => bot.blockAt(pos)?.name !== block.name
  try {
    await walk(bot, new goals.GoalLookAtBlock(pos, bot.world), WALK_TIMEOUT)
  } catch (err) {
    throw isGone() ? new Error('another bot took it') : err
  }
  if (isGone()) throw new Error('another bot took it')
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

// Rejects if `task` takes longer than `seconds`. Then `onGiveUp` stops whatever the bot was doing.
async function withTimeout<T>(task: Promise<T>, seconds: number, onGiveUp: () => void = () => {}): Promise<T> {
  task.catch(() => {}) // if we give up, the stopped task's own error is ignored instead of crashing
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onGiveUp()
      reject(new Error(`gave up after ${seconds} seconds`))
    }, seconds * 1000)
  })
  try {
    return await Promise.race([task, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function failed(err: unknown): string {
  return `Failed: ${describeError(err)}`
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name
  return String(err)
}
