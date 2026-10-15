# `src/gameplay`: el núcleo jugable

Port del Flying Axe de Godot 4.7 + Box3D a Rapier. Física, reglas y bancos de prueba;
nada de luces, cielo, partículas ni sonido.

| archivo | qué es | viene de |
|---|---|---|
| `constants.ts` | valores afinados (120 Hz, 9.8, cajas del hacha, tocón) | `project.godot`, `main.tscn`, `Escenario.glb` |
| `axe.ts` | el hacha: pesa ficticia, agarre tipo péndulo, plano x = 0, medición del golpe | `axe.gd` |
| `woodLog.ts` | el leño: sorteo, especie, umbral, clavarse, partirse, escombros | `wood_log.gd` |
| `prism.ts` | mallas de la leña y sus mitades, con UV en metros y dos materiales | `prism.gd` |
| `sim.ts` | el juego sin render: mundo de Rapier, paso fijo, ruteo de golpes, puntaje | `game.gd` |
| `knobs.ts` | perillas guardadas en `localStorage` | `settings.gd` |
| `input.ts` | teclas de las perillas (el puntero es `src/input/pointer.ts`) | `game.gd` |
| `view.ts` | dibuja la leña y mueve el modelo del hacha según la física | — |

## Cómo se conecta

`src/main.ts` arma el `GameSim` con su propio mundo de Rapier (piso, tocón, hacha y leña),
le pasa a `GameplayView` el hacha y la leña que construye `game/world.ts`, y conecta el
`Pointer` de `src/input` con `sim.grab`, `sim.setPointer` y `sim.release`. En cada frame:
`sim.update(dt)` corre los pasos fijos de 1/120 s y `view.sync()` mueve la escena.

## Ganchos para los otros pasos

`sim.on(evento, fn)` con `hit`, `cut`, `lodge`, `bounce`, `slam`, `grab`, `release`,
`newLog` y `score`. Cada evento trae el punto, la normal y la fuerza relativa al umbral,
que es lo que usaban `juice.gd` y `sfx.gd`. La cámara lenta es `sim.timeScale`.

El táctil (paso 4) vive en `src/input/pointer.ts`; el juego solo necesita
`sim.grab(punto)`, `sim.setPointer(punto)` y `sim.release()`.

## Diferencias con Godot, a propósito

- **Giro bloqueado con los ejes de Rapier** (solo sobre X). La traslación en X se sigue
  corrigiendo a mano con zona muerta, como en Godot: bloquear las dos cosas a la vez en
  Rapier 0.21 apaga la fricción y el hacha patinaba para siempre en el pasto.
- **Masa efectiva solo con el giro sobre X.** Godot usaba el tensor entero, y un contacto
  corrido del plano (el borde de la leña al cascarla) se llevaba el término de Y, que es
  chico, y desplomaba la cuenta: el cascazo medía 1.7 J donde el solver frenaba 7.4 kg.
- **Punto de contacto = centro de presión** del manifold, no el primer punto.
- **Contactos predictivos:** Rapier frena el golpe antes de que las formas se toquen, así
  que cuenta un contacto separado si el solver le aplicó impulso.
- **Reponer el hacha reinicia la espera entre golpes.** Antes el primer golpe después de
  reponerla podía caer dentro de los 0.25 s del anterior y perderse.
- **Tiempo de simulación** para la espera entre golpes y la gracia al despegar, no reloj
  de pared: igual en cualquier máquina y con cámara lenta.

## Bancos de prueba

`tests/unit/gameplay/bench.ts` porta `autoplay.gd`, `slam_test.gd` y `tap_test.gd`. Corren en
Vitest, sin navegador, y son deterministas.
