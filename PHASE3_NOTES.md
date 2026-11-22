# Phase 3 Review Notes (furniture rework finish pass)

## What this pass found

The working tree already had a partial rewrite of several furniture builders (sofa,
armchair, dining chair, stool, lamp, plant, suite bed, computer desk, bar counter,
dining table, cafe table) onto a new shared helper system in `js/sprites.js`
(`isoSprite`'s `box`/`cyl` with a `mat: 'wood' | 'fabric'` option, `frameBox` for
rotation, `tri()` for a 3-tone ramp from a single base hex). That system automatically
adds accent-only wood grain (via `woodStreak`, only on box tops and the lit left face,
never the full face) and fabric seams/rim highlights when `mat` is set.

The standalone `grain()` helper (the old way of adding wood texture by hand) had been
reduced to `export function grain() {}` — a silent no-op. One call site still used it:
`buildDiningBooth`'s plinth (`grain(box, 0.06, 0.08, tw - 0.06, th - 0.08, 8, { wood:
WALNUT[0] })`), which meant that booth plinth silently lost its grain accent.

## What changed this pass

- `buildDiningBooth`'s plinth now gets its grain accent through `{ mat: 'wood' }` on
  the `box()` call for the plinth, instead of a separate `grain()` call — reusing the
  already-tested accent-only `woodStreak` path rather than reintroducing the old
  all-over 3-stripe-band version of `grain()`.
- Verified (did not need to change) the already-rewritten builders:
  - `buildComputerDeskSprite`: the kneehole/cavity colour (`inside = tri('#7e5430')`)
    is a mid-tone brown, not near-black. Grain shows as a light accent on the desktop
    only (visible as faint broken diagonal streaks in `crop8x_desk_high.png`), not
    on every face.
  - `buildPlantSprite`: a terracotta pot with a lit rim, soil line, and a fern crown
    (centre column + a ring of rounded lumps + drooping fronds) — reads as a potted
    plant, not a green cube (`crop8x_plant_high.png`).
  - `upholsteredSeat` (shared by `buildSofaSprite`/`buildArmchairSprite`) and
    `buildDiningChairSprite`/`buildSuiteBedSprite`: fabric cushion tops use
    `mat: 'fabric'` with the seam left on (default), and every fabric box gets the
    shared rim-highlight row from `isoSprite`'s `paintBox`.
- `scripts/furniture-crops.mjs` already covered all of the above (crops the 15 "hero"
  items from `FURNITURE_BUILDERS` at Low and High detail, plus a 3x contact sheet of
  all 91 catalogue items). Re-ran it; no further code changes were needed to pass
  visual review at 8x.

## What this pass did not do

The remaining ~86 catalogue item builders (everything not in the "already rewritten"
list above) still use the older, more verbose direct-`box()`-call style rather than
the new `frameBox`/`tri`/`mat` helpers. That is a style/verbosity difference, not a
confirmed defect — spot-checking a few (dining booth, bar counter, wardrobe) did not
turn up near-black outlines, all-over dither, or smooth gradients. A full migration of
every remaining builder to the new helper system was judged out of scope for this fix
pass (it is a large, item-by-item visual-QA job, not a bug fix), and is left as
follow-up work rather than attempted partially under time pressure.

## Verification

- `npm test`: 290/290 passing.
- `node tests/perf-profile.mjs restaurant --mobile` x3: 27.0 fps, 32.1 fps, 31.5 fps
  (hard floor is 25.2 fps).
- 8x nearest-neighbour crops regenerated in `ph-rework-shots/phase3/` via
  `node scripts/furniture-crops.mjs` (bed, sofa, desk, lamp, plant, counter, armchair,
  dining chair, dining table, cafe table, stool, bookshelf, sky tree, kitchen range,
  wardrobe, each at Low and High detail), inspected directly (no further upscaling).
  `before-*.png` screenshots were not touched; `after-*.png` / `after_*.png` were
  regenerated via `node tests/shot.mjs`.
