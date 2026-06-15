# MARS PIT Art Direction

Status: prep for `SPEC.md` T37. This document does not change the spec; it translates
the current task table into a production art plan that can be picked up without touching
sim/combat work in progress.

## Current Spec Read

- Done: fixed loop, WebGPU renderer, arena, fixed camera, player movement, sprint, enemy
  pools, enemy instancing, gate telegraphs, HUD basics.
- In progress: quality/dev overlay (`T4`), weapon targeting/projectiles (`T14`),
  centralized damage (`T15`).
- Open art-facing work: pooled muzzle/impact/audio events (`T16`), XP shards (`T17`),
  slice content (`T33`), evolutions (`T34`), accessibility (`T36`), and explicit art
  direction (`T37`: cel/toon TSL material, hybrid outlines, pooled GPU particles,
  reactive arena).

Given that split, art work should avoid runtime ownership changes for now. The safest
prep is visual language, texture/material recipes, model briefs, and effect rules that
can be wired once `T14`-`T16` settle.

## Reference Read

The target is not "make Borderlands." It is "learn why that family of games reads
instantly, then make a Mars colosseum version."

Useful takeaways:

- The Borderlands look is often called cel-shaded, but the stronger description is
  comic-book rendering using hand-drawn textures plus engine outlines. Surfaces carry
  drawn scratches, grime, hatch strokes, decals, and painted value breaks; outlines make
  silhouettes and major forms pop.
- The original shift mattered because realism did not match the loud loot-shooter tone.
  Stylization helped the game stand apart from other post-apocalyptic shooters.
- The humor is strongest when it comes from character/world logic: petty institutions,
  cruel commerce, ridiculous gear, and self-important villains. The weaker pattern is
  disposable meme humor or constant fourth-wall parody.
- Dark moments still work when the comedy has a real world beneath it. For MARS PIT,
  that means the arena can be absurdly commercial and violent without turning every
  object into a gag.

Sources used for this reading:

- https://en.wikipedia.org/wiki/Borderlands_(video_game)
- https://en.wikipedia.org/wiki/Borderlands_(series)
- https://en.wikipedia.org/wiki/Cel_shading
- https://www.gamesradar.com/games/borderlands/borderlands-4-could-have-looked-very-different-the-og-rpg-initially-had-realistic-visuals-that-were-too-similar-to-fallout-3-so-gearbox-rebuilt-the-whole-game-after-2-weeks-of-experimenting-led-to-its-iconic-comic-style/
- https://www.pcgamer.com/games/fps/take-two-ceo-says-the-original-borderlands-art-style-overhaul-cost-a-year-of-dev-time-and-usd50-million-had-we-not-done-that-borderlands-wouldnt-have-been-a-hit/
- https://www.gamesradar.com/games/borderlands/borderlands-4-writers-say-the-previous-game-sometimes-felt-like-parody-and-while-theres-at-least-one-meme-in-the-new-loot-shooter-it-does-not-involve-a-skibidi-toilet/

## MARS PIT Spin

Working style name: **Martian Pulp Brutalism**.

Premise translation:

- Borderlands has wasteland loot chaos. MARS PIT has televised arena capitalism on Mars.
- The world should feel like a Roman colosseum rebuilt by debt collectors, arms sponsors,
  and failed terraformers.
- The incremental layer should be visible in-universe: upgrades are contracts, glory-tree
  nodes are propaganda stamps, prestige currency is blood-sport scrip, and arena gates
  are sponsored death doors.

Visual pillars:

1. **Ink-Heavy Silhouettes**
   - Thick outer outlines for player, bosses, gates, projectiles, and readable pickups.
   - Thinner interior edge marks only where they clarify shape at top-down scale.
   - Avoid dense line noise on small enemies; use color blocking plus one bold mark.

2. **Painted Rust, Not Smooth Metal**
   - Every hero surface gets hand-painted value islands: rust freckles, chipped paint,
     sand abrasion, black grease strokes, hazard stripes, welded seams.
   - Materials should quantize light into 2-3 bands. Smooth PBR gradients are the enemy.
   - Mars dust should sit on top-facing surfaces, not uniformly tint everything orange.

