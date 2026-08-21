# Decision: Fix pnpm/action-setup Multiple versions error

Date: 2026-08-22
Scope: timemark-docker (primary) + timemark-vercel (reference)
Workflows: `.github/workflows/ci.yml` and `.github/workflows/docker.yml`
Runs cited: 32502948645, 32502067662 — `ERR: Multiple versions of pnpm specified`

## 1. Evidence (T1)

### 1.1 Workflows before fix (all 4 identical pattern)
```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'
```

Files inspected:
- `timemark-docker/.github/workflows/ci.yml` — lines 14-16 contain `with: version: 9`
- `timemark-docker/.github/workflows/docker.yml` — lines 29-32 contain `with: version: 9`
- `timemark-vercel/.github/workflows/ci.yml` — same
- `timemark-vercel/.github/workflows/docker.yml` — same

### 1.2 package.json + lockfile
- `timemark-docker/package.json`: `"packageManager": "pnpm@9.12.0"`
- `timemark-docker/pnpm-lock.yaml`: `lockfileVersion: '9.0'`
- `timemark-vercel/package.json`: no `packageManager` field (but lockfile also 9.0; future-proofing applies)

### 1.3 Error reproduction
`pnpm/action-setup@v4` with `with.version` **and** `packageManager` present triggers failure in
`src/install-pnpm/run.ts` (upstream `pnpm/action-setup`):

```ts
// simplified from src/install-pnpm/run.ts
const packageManagerVersion = readPackageManagerField(); // "pnpm@9.12.0" -> "9.12.0"
const inputVersion = core.getInput('version');           // "9"
if (packageManagerVersion && inputVersion && packageManagerVersion !== inputVersion) {
  throw new Error(`Multiple versions of pnpm specified:\n - version in package.json: ${packageManagerVersion}\n - version in action input: ${inputVersion}`);
}
```

Strict string inequality `9 !== 9.12.0` always throws, even though 9 is a prefix of 9.12.0.
GH logs 32502948645 / 32502067662 show same failure on `Setup pnpm` step.

### 1.4 Constraints
- Node 22 must stay (`actions/setup-node@v4` with `node-version: '22'`, `cache: 'pnpm'` retained).
- `pnpm install --config.blockExoticSubdeps=false` / `--frozen-lockfile` flags retained.
- Do NOT bump pnpm 10, do NOT change `lockfileVersion`.

## 2. Options

| Option | Description | Pros | Cons | Verdict |
|--------|-------------|------|------|---------|
| **A** | **Remove `with: version` from `pnpm/action-setup@v4`** — let action read `packageManager: pnpm@9.12.0` | Single source of truth; no string-mismatch; future pnpm patch bumps auto-picked; minimal 2-line diff; matches pnpm docs recommended usage | Requires `packageManager` field present (docker has it; vercel should add separately) | **Chosen** |
| B | Pin `with: version: 9.12.0` to match `packageManager` | Makes check pass exactly | Duplicates version in two places; every patch bump needs workflow edit; drift risk returns | Rejected — violates DRY |
| C | Remove `packageManager` field from `package.json`, keep `with: version: 9` | Unblocks check (only one source) | Loses Corepack/pnpm enforcement; `lockfileVersion` drift undetected; contradicts pnpm best practice | Rejected — weakens toolchain |
| D | Downgrade `pnpm/action-setup@v3` or set `run_install: false` hacks | Sidesteps new strict check | Pins to older action; hides real conflict; extra config complexity | Rejected — workaround not fix |

## 3. Decision

**Choose A: delete `with: version: 9` lines (surgical 2 lines per workflow).**

Resulting step:
```yaml
- uses: pnpm/action-setup@v4
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'pnpm'
```

Rationale:
- Upstream logic in `src/install-pnpm/run.ts` does exact string compare; `9 !== 9.12.0` will always fail. Only way to satisfy without duplication is single source.
- `packageManager` is already the canonical version for Corepack and `setup-node` cache; workflows should not override it.
- Minimal change, preserves Node 22 + cache + blockExoticSubdeps behavior.

## 4. Change set (T2)

- `timemark-docker/.github/workflows/ci.yml`: delete `with:` + `version: 9` (2 lines under `pnpm/action-setup@v4`)
- `timemark-docker/.github/workflows/docker.yml`: same 2-line deletion
- `timemark-vercel` workflows: out of scope for this commit; same fix recommended in follow-up (or batch push).
- No `package.json`, no `pnpm-lock.yaml`, no pnpm major bump.

## 5. Verification

- `scripts/verify-pnpm-workflow.mjs` checks:
  1. No `with: version` under any `pnpm/action-setup` step in `ci.yml`/`docker.yml`
  2. `packageManager` field exists in `package.json` (docker)
  3. `lockfileVersion` unchanged
- Expected: RED before fix (fails on `with: version`), GREEN after (all pass).
- Additional: `yamllint` on both workflows, `pnpm install --frozen-lockfile` smoke (optional).

## 6. Risks & Follow-up

- If `timemark-vercel/package.json` lacks `packageManager`, action will fallback to latest pnpm 9.x — recommend adding `"packageManager": "pnpm@9.12.0"` in separate commit.
- TS build errors explicitly out of scope.
