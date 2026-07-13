# Skills Marketplace Current State

Date: 2026-07-10

This document records the observed implementation state of the Canvasland skill marketplace. It is intentionally factual. It does not treat UI messages as proof of a secure or complete installation pipeline.

## Summary

The current implementation is a usable marketplace UI backed by a local Electron Main service and an `electron-store` catalog. It can list approved marketplace skills, preview GitHub or ClawHub imports for operator workflows, install approved GitHub skill directories by downloading files into `~/.openclaw/skills/<skill-id>`, and install ClawHub skills through an extension-provided marketplace provider when one is registered.

It is not yet a full secure skill marketplace. It does not have an install task state machine, checksum verification, policy engine, dependency permission confirmation, security scanner, markdown sanitizer for detail bodies, update workflow, or complete install audit model.

## Required Questions

### 1. Current skill list data source

Status: PASS

Current public marketplace data is loaded through:

- Renderer: `src/pages/Skills/index.tsx`
- Host API: `hostApi.skills.marketplaceList()`
- Main service: `electron/services/skills-api.ts`
- Store/service: `electron/services/skills/marketplace-skill-service.ts`

`marketplaceList` returns `listApprovedMarketplaceSkills()`, which reads the `skill-marketplace` `electron-store` entry. If the store has no data, its default value is loaded from `resources/skills/marketplace-seeds.json`.

The renderer also contains `FALLBACK_MARKETPLACE_SKILLS` so the page remains browsable if `marketplaceList` fails.

### 2. Whether ClawHub API is read

Status: PARTIAL

ClawHub is only read when an operator/import flow calls:

- `hostApi.skills.clawhubCapability()`
- `hostApi.skills.clawhubSearch(...)`
- `hostApi.skills.marketplaceImportPreview({ source: 'clawhub', ... })`

The current public marketplace list does not automatically fetch ClawHub on page load. ClawHub access depends on `ClawHubService.marketplaceProvider`. Without a registered provider, ClawHub search/install returns `Marketplace search is disabled` or `Marketplace install is disabled`.

### 3. Whether it is only hardcoded local JSON

Status: PARTIAL

It is not only hardcoded JSON, but local JSON is the current seed source.

Sources:

- Seed catalog: `resources/skills/marketplace-seeds.json`
- Persistent catalog: `electron-store` store name `skill-marketplace`, key `skills`
- GitHub import preview/commit can add new catalog items.
- ClawHub import preview/commit can add new catalog items if a provider is available.
- Catalog export/import exists for backend synchronization.

There is no production remote backend catalog API currently used by the public list page.

### 4. What clicking Install currently executes

Status: PASS

Renderer calls:

```ts
hostApi.skills.marketplaceInstall({ id: skill.id })
```

Main does:

1. Loads skill by id from marketplace catalog.
2. Blocks if `reviewStatus !== 'approved'` or `commercialUseAllowed` is false.
3. For `importSource === 'github'`, calls `installGitHubMarketplaceSkill(skill)`.
4. For `importSource === 'clawhub'`, calls `clawHubService.install({ slug })`.
5. Calls `updateSkillConfig(runtimeSkillKey, { enabled: true })`.
6. Updates marketplace item with `installStatus: 'installed'`, `installPath`, `installedAt`, and clears `installError`.

There is no install task record and no multi-step state machine.

### 5. Where skill files are installed

Status: PASS

GitHub marketplace installs go to:

```text
~/.openclaw/skills/<skill-id>
```

This path is produced by `getOpenClawSkillsDir()` in `electron/utils/paths.ts`, which returns:

```text
~/.openclaw/skills
```

ClawHub installs are delegated to `clawHubService.install({ slug })`; Canvasland then assumes the installed path is:

```text
~/.openclaw/skills/<slug>
```

Preinstalled skills, if configured through `resources/skills/preinstalled-manifest.json`, are also deployed under `~/.openclaw/skills/<slug>`.

### 6. Whether `openclaw skills install` is called

Status: FAIL

The current marketplace install path does not call:

```text
openclaw skills install
```

GitHub installs are implemented directly by downloading raw files from GitHub into a staging directory and renaming it into `~/.openclaw/skills/<skill-id>`.

ClawHub installs call an extension-provided marketplace provider through `ClawHubService.install`, not `openclaw skills install`.

### 7. Whether installed version and source are recorded

Status: PARTIAL

GitHub installs write:

```text
~/.openclaw/skills/<skill-id>/.canvasland/origin.json
```

Recorded fields include:

- `importSource`
- `source`
- `repositoryUrl`
- `license`
- `commercialUseAllowed`
- `skillPath`
- `branch`
- `fileCount`
- `totalBytes`
- `installedAt`

Marketplace catalog items record:

- `installStatus`
- `installPath`
- `installedAt`
- `installError`

Missing:

- Installed version
- Latest version
- Checksum/hash
- Commit SHA
- verifiedAt / lastVerifiedAt
- security scan id/result
- immutable source digest

Local skill scanning can read version from `manifest.json`, SKILL.md frontmatter, `.clawhub/origin.json`, or `.clawx-preinstalled.json`, but GitHub marketplace install does not currently write a version.

### 8. Whether uninstall, update, enable, and disable are supported

Status: PARTIAL

Supported today:

- Enable/disable local skill config through `updateSkillConfig` and `updateSkillConfigs`.
- ClawHub uninstall through `hostApi.skills.clawhubUninstall`, which deletes `~/.openclaw/skills/<slug>`, updates ClawHub lock file, and removes skill config.
- Gateway skill update RPC exists as `skills.update`, but it is not the marketplace update workflow.

