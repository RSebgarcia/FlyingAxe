// Valores portados de la demo de Godot (ticket.md, axe.gd, wood_log.gd, project.godot).
// Costaron encontrarlos: no tocarlos a ciegas. Cada uno dice de dónde sale.

/** project.godot :: physics_ticks_per_second */
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** project.godot :: default_gravity (9.8 de Godot, no 9.81). */
export const GRAVITY = 9.8;

/**
 * Godot aplica este amortiguamiento lineal por defecto a todo cuerpo (modo COMBINE).
 * El angular del hacha se REEMPLAZA por air_spin_drag.
 */
export const DEFAULT_LINEAR_DAMP = 0.1;
export const DEFAULT_ANGULAR_DAMP = 0.1;
/** Fricción por defecto de Godot/Box3D (1.0), sin rebote. */
export const DEFAULT_FRICTION = 1.0;

// --- escenario (Escenario.glb) ------------------------------------------------
/** Tocón: cilindro de 0.33 m de radio y 0.45 de alto, apoyado en y = 0. */
export const STUMP_RADIUS = 0.33;
export const STUMP_HEIGHT = 0.45;
/** El piso es una caja de 80 × 0.5 × 80 con la cara de arriba en y = 0. */
export const FLOOR_HALF = 40;
export const FLOOR_THICK = 0.5;

// --- hacha (axe.gd y main.tscn) -----------------------------------------------
/** Medidos sobre la malla real (escala 0.09, girada 180° en Y). Origen = agarre. */
export const COM_LOCAL = { x: 0, y: 0.72, z: -0.06 } as const;
export const EDGE_POINT = { x: 0, y: 0.792, z: -0.248 } as const;
/** Qué tan cerca del filo tiene que caer un contacto para contar como filo y no lomo. */
export const EDGE_RADIUS = 0.18;
/** Del culatín al tope de la cabeza; se usa para la inercia. */
export const AXE_LENGTH = 0.94;

/** Cajas de colisión del hacha: centro y medio-tamaño, en coordenadas del cuerpo. */
export const AXE_BOXES = [
  { name: 'mango', center: [0, 0.255, 0.01], half: [0.0325, 0.305, 0.0375] },
  { name: 'cabeza', center: [0, 0.75128907, -0.21852541], half: [0.0425, 0.13871095, 0.04147461] },
  { name: 'lomo', center: [0, 0.718, -0.034], half: [0.0425, 0.168, 0.144] },
] as const;

/**
 * Pose de reposo del hacha (main.tscn): acostada en el pasto, con el mango (+Y local)
 * hacia +Z, es decir girada +90° sobre X, y el agarre en (0, 0.08, 1.9).
 */
export const AXE_HOME_POS = { x: 0, y: 0.08, z: 1.9 } as const;
export const AXE_HOME_ANGLE_X = Math.PI / 2;

/** Ventana de velocidades para medir el golpe con la velocidad de ENTRADA. */
export const VELOCITY_HISTORY = 3;
/** Un contacto cada tanto alcanza: sin esto, apoyarla llenaba el log de "suave". */
export const CONTACT_COOLDOWN = 0.25;

// --- juego (game.gd) ------------------------------------------------------------
/** Segundos hasta reponer leño después de partir. */
export const RESPAWN_DELAY = 2.2;
/** Si el hacha cae por debajo de esto, vuelve sola. */
export const FALL_LIMIT_Y = -6;
