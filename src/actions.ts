import { Bot } from 'mineflayer'
import { gather, depositToChest, checkChest, resources, Resource, SkillResult } from './skills'

// The menu of actions the LLM can choose from. Each action runs one skill.
// To add an action: add one entry here.

const MAX_GATHER = 4 // small, so the agent thinks again often

// What the LLM answers every step.
export type Choice = {
  thought: string // why it chose this (for us to read in the logs)
  action: string
  resource?: string // only for gather
  amount?: number // only for gather
  notes: string // a note to its future self
}

type Action = {
  name: string
  description: string // what the LLM reads
  check?: (choice: Choice) => string | null // returns a problem, or null if the choice is fine
  run: (bot: Bot, choice: Choice) => Promise<SkillResult>
}

const resourceNames = Object.keys(resources)

export const actions: Action[] = [
  {
    name: 'gather',
    description: `Walk to the nearest ${resourceNames.join('/')} and collect "amount" of it (1-${MAX_GATHER}). Needs "resource" and "amount".`,
    check: (c) => {
      if (!c.resource || !resourceNames.includes(c.resource)) return `"resource" must be one of: ${resourceNames.join(', ')}`
      if (!Number.isInteger(c.amount) || c.amount! < 1 || c.amount! > MAX_GATHER) return `"amount" must be a whole number from 1 to ${MAX_GATHER}`
      return null
    },
    run: (bot, c) => gather(bot, c.resource as Resource, c.amount!),
  },
  {
    name: 'depositToChest',
    description: 'Walk to the shared chest and put everything you carry into it.',
    run: (bot) => depositToChest(bot),
  },
  {
    name: 'checkChest',
    description: 'Walk to the shared chest and look at what is in it.',
    run: (bot) => checkChest(bot),
  },
]

// The JSON shape Gemini must answer in.
export const choiceSchema = {
  type: 'object',
  properties: {
    thought: { type: 'string', description: 'One or two sentences: why this action.' },
    action: { type: 'string', enum: actions.map((a) => a.name) },
    resource: { type: 'string', enum: resourceNames },
    amount: { type: 'integer' },
    notes: { type: 'string', description: 'A short note to your future self. It replaces your previous notes.' },
  },
  required: ['thought', 'action', 'notes'],
}

// Runs the chosen action. An invalid choice is not run; the agent is told what was wrong instead.
export async function runChoice(bot: Bot, choice: Choice): Promise<SkillResult> {
  const action = actions.find((a) => a.name === choice.action)
  if (!action) return { text: `Invalid choice: unknown action "${choice.action}".` }
  const problem = action.check?.(choice)
  if (problem) return { text: `Invalid choice: ${problem}.` }
  return action.run(bot, choice)
}

// e.g. "gather(wood, 4)" or "depositToChest()", for memory and logs.
export function describeChoice(choice: Choice): string {
  const args = [choice.resource, choice.amount].filter((value) => value !== undefined)
  return `${choice.action}(${args.join(', ')})`
}
