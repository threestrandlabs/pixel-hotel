# Pixel Hotel art direction

The locked visual target for every sprite. New art must follow it; if a rule
has to change, change it here first.

## Technical frame
- **Engine:** PixiJS 8, nearest-neighbour filtering, `roundPixels`, no mipmaps.
- **Projection:** 2:1 isometric. A floor tile is a **64×32** diamond. Edges are
  clean 2:1 stair steps (two pixels across per pixel down).
- **Scale:** 1 art pixel = 1 world pixel. The camera zooms in whole steps
  (1×–4×, default 2×) so pixels stay square.
- **Walls:** 88 px tall above the floor line.
- **Characters:** isometric block figures ~44 px tall, feet on the tile centre.
- **Furniture:** one sprite per object and rotation, pivot at the footprint's
  north (top) corner on the floor. Rotations 1 and 3 are mirrors of 0 and 2;
  asymmetric items get all four.

## Visual system
- **Light:** from the upper left. Faces pointing to the screen's lower left
  (`+v`) are lit, faces pointing lower right (`+u`) are shaded, tops brightest.
- **Ramps:** every material uses a 5-step ramp from `art/palette.js`
  (highlight, light, base, shade, outline). Shadows lean purple, never grey.
- **Outlines:** selective outline only. The silhouette edge is the object's own
  colour darkened (`selout`), not a black line. Inner edges are shown by value
  change, with a 1 px highlight on the top front edges.
- **Detail density:** few, deliberate details (seams, buttons, grain strokes)
  that still read at 1×. No noise, dithering only for glass and water.
- **Shape language:** soft, rounded boutique-hotel furniture; brass and walnut
  accents; berry and teal fabrics.

## Characters
Characters are built from isometric blocks (head cube, torso, arms, legs,
shoes, hair caps) in `art/sprites/character.js` and projected exactly like the
furniture, so they read as solid 3D figures in the room. One body unit is
1/16 tile; a standing avatar is ~44 px tall. All four facings are rendered
natively (never mirrored) so the lit side always matches the room light.
Each block belongs to a tint layer (skin, hair, top, bottom, shoes) drawn in
the grey `TINT` ramp and tinted at runtime with the wardrobe colour; eyes and
mouth are fixed colours on the head's front face. Poses: idle, 4-frame walk
(legs stride, arms swing), sit.

### Wearables
A skin-toned base body is rendered once; ears, bottoms, shoes, tops, hair and
accessories are each rendered over it and keep only their visible pixels, so
anything any of them hides stays hidden. Garments sit 0.15 body units proud of
the body. Wearables use the grey tint ramp; fixed-colour details (gold
buttons, ties, shirts under jackets) go in a separate `_trim` sprite. Glasses
and all face features are drawn on the 14x12 face grid. Stacking order:
skin, ears, bottom, shoes, top, top trim, hair, face, accessory, accessory trim.
`scripts/preview-wardrobe.mjs` renders the whole catalogue for review.

## Provenance
All art is hand-authored for this project in `art/sprites/*.js` and built by
`scripts/build-atlas.mjs`. No generated or third-party images.
