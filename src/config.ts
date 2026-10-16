// Values carried over from the Godot demo (ticket.md, "valores que costó encontrar").
// They are the reference the port is measured against; change them on purpose, not
// to make a number line up.
export const TUNING = {
  physicsHz: 120,
  axe: {
    baseMass: 1.4,
    bladeWeight: 1.0, // kg, the virtual weight hung on the edge
    weightAt: 1.0, // 0 = in the hand, 1 = on the edge
    gripHold: 0.8,
    wrist: 0.25,
    airSpinDrag: 0.06,
  },
  log: {
    splitEnergyTarget: 10.0, // J
    mass: 3.2, // kg
    carryMassCap: 5.0, // kg the axe "feels" when a log is stuck on it
  },
} as const;

// Three-quarter view on purpose: the axe tumbles in the YZ plane and the log splits
// along X, so from the diagonal you can read both.
export const CAMERA = {
  position: [2.9, 1.5, 3.2] as const,
  lookAt: [0.0, 1.0, 0.6] as const,
  fov: 52,
};

// Where the axe rests before the first grab (axe.gd keeps it as `_home`). Its local +Y,
// the handle, points along world +Z: the axe lies on the grass beside the stump.
export const AXE_HOME = {
  position: [0, 0.08, 1.9] as const,
  rotationX: Math.PI / 2,
};

// The Blender mesh is modelled ~11x too big and facing backwards; Godot fixes it with
// this transform on the Model node.
export const AXE_MODEL_SCALE = [-0.09, 0.09, -0.09] as const;

export const SUN = {
  position: [4.0, 6.5, 3.0] as const,
  intensity: 3.2,
};

// With a warm panorama driving all the ambient light, everything turned orange. The
// demo settled on 0.45.
export const AMBIENT_INTENSITY = 0.45;
