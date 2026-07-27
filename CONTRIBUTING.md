# Contributing to GitAll

Issues and pull requests are welcome.

## Before you open a PR

1. Run `npm run cleanup` (format, lint, test). CI runs the same checks.
2. Bump `version` in `package.json` following semver:
   - **Patch** (`x.y.Z`) — bug fixes, copy changes, styling tweaks
   - **Minor** (`x.Y.0`) — new features, new API routes, new components
   - **Major** (`X.0.0`) — breaking changes to APIs, session format, or deployment config

   `require-version-bump.yml` fails the PR if the version still matches `main`.

## Contributor License Agreement

GitAll is released under the [GNU AGPL v3](LICENSE). Toastbyte Studios may also offer GitAll under separate commercial terms, and that is only possible with permission from everyone who has contributed code.

**By submitting a contribution to this repository, you agree to the following.**

1. **You have the right to submit it.** The contribution is your original work, or you otherwise have the right to contribute it. If your employer has rights to intellectual property you create, you have permission to make the contribution on their behalf.

2. **You license it under the AGPL.** You license your contribution to the project and to all downstream recipients under the GNU AGPL v3.

3. **You grant a relicensing right.** You grant Toastbyte Studios a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, prepare derivative works of, publicly display, sublicense, and distribute your contribution and such derivative works, **including under license terms other than the AGPL**.

4. **You keep your copyright.** You retain all right, title, and interest in your contribution. Nothing here stops you from using it however you like elsewhere.

5. **No warranty.** Unless required by applicable law or agreed in writing, contributions are provided on an "AS IS" basis, without warranties or conditions of any kind.

Confirm your agreement by ticking the CLA checkbox in the pull request template. If you are contributing on behalf of a company and need a signed agreement instead, open an issue and we will sort it out before you write any code.

## Attribution

See [`ADDITIONAL_TERMS.md`](ADDITIONAL_TERMS.md) for the attribution requirement that applies to generated heatmaps.
