# Red Dot Rescue

A storm is coming and the kittens are still outside. You never control a character: you are the laser pointer. Kittens chase the red dot, and you lead a chaotic little crowd of them into the rescue basket before the rain hits.

Three.js, plain JavaScript, Vite. No other dependencies: the kittens, the levels and every sound are generated in code.

## Play it

**https://srotosshini.github.io/red-dot-rescue/**

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5180.

```bash
npm run build
```

The build goes to `dist/` with relative paths, so it works from any address, including inside an iframe. Every push to `main` builds and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).

## How to play

- **Mouse:** move to shine the dot. Right-drag (or middle-drag) tilts the view, the wheel zooms.
- **Touch:** drag one finger for the dot. Two fingers orbit and pinch.
- **Keyboard:** arrow keys or WASD move the dot (Shift is faster), Q and E turn the view, R resets it, Escape or P pauses.

Hold the dot on a box to call a kitten out. Wiggle it on a kitten to wake it or snap it out of staring at a butterfly. Hidden kittens meow louder as the dot gets closer, so play with sound on.

| Rescue | New idea |
|---|---|
| Backyard | the dot, the basket, a box, a hidden kitten, a nap |
| Rooftops in the rain | shy and chaotic kittens, puddles, planks, wind gusts, a pulley box across a gap |
| Kitchen at midnight | greedy kittens, a robot vacuum you can ride, a cup that opens the gate |
| Storm drain | darkness: the dot is the only light, eyes glint, boxes float down the channel |
| Shelter finale | every trait at once, and the yard floods |

Every rescue rolls brand-new kittens (coat, eyes, name, proportions, voice). Each one you bring home becomes a polaroid in the adoption album, saved in the browser.

## Where things are

```
src/main.js               boot, input, menus, the loop
src/game/game.js          one rescue: loading, storm clock, the dot, events, results
src/game/kitten.js        a kitten's brain: states, personalities, steering, animation
src/game/kitten-model.js  the procedural low-poly kitten, its skeleton and poses
src/game/genome.js        coats, eyes, names, traits, adoption-card lines
src/game/objects.js       boxes and rides, basket, food, vacuum, butterflies, cup and gate, flood
src/game/laser.js         the dot, its glow, stillness and wiggle
src/world/levels.js       the five layouts and how each is lit   <- edit levels here
src/world/level.js        layout -> nav grid + scenery
src/world/grid.js         the nav grid and the path field kittens follow
src/world/props.js        every piece of scenery as low-poly geometry
src/world/weather.js      storm light, rain, clouds, lightning, wind
src/render/stage.js       renderer, lights, bloom, tilt-shift, auto quality
src/render/camera.js      the diorama camera
src/audio/sound.js        synthesized meows, purring, rain, thunder, music
src/ui/                   menus, HUD, adoption cards, saving
```

Level layouts sit on a 0.25-unit grid, so what a kitten can walk on matches what you see. In development, `window.__rdr` exposes the game, camera and stage in the console.
