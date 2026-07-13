# Canvasland AI Workflow Runner

## Scope

Phase one focuses only on the three customer-confirmed AI Apps:

- `ecommerce-copywriting`
- `detail-poster-generator`
- `product-short-video`

Do not add a fourth workflow until these three are accepted.

## Unified Workflow Definition

The canonical workflow definitions live in:

- `shared/ai-workflows.ts`

Each workflow defines:

- `id`
- `name`
- `description`
- `inputSchema`
- `outputType`
- `providerCapability`
- `promptTemplate`
- `defaultModel`
- `supportedRatios`
- `acceptsReferenceImages`
- `asyncTask`

Renderer UI and Electron Main should both use this source instead of maintaining separate hardcoded app lists.

## Execution Chain

```text
Renderer form
  -> host-api aiApps.createJob
  -> Electron Main ai-apps-api
  -> workflow definition validation
  -> provider capability adapter
  -> chat / image / video provider
  -> normalized AiAppJob
  -> UI result panel and recent job history
```

## Provider Capability Rules

- `providerCapability: chat` runs text generation only.
- `providerCapability: image` runs image generation only.
- `providerCapability: video` runs asynchronous video task creation and status refresh only.
- Unsupported provider capability must return a visible error. Silent failure is not allowed.

## Source Library

The AI source library lives in:

- `resources/ai/source-library.json`

`ddlmanus/open-picsetai` is recorded as MIT and commercially usable, but it is a full AI App reference project, not a lightweight Skill package. It should be used as a product/workflow reference for Canvasland-owned AI Apps.
