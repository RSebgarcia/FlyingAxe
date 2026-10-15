# `src/fx`: efectos, clima, imagen final y HUD

Port de `juice.gd`, `sfx.gd`, `ambience.gd` y la parte de interfaz de `game.gd`. Nada de
esto toca la física: escucha eventos y, como única devolución, le pasa a la sim la escala
de tiempo de la cámara lenta.

| archivo | qué es | viene de |
|---|---|---|
| `index.ts` | `installFx()`: arma todo y escucha `C`, `Shift+C` y `F1` | `game.gd` |
| `connect.ts` | `connectSim()`: eventos de `GameSim` (paso 2) → bus, textos de ayuda, `timeScale` | `game.gd` |
| `juice.ts` | astillas + polvo, cámara lenta, sacudón, sonido del golpe | `juice.gd` |
| `chips.ts`, `hitstop.ts`, `shake.ts` | las tres piezas de arriba, sueltas y testeables | `juice.gd` |
| `audio.ts` | Web Audio: crujidos grabados sin repetir, rebote y clavada sintetizados, tono según fuerza | `sfx.gd` |
| `climas.ts` | la tabla de los diez climas, tal cual | `ambience.gd` |
| `weather.ts` | cielo, sol, niebla exponencial, relámpagos, rotación cada 3 leños | `ambience.gd` |
| `precip.ts` | lluvia y nieve que siguen a la cámara, arrancan llenas | `ambience.gd` |
| `post.ts` | ACES, bloom, GTAO, contraste y saturación | `ambience.gd :: _calidad` |
| `../ui/tuner.ts` | perillas con F1, y el cableado del HUD del scaffold a los eventos | `game.gd` |
| `../events.ts` | el bus tipado que conecta todo | — |

## Cómo se usa

Ya está cableado en `src/main.ts`:

```ts
const fx = installFx({
  renderer, scene: world.scene, camera: world.camera,
  loadSky: (name) => assets.sky(name),           // KTX2 del scaffold
  crackUrls: [/* public/assets/sfx/split_0N.wav */],
  hud, hudRoot: document.getElementById('hud')!, // cortes, ayuda y especie van al HUD del scaffold
  dome: world.sky, sun: world.sun,               // el clima maneja el domo y el sol que ya existen
  quality: () => flyingAxe.quality?.current,     // paso 4: partículas y post según el nivel
});

renderer.setAnimationLoop(() => {
  fx.update(dt);                       // dt real: el sacudón y la cámara lenta miden tiempo real
  physics.timeScale = fx.timeScale;    // la cámara lenta del corte
  physics.update(dt);
  fx.render();                         // en vez de renderer.render(scene, camera)
});
```

Cuando entre la simulación del paso 2: `const link = connectSim(sim, fx)` y `link.tick()`
una vez por frame. Con eso llegan los golpes, los textos de ayuda, la especie y las perillas.

## Diferencias con Godot

- **La cámara lenta y el sacudón del corte andan.** En `juice.gd` quedaron después de un
  `return` y nunca se ejecutaban; acá van como dice el ticket (0.35 por 160 ms reales).
- **Son diez climas, no nueve**: la tormenta se sumó después y el ticket no actualizó la cuenta.
- **Sin niebla volumétrica (rayos de sol).** En la demo está al 35 % porque en el campo
  pelado no hay nada que tape la luz. Cuando entre el bosque, `GodraysNode` de three.
- **La niebla no tiñe el cielo** (`fog_sky_affect` de Godot). Se nota poco con la niebla
  baja; si molesta, se puede bajar `backgroundIntensity` según la densidad.
- **Trueno**: el relámpago emite `thunder` igual que antes, pero no hay audio todavía.