3. **Commercial Blood Sport**
   - Arena decals: sponsor logos, debt notices, hazard arrows, kill-count tally marks,
     fake safety labels, ceremonial laurels stamped over industrial junk.
   - UI copy and prop labels should sound like contracts and propaganda, not internet
     jokes.
   - Humor example: "Audience Safety Radius: The Audience Paid Extra."

4. **Readable Top-Down Violence**
   - From the fixed camera, effect shapes need iconic silhouettes: spikes, starbursts,
     rings, arrows, cones, dust puffs.
   - Hits must read immediately at combat scale. The player should be able to tell
     whether a projectile hit, pierced, crit, staggered, or glanced from the effect
     profile alone.
   - Use saturated accent colors for combat state: plasma yellow, shield cyan, bleed red,
     poison green, elite magenta. Keep arena base lower contrast so gameplay wins.
   - FX should be pooled and capped per `SPEC.md`; no bespoke light spam.

5. **Mars Mythology Through Junk**
   - Names and motifs borrow from Mars/Phobos/Deimos, gladiators, mining machinery,
     rusted aerospace, and corporate sponsorship.
   - The game should not look like generic post-apocalypse; it should look like a ritual
     pit built out of failed colony infrastructure.

## Humor Rules

Use:

- weapon names that sound legally dangerous: `Contractual Sidearm`, `Breach Clause`,
  `Liability Waiver`, `Rust Devil`, `Non-Refundable Launcher`.
- arena signage that is bureaucratic and hostile: "Respawn Fee Pending", "Gate Four Is
  Not Liable", "Bleeding Void Where Prohibited".
- boss titles that overstate status: `Gatekeeper of Phobos`, `Regional Pain Officer`,
  `Acting Emperor of Accounts Receivable`.
- short bark style: cruel, punchy, in-world.

Avoid:

- direct Borderlands characters, logos, faction language, or weapon manufacturers.
- meme references, random fourth-wall jokes, or modern streamer slang.
- jokes that obscure gameplay state. A warning sign can be funny; a telegraph must still
  be unmistakable.

## Palette

Base world:

- `#2a1712` burnt umber shadow
- `#5b2b1d` old rust
- `#8f3f24` oxidized iron
- `#c46a2b` Mars dust orange
- `#d8b46a` sun-baked brass

Ink and paper:

- `#070504` near-black ink
- `#241814` warm interior line
- `#f0c879` hard sun highlight

Gameplay accents:

- `#ffd23f` kinetic muzzle / pickup gold
- `#32d7ff` shield / tech cyan
- `#ff3b30` health damage red
- `#83f04f` toxic / acid green
- `#d84cff` elite / void magenta

Palette warning: do not let the whole screen become orange. The current Rust Crown base
already leans warm; cyan, magenta, acid green, and black ink are needed for contrast.

## Texture Recipes

These can be painted by hand, generated procedurally, or baked from simple source art.
Prefer small tileable textures and atlases over unique materials per entity.

Arena floor atlas:

- cracked circular sandstone plates
- black ink crack pass
- pale dust pass on top-facing areas
- faded sponsor stencil pass
- radial crowd-wear marks around center

Gate atlas:

- rusted red armor plates
- yellow hazard stripes
- black outline trim baked into albedo
- glowing gate number plates
- old weld scars and white safety labels

Character/enemy atlas:

- one shared ink ramp strip for shadow bands
- small decal sheet: eyes, teeth, spikes, bolts, bandages, labels
- enemy color variants via instance color, not unique materials

Projectile/effect atlas:

- starburst muzzle cards
- circular impact rings
- comic smoke puffs
- ember streaks
- triangular warning shards for telegraphs
- directional blood spurts and small floor splat decals

## Model Briefs

Keep meshes simple and readable from above. Shape language matters more than polygon
detail.

Mara Vex:

- silhouette: compact armored runner with one oversized shoulder plate and a thruster
  pack.
- top-down read: bright helmet/face mark, orange cape/scarf or rear cloth strip, cyan
  sprint jets.
- material notes: scratched white armor over red undersuit, black ink seams, brass
  contract tags.

Rust Mite:

