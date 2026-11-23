import type { Counts } from './skills'

// All settings in one place.
export const config = {
  host: 'localhost',
  port: 3000,
  version: '1.19.4',
  botNames: ['benny', 'kenny', 'lenny', 'jenny'],

  // The shared chest everyone deposits into.
  chest: { x: 28, y: 66, z: -4 },

  // What the team must collect into the chest, and how long it gets.
  goal: { wood: 32 } satisfies Counts,
  timeLimitMinutes: 10,

  // The LLM. Pinned to an exact model so results stay comparable.
  model: 'gemini-3.5-flash-lite',
}