Not supported as a public marketplace flow:

- Uninstall marketplace GitHub skill from the marketplace card/detail UI.
- Update marketplace skill to latest version.
- Detect update availability.
- Protected uninstall rules for core skills.
- Install task rollback records.
- Disable/enable from marketplace card state machine.

### 9. Whether SKILL.md is validated

Status: PARTIAL

Current GitHub installer validates that:

- Repository tree contains at least one `SKILL.md`.
- Selected skill directory contains `SKILL.md`.
- Paths are relative and safe.
- File count and size are under limits.
- The final write path does not escape the staging directory.

Local scanner parses `SKILL.md` frontmatter and description, with a max size of `256_000` bytes.

Missing:

- Required metadata schema validation.
- Version validation.
- Publisher/source consistency validation.
- Permission metadata validation.
- Dependency metadata validation.
- Markdown body security validation.
- Hash validation of downloaded files.

### 10. Whether pip/npm/bash commands in detail content are executed

Status: PASS

No. Detail code blocks are displayed only. The current detail modal renders generated command text as a `<pre><code>` block. The install flow does not parse or execute commands from the detail content or from `SKILL.md`.

However, the implementation also does not yet have a safe Markdown renderer for full remote detail bodies.

### 11. Whether security scanning and install policy exist

Status: FAIL

There is no complete security scanner or install policy engine.

Current checks are limited to:

- Approved review status and `commercialUseAllowed` before marketplace install.
- Commercial license allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause.
- GitHub path traversal and file size/count checks.
- GitHub tree truncation rejection.
- Local skill scan root containment checks.

Missing:

- `allow / require_confirmation / block` install policy.
- Dangerous command/pattern scan.
- Permission analysis.
- Dependency analysis.
- User permission confirmation.
- Risk warnings.
- Quarantine/staging scan records.
- Security scan persistence.

### 12. Whether Electron renderer can directly execute shell

Status: PARTIAL

The renderer does not have direct Node access to `child_process`, `exec`, or `spawn` through normal imports. The preload exposes a restricted bridge:

- `window.clawx.hostInvoke(...)`
- `window.electron.ipcRenderer.invoke(...)` for a fixed channel list

There is no renderer-exposed raw shell command execution API.

However, renderer can request Main-owned operations that have system effects, including:

- `shell.openExternal`
- `shell.showItemInFolder`
- `shell.openPath`
- file preview read/write/list APIs
- gateway control APIs
- skills marketplace install APIs

Therefore, renderer cannot directly execute arbitrary shell, but the Main host API must remain tightly allowlisted and schema-validated because renderer can request privileged Main actions.

## Current Marketplace List Page

Status summary:

- Search: PASS
- Category filter: PASS
- Hot category: PASS
- Installed filter: PASS
- Sorting: FAIL
- Pagination or infinite loading: FAIL
- Loading state: FAIL
- Empty state: PASS
- Error state: PARTIAL
- Local cache: PASS, via `electron-store` and renderer fallback

Current card fields:

- Icon: PASS
- Name: PASS
- Short description: PASS
- Category: PARTIAL, visible mainly as tag/detail metadata
- Publisher: FAIL in public UI
- Stars: PARTIAL, field exists as `rating`, but seed values may be editorial and are not guaranteed remote-live
- Downloads/installs: PARTIAL, field exists, but seed values may be editorial and are not guaranteed remote-live
- Current version: FAIL, generated in renderer from id length and install status
- Security scan status: FAIL
- Installed status: PASS
- Update availability: FAIL

Important issue: current seed ratings/downloads are static seed data. They must not be presented as verified live GitHub stars, downloads, or installs unless a remote API supplies them and the UI labels them accurately.

## Current Detail Modal

Status summary:

- Scrollable modal: PASS
- Basic name/icon/category/description/tags: PARTIAL
- slug: FAIL
- publisher: FAIL
- version: FAIL, currently generated locally
- homepage/repository/license: intentionally hidden from public UI after product decision, but the requested future detail spec requires displaying them safely.
- createdAt/updatedAt: FAIL
- install status: PASS
- installed/latest version: FAIL
- supported OpenClaw/OS: FAIL
- requirements/entry point/dependencies/env/API keys/install steps/changelog: mostly FAIL or placeholder/generated
- security information: FAIL
- safe Markdown renderer: FAIL

## Current Installation Behavior

GitHub install flow:

1. Discover default branch and repository tree from GitHub API.
2. Select a `SKILL.md` directory.
3. Build a file plan.
4. Create `~/.openclaw/skills/<skill-id>.tmp-<timestamp>`.
5. Download each file from `raw.githubusercontent.com`.
6. Write `.canvasland/origin.json`.
7. Remove existing install dir.
8. Rename staging dir to final install dir.
9. Enable skill in `~/.openclaw/openclaw.json`.
10. Update marketplace catalog install fields.

Rollback behavior:

- If download/write fails before rename, staging dir is removed.
- Existing install dir is removed immediately before rename, so replacing an existing skill is not fully rollback-safe.
- No install task audit record is persisted.

## Current Tests

Existing coverage includes:

- Marketplace seed loading and commercial license checks.
- GitHub URL parsing.
- ClawHub normalization.
- GitHub SKILL.md directory planning and path constraints.
- Catalog export/import.
- Marketplace E2E for search, category tabs, detail modal, installed filter, and hiding GitHub from public UI.

Missing coverage includes most requested security and state-machine tests.