- small fast enemy; triangular scrap shell, single glowing eye, two front cutters.
- top-down read: wedge shape points toward movement.
- color: rust body, cyan eye, black underside.

Debt Hound:

- medium chaser; long low body, jaw silhouette, spiked invoice plates along back.
- top-down read: rectangle with aggressive head wedge.
- color: dark iron, red mouth/weak point, yellow hazard stripe.

Gatekeeper of Phobos:

- boss built from a gate mechanism, ceremonial crown ring, and industrial crusher arms.
- top-down read: huge circular body with four rotating gate-shield quadrants.
- humor note: behaves like a sacred emperor, branded like a municipal toll machine.

## Effects Plan

Implement after `T16` event hooks exist.

- Muzzle flash: 2-3 frame additive star card plus small black impact line card. No dynamic
  light per shot.
- Impact: every weapon family needs a distinct hit read. Sidearms get sharp yellow-white
  ticks, shotguns get wide chunky bursts, beams get scorch streaks, explosives get heavy
  ring shock and dust, acid gets sticky green splash. Do not use one generic hit puff for
  all damage.
- Impact direction: hit effects should orient from the incoming projectile direction and
  contact normal. On enemy hits, the main burst should exit away from the hit face; on
  floor/wall hits, sparks/dust should travel along the surface tangent with a short
  perpendicular kick.
- Blood: biological enemies need pooled directional blood spurts. Blood should fly out in
  the rough physically correct direction: mostly perpendicular to the struck surface,
  biased away from the projectile path, with a smaller trailing mist along the projectile
  direction for high-energy hits.
- Blood floor marks: some blood particles should land as pooled x,z-plane decals. Decals
  should preserve directionality through teardrop, streak, or fan shapes instead of
  circular blobs. Fade or recycle by lifetime/count cap; never allocate unbounded stains.
- Impact layering: combine a tiny contact flash, directional matter burst, and optional
  floor decal. The flash communicates timing, the burst communicates force/direction, and
  the decal communicates consequence.
- Enemy hit: quantized white/yellow flash for one render frame plus outline pulse.
- Enemy death: comic dust poof, scrap triangles, short dissolve or scale collapse.
- Gate spawn: current telegraph should become a sponsor-branded warning plate plus red
  rotating hazard arcs. The gameplay timing stays authoritative in sim.
- XP shard: bright cyan/gold crystal with black rim and tiny dust trail. It must read
  separately from projectiles.
- Sprint trail: two cyan exhaust commas, pooled, fade by lifetime, obey flash reduction.

## T37 Implementation Path

Lowest-conflict order:

1. Create render-only art tokens: palette constants, toon band thresholds, outline
   thickness presets. No sim imports.
2. Replace ad-hoc colors in arena/player/enemy/projectile views with tokens.
3. Add a small material helper for toon/ink materials once Three WebGPU TSL details are
   verified. Do not fake this with broad fallback materials.
4. Add procedural placeholder textures for floor/gate/player/enemy atlases. Keep them in
   render/content ownership, not sim.
5. Add pooled particle/effect renderer only after `T16` event shape is stable.
6. Add accessibility controls to reduce flashes/shake before making high-intensity FX
   default (`T36`).

Effect data needed from gameplay events:

- impact position on x,z
- incoming direction on x,z
- target kind: enemy, floor, gate, wall, shield, armor
- damage type and weapon visual profile
- hit result flags: crit, kill, stagger, pierce, blocked/glance

If an event cannot provide these fields yet, prefer adding the missing event data when
`T16` lands instead of guessing in render. Guessing impact direction creates confusing
feedback and violates the no-convenience-fallback rule for core readability.

Work to avoid while the other agent is active:

- changing `src/sim/**`
- changing weapon/damage APIs while `T14`/`T15` are in progress
- inventing upgrade/progression content before `T17`-`T20` data paths exist
- adding React UI surfaces unless the task is explicitly UI/menu work

## Done Criteria for Art Passes

- app remains browser-playable after every pass
- `pnpm test && pnpm build && pnpm lint` pass
- visible behavior gets a Playwright or screenshot check
- combat readability beats style in fixed camera
- no convenience fallbacks for WebGPU, materials, or core gameplay paths
- asset additions are pooled/atlased where repeated
