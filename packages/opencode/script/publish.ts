#!/usr/bin/env bun
import { $ } from "bun"
import fs from "fs"
import path from "path"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"

// This is the fork-specific publish script for the `opencode-stable` npm
// distribution (umbrella `opencode-stable` + platform packages
// `opencode-{platform}-stable`). It deliberately drops upstream's
// Docker / AUR / Homebrew steps (those target anomalyco infrastructure).
const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const umbrellaName = "opencode-stable"

const readme = `# opencode-stable

> ⚠️ **Stable Fork** — This is a community-maintained stable fork of [opencode](https://github.com/sst/opencode), based on **v${Script.version.split("-")[0]}**. Not affiliated with the upstream project.

## Install

\`\`\`bash
npm i -g opencode-stable
\`\`\`

## License

MIT — same as upstream [opencode](https://github.com/sst/opencode).
`

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

async function publish(pkgDir: string, name: string, version: string) {
  // GitHub artifact downloads can drop the executable bit.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(pkgDir)
  if (await published(name, version)) {
    console.log(`already published ${name}@${version}`)
    return
  }
  await $`bun pm pack`.cwd(pkgDir)
  await $`npm publish *.tgz --access public --tag ${Script.channel}`.cwd(pkgDir)
}

// Collect platform binaries built by build.ts. Each dist/<dir>/package.json
// declares name `opencode-<platform>-stable`; the dist directory name itself
// is unsuffixed (`opencode-<platform>`), so we track both.
const binaries: Record<string, { version: string; dir: string }> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  // Skip the umbrella dir (named after pkg.name = "opencode") on re-runs.
  if (filepath === `${pkg.name}/package.json`) continue
  const p = await Bun.file(`./dist/${filepath}`).json()
  // Fork ships no Windows packages.
  if (p.name.includes("windows")) continue
  binaries[p.name] = { version: p.version, dir: path.dirname(filepath) }
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]?.version
if (!version) {
  console.error("No platform binaries found in ./dist. Run `bun run script/build.ts` first.")
  process.exit(1)
}

const umbrellaDir = `./dist/${pkg.name}`
await $`mkdir -p ${umbrellaDir}/bin`
// Stub wrapper; postinstall overwrites bin/opencode.exe with the real binary.
await Bun.file(`${umbrellaDir}/bin/opencode.exe`).write(
  `#!/usr/bin/env node\nconsole.error("OpenCode binary not found. The postinstall script should have installed it.")\nconsole.error("Try running: npm install ${umbrellaName}")\nprocess.exit(1)\n`,
)
await $`chmod +x ${umbrellaDir}/bin/opencode.exe`
await Bun.file(`${umbrellaDir}/postinstall.mjs`).write(await Bun.file("./script/postinstall.mjs").text())
await Bun.file(`${umbrellaDir}/LICENSE`).write(await Bun.file("../../LICENSE").text())
await Bun.file(`${umbrellaDir}/README.md`).write(readme)
await Bun.file(`${umbrellaDir}/package.json`).write(
  JSON.stringify(
    {
      name: umbrellaName,
      version,
      description: "OpenCode CLI - stable fork with GLM-5.1 compat, token savings, and UX improvements",
      bin: {
        opencode: "./bin/opencode.exe",
      },
      scripts: {
        postinstall: "node ./postinstall.mjs",
      },
      optionalDependencies: Object.fromEntries(Object.entries(binaries).map(([name, info]) => [name, info.version])),
      files: ["bin", "postinstall.mjs", "LICENSE", "README.md"],
      license: pkg.license || "MIT",
      keywords: ["opencode", "ai", "coding", "cli", "stable"],
      homepage: "https://github.com/ranxianglei/opencode",
      repository: {
        type: "git",
        url: "https://github.com/ranxianglei/opencode.git",
      },
    },
    null,
    2,
  ),
)

await Promise.all(
  Object.entries(binaries).map(([name, info]) => publish(`./dist/${info.dir}`, name, info.version)),
)
await publish(umbrellaDir, umbrellaName, version)