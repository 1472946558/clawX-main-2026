# Skills Marketplace Architecture

Date: 2026-07-10

This document describes the current architecture and the target architecture needed for a production-grade Canvasland skill marketplace.

## Current Architecture

```text
Renderer
  src/pages/Skills/index.tsx
    |
    | hostApi.skills.*
    v
Preload bridge
  window.clawx.hostInvoke(request)
    |
    v
Electron Main host API
  electron/main/ipc/host-invoke.ts
    |
    v
Skills API
  electron/services/skills-api.ts
    |
    +--> MarketplaceSkillService
    |     electron/services/skills/marketplace-skill-service.ts
    |
    +--> ClawHubService
    |     electron/gateway/clawhub.ts
    |
    +--> LocalSkillService
          electron/services/skills/local-skill-service.ts
```

## Current Catalog Sources

```text
resources/skills/marketplace-seeds.json
        |
        v
electron-store: skill-marketplace.skills
        |
        v
marketplaceList -> approved + commercial-use skills
```

Additional operator-only sources exist:

- GitHub import preview reads GitHub repository metadata, license, and tree.
- ClawHub import preview reads an extension-provided marketplace provider if registered.
- Catalog import/export supports future backend synchronization.

There is currently no production backend catalog service wired into the public list page.

## Current Install Flow

```text
User clicks Install
  |
  v
Renderer calls hostApi.skills.marketplaceInstall({ id })
  |
  v
Main loads SkillMarketplaceItem from electron-store
  |
  +-- if GitHub:
  |     discover GitHub tree
  |     choose SKILL.md directory
  |     download raw files into ~/.openclaw/skills/<id>.tmp-*
  |     write .canvasland/origin.json
  |     rename tmp dir to ~/.openclaw/skills/<id>
  |
  +-- if ClawHub:
  |     call ClawHubService.install({ slug })
  |
  v
update ~/.openclaw/openclaw.json skills.entries[skillKey].enabled = true
  |
  v
update marketplace catalog installStatus/installPath/installedAt
```

## Target Architecture

The requested production architecture should split catalog browsing, install orchestration, security scanning, policy decisions, and OpenClaw reload verification.

```text
Renderer
  Skills Marketplace UI
  Skill Detail Modal
  Permission Confirmation UI
    |
    v
Preload allowlisted IPC
    |
    v
Electron Main / controlled backend
    |
    +--> SkillCatalogService
    |     list/search/sort/cache remote + local catalog
    |
    +--> SkillInstallService
    |     create task, download, stage, scan, install, rollback
    |
    +--> SkillSecurityService
    |     metadata validation, markdown scan, dangerous pattern scan
    |
    +--> SkillPolicyService
    |     allow / require_confirmation / block
    |
    +--> SkillStateService
    |     InstalledSkill, task, scan, audit persistence
    |
    +--> OpenClawSkillService
          reload, discover, verify enabled state
```

## Required Domain Models

The requested model set should be implemented as durable local records. The storage can initially be `electron-store` JSON files, but the schema should be explicit and migratable.

### SkillCatalog

Represents a browseable marketplace item.

Required fields:

- `skillId`
- `slug`
- `name`
- `publisher`
- `category`
- `description`
- `tags`
- `homepage`
- `repository`
- `license`
- `latestVersion`
- `createdAt`
- `updatedAt`
- `source`
- `sourceUrl`
- `installPolicy`
- `securityStatus`

### SkillVersion

Represents a specific installable release.

Required fields:

- `skillId`
- `version`
- `sourceUrl`
- `checksum`
- `files`
- `requirements`
- `entryPoint`
- `openClawVersionRange`
- `supportedOs`
- `changelog`

### InstalledSkill

Required fields from product spec:

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

Additional recommended fields:

- `core`
- `preinstalled`
- `publisher`
- `license`
- `installTaskId`
- `scanId`
- `originCommit`

### SkillInstallTask

Represents the install state machine.

States:

- `not_installed`
- `downloading`
- `staged`
- `scanning`
- `awaiting_confirmation`
- `installing`
- `installed`
- `disabled`
- `update_available`
- `updating`
- `uninstalling`
- `failed`
- `blocked`

Required fields:

- `taskId`
- `skillId`
- `requestedVersion`
- `state`
- `createdAt`
- `updatedAt`
- `startedAt`
- `finishedAt`
- `errorCode`
- `safeErrorMessage`
- `stagingPath`
- `installPath`

### SkillSecurityScan

Required fields:

- `scanId`
- `skillId`
- `version`
- `source`
- `checksum`
- `status`
- `scannedAt`
- `findings`
- `permissions`
- `policyDecision`

### SkillPermission

Required fields:

- `skillId`
- `version`
- `permissionType`
- `declared`
- `detected`
- `riskLevel`
- `requiresConfirmation`

### SkillAuditLog

Required fields:

- `eventId`
- `skillId`
- `taskId`
- `actor`
- `eventType`
- `createdAt`
- `metadata`
- `safeErrorMessage`

## Target List Page Architecture

The list page should be backed by a query state object:

```ts
type SkillCatalogQuery = {
  search?: string;
  category?: SkillMarketplaceCategory | 'all' | 'installed';
  sort?: 'popular' | 'updated' | 'name' | 'installed';
  cursor?: string;
  limit: number;
};
```

The API should return:

```ts
type SkillCatalogPage = {
  items: SkillCatalogCard[];
  nextCursor?: string;
  fromCache: boolean;
  refreshedAt?: string;
};
```

Do not show fake metrics. If remote catalog does not provide stars/downloads/installs, the card should hide that field or display `No data`.

## Target Install Flow

```text
1. User clicks Install.
2. Main creates SkillInstallTask.
3. Download into isolated staging directory.
4. Verify source, slug, version, and file hashes.
5. Extract safely and prevent directory traversal.
6. Locate and parse SKILL.md.
7. Validate metadata schema.
8. Scan dangerous files and text patterns.
9. Analyze dependency and permission declarations.
10. Apply local install policy.
11. If required, show permission confirmation to user.
12. After confirmation, execute only allowed dependency installation steps.
13. Install into controlled skill directory.
14. Write source, version, checksum, scan id, and install time.
15. Notify OpenClaw to reload skills.
16. Verify OpenClaw can discover the skill.
17. Update UI from durable install state.
```

## Target Built-In Ecommerce Skills

The requested built-in ecommerce skills should be treated as core Canvasland skills:

- `ecommerce-copywriting`
- `ecommerce-detail-images`
- `ecommerce-product-video`

Architecture requirements:

- Shipped in app resources.
- Installed or exposed automatically on first launch.
- Enabled by default.
- Not uninstallable by regular users.
- Admin may disable.
- AI Apps must check enabled state and show unavailable reason if disabled.
- All model calls must go through business task and billing services.
- Skills must not call paid models directly.

Current status: not implemented in the skill marketplace architecture.

## Current Gaps Against Requested Scope

- No production remote catalog.
- No sorting/pagination/infinite loading.
- No reliable remote metrics.
- No full detail schema.
- No safe Markdown renderer for full skill detail.
- No install task state machine.
- No checksum verification.
- No security scanner.
- No permission confirmation.
- No update workflow.
- No GitHub marketplace uninstall workflow.
- No immutable installed skill model.
- No OpenClaw reload/discovery proof after install.
- No core built-in ecommerce skills in marketplace.
