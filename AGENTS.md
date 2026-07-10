# opencode-stable Development Specification

> **This document is the highest-priority specification for this project. All developers (including AI Agents) MUST comply unconditionally.**
>
> Structure and conventions are modeled on the [`opencode-acp` AGENTS.md](https://github.com/ranxianglei/opencode-acp/blob/master/AGENTS.md). Fork-specific realities (Section 4) are the most valuable, hard-won knowledge here — read them carefully.

---

## 1. Project Overview

### 1.1 What Is opencode-stable

**opencode-stable** is a stable, npm-published fork of [sst/opencode](https://github.com/sst/opencode) — the AI coding agent TUI. It is pinned to a specific upstream release (currently `1.14.41`) and republished on npm as **`opencode-stable`** with GLM-5.x compatibility, token-saving defaults, and UX fixes that have not yet been accepted upstream.

This is **not** a plugin (cf. `opencode-acp`). It is the full `opencode` CLI, distributed as bun-compiled standalone per-platform binaries plus an umbrella npm package.

### 1.2 Tech Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript (strict, ESM) |
| Runtime | Bun (build + dev); Node.js adapter paths exist (`*.node.ts`) |
| Build | `bun build --compile` → standalone per-platform binaries (~148 MB each) |
| Package Manager | Bun (workspaces + catalog), `packageManager: bun@1.3.13` |
| Monorepo Orchestrator | `turbo` |
| Linting | `oxlint` + `oxlint-tsgolint` |
| Formatting | Prettier (`semi: false`, `printWidth: 120`) |
| Framework | `effect` v4 beta (services, layers, schemas), `hono`, Drizzle ORM |
| UI | `@opentui/solid`, `solid-js` |
| DB | SQLite via Drizzle (schema in `src/**/*.sql.ts`) |

### 1.3 Repository Info

| Field | Value |
|-------|-------|
| npm umbrella package | `opencode-stable` |
| Current published version | `1.14.41` (2026-05-24) |
| Internal Gitea (origin) | `ssh://git@192.168.10.96:2222/dog/opencode-stable.git` |
| GitHub mirror | https://github.com/ranxianglei/opencode-stable |
| Upstream | https://github.com/sst/opencode |
| License | MIT |
| Maintainer | ranxianglei |

---

## 2. Architecture

### 2.1 Monorepo Layout

```
opencode-stable/
├── packages/
│   ├── opencode/          # ← THE CLI. This is where almost all work happens.
│   ├── core/              # Shared core types
│   ├── plugin/            # @opencode-ai/plugin SDK (plugins)
│   ├── sdk/               # @opencode-ai/sdk (JS + other lang SDKs)
│   ├── script/            # @opencode-ai/script — build/publish/version helpers (Script.*)
│   ├── app/               # Web app (SolidStart)
│   ├── desktop/           # Electron desktop app
│   ├── console/           # Console web app
│   ├── ui/                # Shared Solid UI components
│   ├── web/  slack/  enterprise/  identity/  function/  containers/ ...
│   └── ...
├── .opencode/             # opencode's own config/skills/commands/agents (dogfooded)
├── patches/               # bun patchedDependencies
├── script/  sdks/  infra/  specs/  nix/
├── install                # curl-based installer (downloads prebuilt release binaries)
├── AGENTS.md              # ← THIS FILE (fork-level spec)
└── CONTRIBUTING.md
```

### 2.2 The CLI: `packages/opencode/src/`

The CLI source is large (~40 top-level modules). Logical grouping:

| Group | Modules | Responsibility |
|-------|---------|----------------|
| **Entry / runtime** | `index.ts`, `node.ts`, `cli/`, `env/`, `bus/` | Process entry, arg parsing, event bus |
| **AI core** | `agent/`, `session/`, `provider/`, `tool/`, `command/`, `skill/`, `permission/` | Agent loop, sessions, LLM providers, tools, slash commands, skills, perms |
| **Editor integration** | `lsp/`, `pty/`, `ide/`, `worktree/`, `git/` | LSP, terminals, IDE detection, worktrees, git |
| **Data / persistence** | `storage/` (`#db`), `snapshot/`, `sync/`, `share/` | SQLite storage, snapshots, sync, sharing |
| **Server / API** | `server/` (`#hono`, `#httpapi-server`), `http-recorder/` | HTTP API + adapters |
| **Config / auth** | `config/`, `auth/`, `account/`, `control-plane/` | Config layers, auth, accounts |
| **Effect infra** | `effect/` (`run-service.ts`, `instance-state.ts`) | `makeRuntime`, `InstanceState` |
| **Plugins / extensions** | `plugin/`, `mcp/`, `patch/` | Plugin loading, MCP, patching |
| **Integrations** | `acp/` (ACP context-pruning plugin host), `audio.d.ts`, `format/`, `file/`, `shell/`, `question/`, `installation/`, `util/`, `v2/`, `id/`, `temporary.ts` | Misc subsystems |

**Condition imports** (in `packages/opencode/package.json`): `#db`, `#pty`, `#hono`, `#httpapi-server` each resolve to a `.bun.ts` / `.node.ts` variant. Use the import alias, never the concrete file.

### 2.3 Key Concepts

- **Effect services**: Most modules expose `Service` + `layer` + `defaultLayer` via `Context.Service`. Compose with `Effect.gen`. See `packages/opencode/AGENTS.md` "opencode Effect rules" — authoritative for service patterns.
- **`makeRuntime`** (`src/effect/run-service.ts`): the runtime factory for all services; dedupes layers via a shared `memoMap`.
- **`InstanceState`** (`src/effect/instance-state.ts`): per-directory/per-project state with `ScopedCache` cleanup. If two open directories must not share one service copy → it needs `InstanceState`.
- **Sessions are version-keyed.** This is the single most important fork-specific fact — see §4.2.
- **Storage**: SQLite at `~/.local/share/opencode/` (the data dir). See §4.4.

### 2.4 Configuration System

opencode merges config from multiple layers (highest wins):

```
1. Global:     ~/.config/opencode/opencode.jsonc
2. Project:    .opencode/opencode.jsonc
3. Skill/agent/command overlays: .opencode/{agent,command,skill,tool,theme,glossary}/
```

In `src/config`, follow the existing self-export pattern at the top of each file (e.g. `export * as ConfigAgent from "./agent"`) when adding a new config module. Multi-sibling directories must NOT add a barrel `index.ts` (defeats tree-shaking).

### 2.5 Storage Paths

| What | Path | Notes |
|------|------|-------|
| **CLI binaries (build output)** | `packages/opencode/dist/{pkg-name}/bin/opencode` | Written by build. **Safe to rebuild anytime.** |
| **Data dir** | `~/.local/share/opencode/` | SQLite DBs, snapshots, storage. **NEVER touched by build.** |
| Primary DB | `~/.local/share/opencode/opencode.db` | Session history (can be >1 GB). Protected. |
| Per-project DBs, WAL | `~/.local/share/opencode/*.db*` | One per project + `-wal`/`-shm` |
| Snapshots / storage / tool-output | `~/.local/share/opencode/{snapshot,storage,tool-output}/` | |
| Config | `~/.config/opencode/` | `opencode.jsonc`, `acp.jsonc`, logs |
| Cache | `~/.cache/opencode/` | Plugin package resolution, etc. |
| Plugin install | `~/.opencode/` | `install` script target |

---

## 3. Development Standards

### 3.1 Common Commands

All commands run from package directories, **never from repo root** (there is a `do-not-run-tests-from-root` guard).

```bash
# From packages/opencode/
bun run dev                              # Run CLI in dev mode (browser conditions)
bun run typecheck                        # tsgo --noEmit  (ALWAYS this, never raw tsc)
bun test --timeout 30000                 # Tests (bun test)
bun run db generate --name <slug>        # Generate a Drizzle migration

# From repo root
bun run typecheck                        # bun turbo typecheck (all packages)
bun run lint                             # oxlint
bun run dev                              # dev mode (packages/opencode)
```

- `bun typecheck` from package dirs — **never `tsc` directly**.
- `npm test` / `bun test` from repo root is intentionally blocked (`exit 1`).

### 3.2 Build (CRITICAL — read §4.2 before building)

```bash
# Local single-platform build (current host only) — for self-install:
cd packages/opencode
OPENCODE_VERSION=1.14.41 bun run build -- --single

# Full multi-platform build (all 12 targets, cross-compile) — for npm publish:
cd packages/opencode
OPENCODE_VERSION=1.14.41 bun run build
```

Build flags: `--single` (current platform only), `--baseline`, `--skip-install`, `--sourcemaps`, `--skip-embed-web-ui`.

Output: `dist/{pkg-name}/bin/opencode` per target.

**⚠️ The `OPENCODE_VERSION` env var is MANDATORY.** Omitting it produces version `0.0.0-{branch}-{timestamp}`, which **invalidates all existing sessions** (sessions are keyed by version). See §4.2.

### 3.3 Testing

- Avoid mocks as much as possible. Test actual implementations; do not duplicate logic into tests.
- Tests run from package dirs (`packages/opencode`), never repo root.

### 3.4 Local Install (symlink method)

`~/.local/bin/opencode` is a **symlink** → `packages/opencode/dist/opencode-linux-x64/bin/opencode`. Rebuilding `dist/` therefore "reinstalls" automatically; no copy step needed.

- Rebuild is safe while opencode is running: Linux swaps the inode; running sessions keep the old binary, new launches pick up the new one.
- **Build only writes `dist/`. The data dir (`~/.local/share/opencode/`) is never touched.** Session history is safe across rebuilds.

Verify after build: `opencode --version` must print `1.14.41` (or the pinned version). If it prints `0.0.0-master-...`, the build forgot `OPENCODE_VERSION` — rebuild it.

### 3.5 npm Publishing — see Section 5.4 (Pre-Publish Checklist)

The published npm package is **`opencode-stable`** (umbrella) + 9 platform packages `opencode-{platform}-stable`. Publishing is a multi-package, public, semi-irreversible operation — follow §5.4. **Note: the fork-specific publish infrastructure is currently out of sync with upstream scripts — see §4.5.**

---

## 4. Fork-Specific Realities (READ CAREFULLY)

These are the facts that are NOT in upstream docs and that cost real time to rediscover.

### 4.1 Three Remotes

| Remote | URL | Role |
|--------|-----|------|
| `origin` | `ssh://git@192.168.10.96:2222/dog/opencode-stable.git` | **Internal Gitea. Primary.** PRs and issues live here. Default branch: `master`. |
| `github` | `git@github.com:ranxianglei/opencode-stable.git` | Public mirror. Default branch: `dev`. |
| `upstream` | `https://github.com/sst/opencode.git` | sst/opencode. Track and merge from here. Default branch: `dev`. |

- **Working branch on `origin` is `master`** (not `dev`). The existing upstream note "default branch is dev" applies to upstream/github, not to the internal origin.
- When diffing against upstream, use `upstream/dev` or `origin/dev`. A local `main` ref may not exist.

### 4.2 Version Pinning (THE critical pitfall)

`packages/script/src/index.ts` computes `Script.version`:
1. `env.OPENCODE_VERSION` — **use this. Always.**
2. Else, if "preview" channel → `0.0.0-{branch}-{timestamp}`
3. Else, fetch `https://registry.npmjs.org/opencode-ai/latest` (the **upstream** package) and bump.

`packages/opencode/script/build.ts` bakes `OPENCODE_VERSION: '${Script.version}'` into the binary.

**Consequence**: building without `OPENCODE_VERSION=1.14.41` produces `0.0.0-master-{date}`, which:
- Makes **all existing sessions invalid** (sessions are keyed by the baked version).
- Reports a nonsense version to `opencode --version`.

**Rule: every build MUST set `OPENCODE_VERSION` to the pinned fork version (`1.14.41`).** No exceptions.

### 4.3 Upstream Sync Discipline

When merging `upstream/dev` into the fork:
- The fork carries deliberate divergences (snapshot fix, run/grace-period fixes, GLM compat). Preserve them.
- **Upstream syncs have repeatedly overwritten fork-specific publish scripts** (`build.ts`, `publish.ts`, `postinstall.mjs`) — see §4.5. After any upstream merge, verify the `-stable` publish naming is intact before attempting a release.
- Resolve conflicts toward keeping fork behavior, then re-apply upstream features.

### 4.4 Data Safety

`~/.local/share/opencode/opencode.db` is the session history and can exceed 1 GB. It is **never** touched by the build (build only writes `dist/`). Before any destructive git operation, confirm no opencode process is mid-write (check the `-wal` file is quiescent). Backups go to `/tmp/opencode-backup-YYYYMMDD-HHMMSS`.

### 4.5 Publish Infrastructure Status (known broken)

The fork-specific publish naming (`opencode-stable` umbrella + `opencode-{platform}-stable` platform packages) is **not** what the current scripts produce. The current scripts are upstream's:

| File | Current (upstream) behavior | Needed for `opencode-stable` |
|------|------------------------------|------------------------------|
| `packages/opencode/script/publish.ts` | umbrella = `opencode-ai` (`pkg.name + "-ai"`); also Docker/AUR/Homebrew to anomalyco targets | umbrella = `opencode-stable` |
| `packages/opencode/script/build.ts` | platform pkg = `opencode-{platform}` (no suffix) | platform pkg = `opencode-{platform}-stable` |
| `packages/opencode/script/postinstall.mjs` | resolves `opencode-{platform}-{arch}` | must resolve `opencode-{platform}-stable` |
| `.github/workflows/publish.yml` | gated on `github.repository == 'anomalyco/opencode'` (won't fire here) | fork-specific workflow |

**Running the current scripts verbatim would attempt to publish `opencode-ai` (owned by sst → npm rejects) with wrong platform names.** Do NOT publish without first reconstructing the `-stable` naming. See §5.4 and raise the issue before any release.

### 4.6 Bug Fix History (fork divergences)

| Fix | Location | What it does | Commit / PR |
|-----|----------|--------------|-------------|
| snapshot-disabled | `src/snapshot/index.ts` (+5 lines) | Honor `snapshot:false` in `restore`/`revert`/`patch`/`diff`/`diffFull` via early-return guards | `e42618461` (cherry-pick of `abe8bf533`, PR #3) |
| run background-exit | `src/session/run.ts` | Background agent exit handling | PR #4 (grace-period) |
| grace-period multi-bg | `src/session/run.ts` | Grace period for multiple background agents | PR #4 |

The snapshot fix adds `if (!(yield* enabled())) return <default>` guards in 5 functions. Verify 7 total `enabled()` guards exist (5 new + 2 pre-existing) after any upstream merge.

---

## 5. Contributing

### 5.1 Before Making Changes

1. Confirm you are on `master` and synced with `origin/master`.
2. `bun run typecheck` (from the package dir) — no type errors.
3. Understand whether the change is fork-specific (preserve across syncs) or upstream-tracking.
4. If touching `build.ts`/`publish.ts`/`postinstall.mjs` → re-read §4.5.

### 5.1.1 Git Safety Rules (MANDATORY)

| Rule | Enforcement |
|------|-------------|
| **NEVER force-push to `master`** | Under no circumstances. Create a PR instead. |
| **NEVER merge PRs without explicit human authorization** | "merge" / "approve merge" must come from a human. Agent review passing ≠ authorization. |
| **NEVER bypass branch protection** | If protection blocks a push, the correct response is a PR — not toggling protection. |
| **NEVER delete branches/tags without human confirmation** | Preserve work for review. |
| **NEVER build without `OPENCODE_VERSION`** | Invalidates sessions. See §4.2. |
| **NEVER run `publish.ts` without verifying `-stable` naming** | Would publish wrong/owned-by-sst packages. See §4.5. |

### 5.1.2 Devlog / Issue Tracking

Fork issues and PRs are tracked on the internal Gitea (`origin`). Use `tea issues N --repo dog/opencode-stable` and the `awork-reply N dog/opencode-stable` heredoc pattern (every reply starts with `[bot]`). Prefer Gitea PRs over direct pushes.

### 5.2 After Making Changes

1. `bun run typecheck` passes (package dir).
2. If CLI behavior changed: rebuild with `OPENCODE_VERSION=1.14.41 bun run build -- --single` and smoke-test `opencode --version`.
3. Run relevant tests from the package dir.
4. If the change must survive upstream sync, document it in §4.6.

### 5.3 Code Review

Source changes under `packages/opencode/src/` should be reviewed for: correctness, fork-divergence preservation (§4.3/§4.6), Effect service correctness (see `packages/opencode/AGENTS.md`), type safety (no `as any` / `@ts-ignore`), and data safety (§4.4). No `as any`, no `@ts-ignore`, no empty `catch` blocks.

### 5.4 Pre-Publish Checklist (MANDATORY)

Before every npm publish of `opencode-stable`, ALL steps execute **in order**. Publishing is public and semi-irreversible (10 packages: 1 umbrella + 9 platform binaries).

**Step 0 — Git state (must pass first):**

```bash
git status --porcelain          # MUST be empty
git branch --show-current       # MUST be master
git fetch origin && git status  # MUST show "up to date with 'origin/master'"
```

If any fails → STOP. Do not proceed.

**Step 1 — Reconstruct fork publish naming (§4.5):**

Verify/patch `build.ts`, `publish.ts`, `postinstall.mjs` to use `opencode-stable` umbrella + `opencode-{platform}-stable` platform names. The published 1.14.41 shape is the reference:
- 9 optionalDeps, all `-stable` suffix: `linux-x64`, `linux-x64-baseline`, `linux-x64-musl`, `linux-x64-baseline-musl`, `linux-arm64`, `linux-arm64-musl`, `darwin-x64`, `darwin-x64-baseline`, `darwin-arm64`. **No windows.**

**Step 2 — Build all targets with pinned version:**

```bash
cd packages/opencode
OPENCODE_VERSION=<NEW_VERSION> bun run build    # NO --single; cross-compiles all targets
```

Confirm `opencode --version` reports `<NEW_VERSION>`.

**Step 3 — Verify package contents (per package):**

```bash
bun pm pack                                      # in each target dir
tar -tf *.tgz | grep -iE '\.env|secret|token|key|\.pem'   # MUST be empty
```

No secrets, no `.git/`, no source. Only the binary + `package.json` + `README.md` + `LICENSE`.

**Step 4 — Tag, then publish:**

```bash
# Tag FIRST (marks the intended release even if publish fails)
git tag -a "v<NEW_VERSION>" -m "release v<NEW_VERSION>"
git push origin "v<NEW_VERSION>"

# Then publish umbrella + each platform package
# publish via the (patched) publish.ts or per-package npm publish --access public
```

**If any step fails: DO NOT PUBLISH.** Fix and restart from Step 0.

### 5.5 Commit Convention

Descriptive messages; fork-specific fixes should be self-describing:

- `fix(snapshot): honor snapshot:false in restore/revert/patch/diff`
- `fix(session): grace period for multiple background agents`
- `chore: bump version to 1.14.42`

---

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable.
- Avoid `try`/`catch` where possible.
- Avoid using the `any` type.
- Use Bun APIs when possible, like `Bun.file()`.
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity.
- Prefer functional array methods (`flatMap`, `filter`, `map`) over `for` loops; use type guards on `filter` to maintain type inference downstream.
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible.
- Test actual implementation, do not duplicate logic into tests.
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/opencode`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/opencode`), never `tsc` directly.

## Deeper References

- **`packages/opencode/AGENTS.md`** — authoritative for: Drizzle schema/migration rules, module shape (`export * as Foo` self-reexport, no barrels in multi-sibling dirs), and the full **Effect v4 rules** (`Effect.fn`, `makeRuntime`, `InstanceState`, `Instance.bind`, `Effect.cached`, preferred services). Read it before touching Effect code.
- **`CONTRIBUTING.md`** — upstream contribution guide.
