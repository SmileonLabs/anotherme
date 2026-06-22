---
name: Workspace typecheck noise
description: Why full `pnpm run typecheck` shows a failure that is not from app code
---

Running the root `pnpm run typecheck` fails inside `artifacts/mockup-sandbox`
(`src/components/ui/spinner.tsx`) with a React 19 `Ref<SVGSVGElement>`
"two different types with this name exist" error.

**Why:** It's a pre-existing types mismatch in the mockup-sandbox scaffold (a
design/canvas tool), unrelated to the api-server / mobile / db / api-spec app
packages.

**How to apply:** Don't chase it when verifying app changes. Verify per package
instead — `pnpm --filter @workspace/api-server run typecheck`,
`pnpm --filter @workspace/mobile run typecheck`,
`pnpm --filter @workspace/db run ...`. Only treat the root typecheck as broken by
your work if the failing file is in a package you actually touched.
