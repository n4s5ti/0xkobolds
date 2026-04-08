# Configuration

Git sync tools resolve settings from three sources, in priority order:

1. **Tool parameters** — explicit overrides passed to each tool call
2. **Config file** (`.git-sync.json`) — persistent project settings
3. **Auto-detection** — inferred from git remotes and directory structure

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `org` | string | *(auto-detected)* | GitHub org or user (e.g. `my-org`) |
| `prefix` | string | `"packages"` | Monorepo subdirectory (e.g. `packages`, `libs`, `modules`) |
| `pattern` | string | `"*"` | Glob for listing subdirectories (e.g. `lib-*`, `@org/*`) |
| `remotePrefix` | string | `"pkg-"` | Git remote naming convention (e.g. `pkg-lib-core`) |
| `defaultBranch` | string | `"main"` | Default branch for push/pull/init |
| `visibility` | `"public"` \| `"private"` | `"public"` | Visibility for newly created repos |
| `mode` | `"subtree"` \| `"standalone"` | *(auto-detected)* | Sync mode |

## Config File

Create `.git-sync.json` (or `.git-sync.jsonc` with comments) in the repo root:

```jsonc
{
  // GitHub org — required if auto-detection fails
  "org": "my-team",

  // Where subdirectories live in the monorepo
  "prefix": "packages",

  // Which subdirectories to include
  "pattern": "lib-*",

  // Git remote name prefix (remotes become pkg-lib-core, etc.)
  "remotePrefix": "pkg-",

  // Branch name
  "defaultBranch": "main",

  // Visibility for new repos
  "visibility": "public",

  // Force mode (usually auto-detected, but can override)
  "mode": "subtree"
}
```

## Auto-Detection

When no config file or params are provided, the tools infer:

| Setting | How It's Detected |
|---------|-------------------|
| `org` | Parsed from `git remote -v` output — looks for `github.com[:/]ORG/` |
| `mode` | `subtree` if `prefix/` directory exists, `standalone` otherwise |
| `prefix` | Defaults to `packages`; used for subtree split prefix |
| `pattern` | `*` (all subdirectories under prefix) |
| `defaultBranch` | `main` |
| `remotePrefix` | `pkg-` |

### Org detection example

If your git remote is `https://github.com/acme/widgets.git`, the tools will detect `org: "acme"`. If you have multiple remotes pointing to different orgs, the first GitHub remote wins.

### Mode detection example

```
my-project/           ← git root
├── packages/         ← prefix exists → subtree mode
│   ├── lib-core/
│   └── lib-utils/
└── src/
```

```
my-project/           ← git root, no packages/ → standalone mode
├── src/
└── package.json
```

## Resolution Cascade

```
Tool param: org="fallback-org"
     ↓ (if not provided)
Config file: "org": "my-team"
     ↓ (if not in config)
Auto-detect: parse from git remote
     ↓ (if no GitHub remote)
Fallback: "UNKNOWN_ORG" (prints warning)
```

## Examples

### Simple standalone project

No config needed. Just `cd` into the repo and call:

```
git_package_push(mode="standalone")
```

The org is detected from `origin`, branch from `git branch --show-current`.

### Monorepo with custom layout

```
monorepo/
├── libs/              ← prefix = "libs"
│   ├── sdk/           ← pattern = "*"
│   └── cli/           ← (not "lib-*", all dirs included)
└── apps/
```

```json
// .git-sync.json
{
  "org": "my-company",
  "prefix": "libs",
  "pattern": "*"
}
```

```
git_package_status()
git_package_push(name="sdk")
```

### Scoped packages

```
monorepo/
├── packages/
│   ├── @acme/ui/       ← scoped dir
│   └── @acme/data/
```

```json
{
  "org": "acme",
  "prefix": "packages",
  "pattern": "@acme/*"
}
```

### Different org per call

Override the config on the fly:

```
git_package_push(name="internal-lib", org="acme-internal")
git_package_push(name="open-lib", org="acme-open")
```