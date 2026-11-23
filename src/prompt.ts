import { Bot } from 'mineflayer'
import { actions } from './actions'
import { config } from './config'
import { Memory } from './memory'
import { count, describeCounts } from './skills'

// Builds the text the LLM sees. All prompt wording lives in this file.

const NEARBY_DISTANCE = 32 // teammates closer than this (in blocks) are visible

// Sent once per call as the "system prompt": who the agent is, the team, and the rules.
export function systemPrompt(name: string, teammates: string[]): string {
  const menu = actions.map((a) => `- ${a.name}: ${a.description}`).join('\n')
  return `You are ${name}, a player in Minecraft.

${describeTeam(teammates)}

Your team's goal: get ${describeCounts(config.goal)} into the shared chest.

Each turn you choose exactly one action. Our game code carries it out and tells you the result.
Actions:
${menu}

Rules:
- You only know the chest's contents from the last time you opened it (deposit or check).
- Items count only once they are in the chest. Items deposited by any player count.
- If an action fails, the result says why. If it keeps failing, try something different.
- Keep your notes short. Write what your future self needs to know.`
}

function describeTeam(teammates: string[]): string {
  if (teammates.length === 0) return 'You are working alone.'
  return `You are in a team with ${teammates.length} other players (${teammates.join(', ')}). Each of them is also controlled by an AI, like you. You all share the same goal and the same chest. You cannot talk to each other.`
}

// Sent every step: the current situation.
export function stepMessage(bot: Bot, memory: Memory, step: number, teammates: string[]): string {
  const inventory = describeCounts(count(bot.inventory.items()))
  const chest = memory.chest
    ? `${describeCounts(memory.chest.counts)} (seen ${secondsAgo(memory.chest.seenAt)} seconds ago)`
    : 'unknown (you have not opened it yet)'
  const recent = memory.steps.length > 0
    ? memory.steps.map((s) => `- ${s.action} -> ${s.result}`).join('\n')
    : '- (nothing yet)'

  return `Step ${step}.

FACTS
- You carry: ${inventory}
- Shared chest: ${chest}
- Players near you: ${describeNearby(bot, teammates)}

YOUR NOTES
${memory.notes || '(none yet)'}

RECENT STEPS (oldest first)
${recent}

Choose your next action.`
}

// e.g. "kenny (5 blocks away), lenny (12 blocks away)", nearest first
function describeNearby(bot: Bot, teammates: string[]): string {
  const nearby: { name: string; distance: number }[] = []
  for (const name of teammates) {
    const entity = bot.players[name]?.entity // missing when they are too far away to see
    if (!entity) continue
    const distance = Math.round(entity.position.distanceTo(bot.entity.position))
    if (distance <= NEARBY_DISTANCE) nearby.push({ name, distance })
  }
  if (nearby.length === 0) return 'none'
  nearby.sort((a, b) => a.distance - b.distance)
  return nearby.map((p) => `${p.name} (${p.distance} blocks away)`).join(', ')
}

function secondsAgo(time: number): number {
  return Math.round((Date.now() - time) / 1000)
}
