# Dependency Security Technical Debt

Last reviewed: 2026-08-11

Status: **OPEN**

## Audit baseline

The dependency audit was run from Node.js 22 with the committed npm lockfile:

```sh
npm ci --ignore-scripts --dry-run
npm audit --json
npm audit --omit=dev --json
npm audit fix --dry-run --json
```

The initial report contained 26 affected dependency nodes: 14 high, 11 moderate, 1 low, and 0 critical. These counts include the same advisory propagated through multiple parent packages and must not be read as 26 independent vulnerabilities.

The following non-breaking updates were applied:

- `@babel/core` from 7.28.4 to 7.29.7.
- React Native Community CLI packages from 20.1.0 to 20.2.0.
- Patched lockfile resolutions for `brace-expansion`, `js-yaml`, and `nanoid`.
- React Native CLI 20.2.0 replaced the vulnerable `fast-xml-parser` 4.x dependency with 5.x.

After those updates, `npm audit` reports 15 affected nodes: 11 high, 4 moderate, 0 low, and 0 critical. The remaining nodes are caused by two underlying dependency chains described below.

## TD-SEC-001: Metro image parser denial of service

Severity: **HIGH**  
State: **Blocked by upstream dependency resolution**

### Dependency path

```text
react-native -> Metro -> image-size
```

Affected package in the lockfile: `image-size@1.2.1`.

Relevant advisories:

- `GHSA-w3rx-r6r6-pgpr`: an ICNS input can cause an infinite parser loop.
- `GHSA-5p2g-fcmc-qvqq`: JXL and HEIF inputs can cause infinite parser loops.

### Exposure and current controls

`image-size` is used by the Metro build toolchain. It is not imported by application source and is not expected to execute as part of the installed Android or iOS application. The practical exposure is a developer machine or CI runner processing a malicious image during bundling.

Until the dependency chain is updated:

- Do not build unreviewed branches or third-party asset submissions in a trusted release environment.
- Treat newly added ICNS, JXL, HEIF, and other image assets as untrusted build input until reviewed.
- Do not use `npm audit fix --force`; npm currently proposes downgrading React Native from 0.86.2 to 0.72.17, which is incompatible with the current project baseline and does not represent an acceptable security update.

### Planned resolution

1. Monitor React Native and Metro releases for an `image-size` dependency that is outside the affected range.
2. Evaluate the next compatible React Native patch or minor release in a separate upgrade branch.
3. Verify Metro bundling, Android debug/release builds, iOS builds, SVG handling, and application startup before accepting the upgrade.

### Acceptance criteria

- `npm audit` no longer reports either `image-size` advisory through Metro.
- React Native is not downgraded.
- Android and iOS build checks pass with the updated Metro dependency chain.

## TD-SEC-002: PrismJS DOM clobbering dependency

Severity: **MODERATE**  
State: **No compatible upstream fix currently resolved by npm**

### Dependency path

```text
react-native-code-highlighter
  -> react-syntax-highlighter
  -> refractor
  -> prismjs@1.27.0
```

Relevant advisory: `GHSA-x7hr-w5r2-h6wg`.

### Exposure and current controls

The application uses `react-native-code-highlighter` in `AssistantMarkdown`. The current component imports Highlight.js styles and runs in React Native rather than a browser DOM, so the documented DOM-clobbering attack is not directly reachable in the native rendering path. The vulnerable package remains installed, however, and must be reconsidered before adding a web target or changing the renderer to a Prism/DOM-based path.

Until the dependency chain is replaced or upgraded:

- Do not introduce a Prism-based renderer from this dependency tree.
- Do not reuse this rendering path for React Native Web without a new security review.
- Keep the existing maximum highlighted-code length and untrusted message handling limits in place.

### Planned resolution

1. Monitor `react-syntax-highlighter`, `refractor`, and `react-native-code-highlighter` for a compatible release resolving PrismJS 1.30.0 or newer.
2. If upstream remains inactive, evaluate a React Native-specific highlighter that does not install PrismJS, or implement a narrowly scoped replacement using an already maintained parser.
3. Run Markdown rendering tests and verify long, malformed, and untrusted code blocks on Android and iOS.

### Acceptance criteria

- The lockfile no longer contains `prismjs` below 1.30.0.
- Assistant Markdown code blocks preserve syntax highlighting, theme switching, length limits, and scrolling behavior.
- Android and iOS tests pass; any future web target receives a separate DOM security review.

## Recheck procedure

Run this review whenever React Native, Metro, or the Markdown highlighting stack changes, and at least before a production release:

```sh
npm ci
npm audit
npm audit --omit=dev
npm explain image-size
npm explain prismjs
```

An audit count alone is not sufficient for acceptance. Each remaining advisory must be traced to its executing environment and verified against Android, iOS, build, and CI exposure.
