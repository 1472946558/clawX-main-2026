# Skills Marketplace Security Model

Date: 2026-07-10

This document defines the security boundary for skill browsing, installation, rendering, and execution. It distinguishes current behavior from the required production model.

## Security Goals

The skill marketplace must prevent a browsed skill from becoming executable code unless it passes source validation, metadata validation, security scanning, policy evaluation, and user/admin confirmation where required.

The renderer must remain untrusted. All privileged actions must be performed by Electron Main or a controlled backend through explicit, schema-validated IPC.

## Trust Boundaries

```text
Untrusted / lower trust
  - Remote catalog metadata
  - GitHub repository content
  - ClawHub marketplace content
  - SKILL.md body
  - Markdown links/images
  - User search text
  - Renderer process

Trusted / higher trust
  - App-bundled resources
  - Electron Main process
  - Local install policy
  - Local audit store
  - OpenClaw controlled skills directory
```

## Renderer Boundary

Renderer must not have:

- `child_process`
- `exec`
- `spawn`
- arbitrary `fs` read/write
- arbitrary shell command execution
- OpenClaw management tokens
- direct model billing credentials

Current status:

- Renderer does not directly import Node `child_process`.
- Renderer uses `window.clawx.hostInvoke`.
- Preload exposes a fixed list of legacy IPC channels and the host invoke bridge.
- Main owns marketplace install operations.

Current risk:

- `host:invoke` accepts module/action strings and resolves registered actions. The request shape is validated, but action payloads are mostly manually validated per service, not schema-validated with a shared runtime schema.
- Renderer can request privileged actions such as shell open path, file read/write preview APIs, gateway control, and marketplace install.

Required hardening:

- Add runtime schema validation for every skills IPC payload.
- Forbid extension-contributed host actions from overriding core actions.
- Add permission metadata for privileged actions.
- Audit every renderer-callable path that can open files, write files, install dependencies, or start processes.

## Markdown Rendering Policy

Skill detail Markdown must be rendered as untrusted content.

Required rules:

- No script execution.
- No `javascript:` URLs.
- No remote iframes.
- External links must show an external-link indicator and open through controlled `shell.openExternal`.
- Code blocks are display-only and must never be executed automatically.
- Dangerous HTML must be filtered.
- Remote image sources must be restricted or proxied.
- Local file paths and secrets must not be rendered.

Current status:

- The current marketplace detail modal does not render remote Markdown. It displays generated text and `<pre><code>` blocks only.
- There is no dedicated safe Markdown renderer for full marketplace details.

## Install Policy

V1 policy decisions:

- `allow`
- `require_confirmation`
- `block`

Default allow:

- ClawX built-in whitelist skills.
- Official approved sources.
- Admin-reviewed skills with passing scan results.

Default browsing-only:

- Public third-party skills that have not been admin-reviewed.

Default block:

- `curl | bash`
- `wget | sh`
- `eval` on untrusted input
- shell injection patterns
- system startup item modification
- browser cookie access
- SSH key access
- wallet or seed phrase access
- scanning the whole user directory
- undeclared network upload
- crypto mining
- persistent backdoor behavior
- undeclared system commands
- deleting user files
- install source mismatch between catalog and fetched content

Current status:

- No install policy engine exists.
- Current install gate only checks review status, commercial-use flag, license allowlist during import/review, path safety, and file size/count.

## Download and Staging Policy

Required flow:

1. Download to isolated staging directory.
2. Verify source URL, slug, version, and hash.
3. Reject path traversal.
4. Parse `SKILL.md`.
5. Validate metadata.
6. Scan before installation.
7. Do not modify existing install until the staged copy is accepted.
8. On failure, remove staging and preserve existing install.

Current status:

- GitHub install uses a staging directory under `~/.openclaw/skills/<id>.tmp-*`.
- It validates tree paths and target paths.
- It enforces file count, per-file size, and total size limits.
- It writes `.canvasland/origin.json`.
- It removes the existing install directory before renaming staging to final, so replacement is not fully rollback-safe.
- It does not verify hash, version, signature, metadata schema, or security scan result.

## Dependency Execution Policy

Markdown commands and `SKILL.md` code examples must never execute automatically.

Allowed dependency installation, when implemented, must require:

- Parsed dependency metadata.
- Allowlisted package managers and command shapes.
- No shell pipelines.
- No redirection into shell.
- No arbitrary `postinstall` execution unless explicitly approved.
- Permission confirmation for network, filesystem, environment, and command execution.
- Audit log entry.

Current status:

- The installer does not execute `pip`, `npm`, `bash`, or markdown commands.
- It also does not support controlled dependency installation yet.

## Security Scan Model

Required `SkillSecurityScan` checks:

- `SKILL.md` exists.
- Metadata schema is valid.
- Slug and source match catalog.
- Version is valid.
- File hash matches catalog/version record.
- Dangerous commands are detected.
- Suspicious file types are detected.
- Declared permissions match detected behavior.
- Network destinations are declared.
- Environment variables and API key requirements are explicit.
- File permissions are bounded.

Scan result:

- `passed`
- `requires_confirmation`
- `blocked`
- `failed`

Current status:

- No security scan record exists.
- No dangerous-pattern scanner exists.
- No permission model exists.

## Installed Skill Integrity

Required installed record:

- `skillId`
- `slug`
- `installedVersion`
- `source`
- `sourceUrl`
- `checksum`
- `installPath`
- `enabled`
- `installedAt`
- `updatedAt`
- `lastVerifiedAt`

Current status:

- Marketplace item records `installPath` and `installedAt`.
- GitHub install writes `.canvasland/origin.json`.
- Local scanner can read some version/source metadata from `manifest.json`, `.clawhub/origin.json`, and `.clawx-preinstalled.json`.
- There is no checksum, installed version, scan id, or verified-at record for GitHub marketplace installs.

## OpenClaw Reload and Discovery

Required proof of success:

- Skill files exist on disk.
- `SKILL.md` parses successfully.
- OpenClaw reload or status refresh is triggered.
- OpenClaw can discover the installed skill.
- Enabled/disabled state is reflected in OpenClaw config.

Current status:

- Install writes files and updates `~/.openclaw/openclaw.json`.
- The code does not prove OpenClaw rediscovered the skill after install.
- The UI success message is not sufficient evidence of installation success.

## Core Built-In Ecommerce Skills

Required security rules:

- Core ecommerce skills are app-bundled or shipped through a trusted internal channel.
- They are enabled by default.
- Regular users cannot uninstall them.
- Admin can disable them.
- AI Apps must report disabled reason if a required skill is disabled.
- They must call backend business task APIs and billing systems, not model providers directly.

Current status:

- Not implemented as marketplace skills.

## Required Security Test Matrix

The following requested tests are not yet fully covered and should be implemented before production install is enabled:

- Markdown safe rendering.
- Built-in whitelist install.
- Dangerous skill blocked.
- Permission confirmation cancel.
- Install failure rollback.
- Repeated click/concurrent install prevention.
- Skill update.
- Disable/enable.
- Ordinary skill uninstall.
- Core skill uninstall blocked.
- Restart persistence.
- Renderer cannot execute shell.
- Non-admin cannot change install policy.
- Detail page does not leak local paths or secrets.
