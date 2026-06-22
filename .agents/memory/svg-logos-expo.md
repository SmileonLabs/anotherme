---
name: SVG assets in the Expo mobile app
description: How to add/use SVG images (logos, icons) in artifacts/mobile so they render on both native and web
---

# Using SVG assets in the Expo mobile app

Rendering SVGs as React Native components requires `react-native-svg-transformer`
(already installed) wired into `artifacts/mobile/metro.config.js` (filter `svg` out
of `assetExts`, add to `sourceExts`, set `babelTransformerPath`). A `*.svg` module
declaration lives in `artifacts/mobile/svg.d.ts` (listed in tsconfig `include`).
Import as a component: `import Logo from ".../logo.svg"` then `<Logo width height />`.

**Critical gotcha — Adobe Illustrator SVG `<style>` blocks do NOT work on native.**
`react-native-svg` ignores internal `<style>`/CSS-class styling on iOS/Android (it
works on web only). Illustrator exports always use `<defs><style>.st0{fill:...}</style>`
with `class="st0"` on paths, so the logo renders with wrong/default colors on phones.

**Fix:** run SVGO to inline the styles into presentation attributes before using them:
`npx svgo@3` with `preset-default` (override `inlineStyles.onlyMatchedOnce:false`,
`removeViewBox:false`) plus the `convertStyleToAttrs` plugin. Result has direct
`fill="..."`/`stroke="..."` attrs and no `<style>` — renders identically everywhere.

**Why:** the app showed a blank logo area until styles were inlined (and the file was
also white-on-white in light mode — see naming note below).

**Naming note for this app's logos:** `logo_black.svg` has white fills → for DARK
backgrounds; `logo_white.svg` has navy/purple multicolor → for LIGHT backgrounds.
So map: light mode → LogoWhite, dark mode → LogoBlack (counter-intuitive from names).

**How to apply:** any new SVG asset from a designer/Illustrator must be SVGO-inlined
before import, and you must restart the mobile workflow after changing metro.config.js
or SVG file contents (Metro caches transformed output).
