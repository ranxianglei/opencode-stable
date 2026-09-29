import launch from "cross-spawn"
import type * as NodeChildProcess from "node:child_process"

// cross-spawn@7 resolves a command by temporarily chdir-ing to the spawn target and
// restoring in an UNGUARDED finally (lib/util/resolveCommand.js). If the captured cwd
// was deleted meanwhile (tests rm their tmpdirs), the restore throws and process.cwd()
// is left stuck at the spawn target — the unit(windows) cwd drift (#37); while active,
// concurrent process.cwd() reads also see the wrong dir.
//
// We skip that dance via cross-spawn's `process.chdir.disabled` escape hatch around the
// fully-synchronous launch(): resolution then uses the real process.cwd() + env PATH
// (identical for every command we spawn — absolute paths and bare PATH names) and the
// child still gets its own dir via the OS-level `cwd` option. Keep launch() synchronous
// so this disable/restore bracket stays atomic (no await may run inside it).
type ChdirLike = typeof process.chdir & { disabled?: boolean }

export function safeLaunch(
  command: string,
  args: readonly string[],
  opts: NodeChildProcess.SpawnOptions,
): NodeChildProcess.ChildProcess {
  const chdir = typeof process.chdir === "function" ? (process.chdir as ChdirLike) : undefined
  if (!chdir) return launch(command, args, opts)
  const prev = chdir.disabled
  chdir.disabled = true
  try {
    return launch(command, args, opts)
  } finally {
    chdir.disabled = prev
  }
}

export * as CrossSpawnSafe from "./cross-spawn-safe"
