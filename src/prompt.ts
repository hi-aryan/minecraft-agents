import { Bot } from 'mineflayer'
import { actions } from './actions'
import { config } from './config'
import { Memory } from './memory'
import { count, describeCounts } from './skills'

// Builds the text the LLM sees. All prompt wording lives in this file.

// Sent once per call as the "system prompt": who the agent is and the rules.
export function systemPrompt(name: string): string {
  const menu = actions.map((a) => `- ${a.name}: ${a.description}`).join('\n')
  return `You are ${name}, a player in Minecraft.

Your goal: get ${describeCounts(config.goal)} into the shared chest.

Each turn you choose exactly one action. Our game code carries it out and tells you the result.
Actions:
${menu}

Rules:
- You only know the chest's contents from the last time you opened it (deposit or check).
- Items count only once they are in the chest.
- If an action fails, the result says why. If it keeps failing, try something different.
- Keep your notes short. Write what your future self needs to know.`
}

// Sent every step: the current situation.
export function stepMessage(bot: Bot, memory: Memory, step: number): string {
  const inventory = describeCounts(count(bot.inventory.items()))
  const chest = memory.chest
    ? `${describeCounts(memory.chest.counts)} (seen ${secondsAgo(memory.chest.seenAt)} seconds ago)`
    : 'unknown (you have not opened it yet)'
  const recent = memory.steps.length > 0
    ? memory.steps.map((s) => `- ${s.action} -> ${s.result}`).join('\n')
    : '- (nothing yet)'

  return `Step ${step} of at most ${config.maxSteps}.

FACTS
- You carry: ${inventory}
- Shared chest: ${chest}

YOUR NOTES
${memory.notes || '(none yet)'}

RECENT STEPS (oldest first)
${recent}

Choose your next action.`
}

function secondsAgo(time: number): number {
  return Math.round((Date.now() - time) / 1000)
}
