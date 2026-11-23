// Rejects if `task` takes longer than `seconds`. Then `onGiveUp` stops whatever was going on
// (e.g. stop walking, or cancel a request). Used for everything that could wait forever.
export async function withTimeout<T>(task: Promise<T>, seconds: number, onGiveUp: () => void = () => {}): Promise<T> {
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
