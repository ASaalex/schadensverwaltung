/**
 * AR-Projektion: bildet eine reale Welt-Richtung (Peilung + Höhenwinkel) auf
 * die Bildschirmposition im Kamerabild ab — über eine echte Lochkamera-
 * Projektion mit der vollen Geräteorientierung (Gier/Nick/Roll).
 *
 * Frames:
 *  - Erd-Frame (ENU): X = Ost, Y = Nord, Z = Oben.
 *  - Geräte-Frame:    X = rechts, Y = oben (Display), Z = aus dem Display.
 *  Die Rotationsmatrix Gerät→Erde stammt aus der W3C-DeviceOrientation-Spez
 *  (R = Rz(alpha)·Rx(beta)·Ry(gamma)). Die Rück-Kamera blickt entlang −Z.
 */

export type Vec3 = [number, number, number];

/** Basisvektoren des Geräts, ausgedrückt im Erd-Frame (ENU). */
export interface DeviceBasis {
  /** Geräte-X (rechte Kante) im Erd-Frame */
  right: Vec3;
  /** Geräte-Y (obere Kante) im Erd-Frame */
  up: Vec3;
  /** Geräte-Z (aus dem Display heraus) im Erd-Frame */
  out: Vec3;
}

const D2R = Math.PI / 180;

/**
 * Geräteorientierung (alpha/beta/gamma in Grad) → Basisvektoren im Erd-Frame.
 * alpha = Gier (um Z, 0 = Norden bei absoluter Orientierung),
 * beta  = Nicken (um X), gamma = Rollen (um Y).
 */
export function deviceBasisFromEuler(alphaDeg: number, betaDeg: number, gammaDeg: number): DeviceBasis {
  const a = alphaDeg * D2R;
  const b = betaDeg * D2R;
  const g = gammaDeg * D2R;

  const cZ = Math.cos(a), sZ = Math.sin(a);
  const cX = Math.cos(b), sX = Math.sin(b);
  const cY = Math.cos(g), sY = Math.sin(g);

  // Spalten der Rotationsmatrix R = Rz(a)·Rx(b)·Ry(g) = Geräte-Achsen im Erd-Frame
  const right: Vec3 = [
    cZ * cY - sZ * sX * sY,
    cY * sZ + cZ * sX * sY,
    -cX * sY,
  ];
  const up: Vec3 = [
    -cX * sZ,
    cX * cZ,
    sX,
  ];
  const out: Vec3 = [
    cY * sZ * sX + cZ * sY,
    sZ * sY - cZ * cY * sX,
    cX * cY,
  ];
  return { right, up, out };
}

/** Welt-Richtungsvektor (ENU, Einheitslänge) aus Peilung + Höhenwinkel. */
export function worldDirection(bearingDeg: number, elevationDeg: number): Vec3 {
  const br = bearingDeg * D2R;
  const el = elevationDeg * D2R;
  const ce = Math.cos(el);
  return [Math.sin(br) * ce, Math.cos(br) * ce, Math.sin(el)];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface Projected {
  /** sichtbar (vor der Kamera und innerhalb/nahe des Bildausschnitts) */
  onScreen: boolean;
  /** vor der Kamera (z > 0)? */
  inFront: boolean;
  /** Bildposition in Prozent (0..100), kann außerhalb [0,100] liegen */
  xPct: number;
  yPct: number;
  /** normalisierte Projektion (−1..1 = Bildkante); für Rand-Clamping */
  u: number;
  v: number;
}

/**
 * Projiziert eine Welt-Richtung auf die Bildschirmposition.
 * @param basis     Geräte-Basis im Erd-Frame
 * @param dir       Welt-Richtungsvektor (ENU)
 * @param hFovDeg   horizontales Sichtfeld des sichtbaren Bildes
 * @param vFovDeg   vertikales Sichtfeld des sichtbaren Bildes
 * @param screenAngleDeg  Bildschirm-Drehung (0/90/180/270) für Querformat
 */
export function projectDirection(
  basis: DeviceBasis,
  dir: Vec3,
  hFovDeg: number,
  vFovDeg: number,
  screenAngleDeg = 0,
): Projected {
  // Kamera-Basis (Rück-Kamera blickt entlang −Z des Geräts)
  const forward: Vec3 = [-basis.out[0], -basis.out[1], -basis.out[2]];
  const right = basis.right;
  const up = basis.up;

  const z = dot(dir, forward); // Tiefe (>0 = vor der Kamera)
  const x = dot(dir, right);
  const y = dot(dir, up);

  const inFront = z > 0.02;
  if (!inFront) {
    return { onScreen: false, inFront: false, xPct: 50, yPct: 50, u: 0, v: 0 };
  }

  const thx = Math.tan((hFovDeg * D2R) / 2);
  const thy = Math.tan((vFovDeg * D2R) / 2);
  let u = (x / z) / thx; // −1..1 an den Bildkanten
  let v = (y / z) / thy;

  // Bildschirm-Drehung berücksichtigen (Querformat). Portrait (0°) = identisch.
  if (screenAngleDeg) {
    const s = screenAngleDeg * D2R;
    const cs = Math.cos(s), sn = Math.sin(s);
    const ru = u * cs + v * sn;
    const rv = -u * sn + v * cs;
    u = ru; v = rv;
  }

  const xPct = 50 + 50 * u;
  const yPct = 50 - 50 * v;
  const onScreen = Math.abs(u) <= 1 && Math.abs(v) <= 1;
  return { onScreen, inFront, xPct, yPct, u, v };
}

/**
 * Effektives Sichtfeld des SICHTBAREN Bildes unter CSS `object-cover`.
 * Die Kamera liefert ein Bild mit (videoW × videoH); object-cover skaliert es,
 * bis der Container gefüllt ist, und schneidet den Überstand ab. Dadurch ist
 * das sichtbare FOV kleiner als das volle Sensor-FOV.
 *
 * @param baseHFovDeg  horizontales FOV des VOLLEN Kamerabildes (Kalibrierwert)
 */
export function effectiveFov(
  baseHFovDeg: number,
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number,
  extraZoom = 1,
): { hFov: number; vFov: number } {
  if (!videoW || !videoH || !containerW || !containerH) {
    // Fallback: vertikal aus 4:3 abschätzen
    const vFov0 = 2 * Math.atan(Math.tan((baseHFovDeg * D2R) / 2) * 0.75) / D2R;
    return { hFov: baseHFovDeg / extraZoom, vFov: vFov0 / extraZoom };
  }
  const thH0 = Math.tan((baseHFovDeg * D2R) / 2);
  const thV0 = thH0 * (videoH / videoW); // volles vertikales FOV (rectilinear)

  // object-cover: Skalierung, bis beide Dimensionen abgedeckt sind
  const scale = Math.max(containerW / videoW, containerH / videoH);
  const renderedW = videoW * scale;
  const renderedH = videoH * scale;
  const visFracX = containerW / renderedW; // sichtbarer Anteil horizontal
  const visFracY = containerH / renderedH;

  const hFov = (2 * Math.atan(thH0 * visFracX) / D2R) / extraZoom;
  const vFov = (2 * Math.atan(thV0 * visFracY) / D2R) / extraZoom;
  return { hFov, vFov };
}

/** Höhenwinkel (Grad) zu einem Bodenziel: negativ, da unterhalb der Augenhöhe. */
export function groundElevation(distM: number, eyeHeightM = 1.5): number {
  if (distM <= 0.1) return -90;
  return Math.atan2(-eyeHeightM, distM) / D2R;
}

/** Lineare Interpolation zweier Basis-Sätze (Glättung), inkl. Re-Normierung. */
export function lerpBasis(prev: DeviceBasis | null, next: DeviceBasis, t: number): DeviceBasis {
  if (!prev) return next;
  const mix = (a: Vec3, b: Vec3): Vec3 => norm([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
  return { right: mix(prev.right, next.right), up: mix(prev.up, next.up), out: mix(prev.out, next.out) };
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Peilung A→B in Grad (0 = Nord, im Uhrzeigersinn). */
export function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = lat1 * D2R, φ2 = lat2 * D2R;
  const Δλ = (lng2 - lng1) * D2R;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}

/**
 * Dreht eine Geräte-Basis um die Erd-Hochachse (Z) um `deg` im Uhrzeigersinn.
 * Wird genutzt, um einen manuellen Kompass-Offset auf die Projektion anzuwenden.
 */
export function rotateBasisAroundUp(basis: DeviceBasis, deg: number): DeviceBasis {
  if (!deg) return basis;
  const r = deg * D2R;
  const cs = Math.cos(r), sn = Math.sin(r);
  // (E, N) im Uhrzeigersinn drehen: E' = E·cos + N·sin, N' = −E·sin + N·cos
  const rot = (v: Vec3): Vec3 => [v[0] * cs + v[1] * sn, -v[0] * sn + v[1] * cs, v[2]];
  return { right: rot(basis.right), up: rot(basis.up), out: rot(basis.out) };
}

/** Kompass-Heading (0 = Nord, cw) aus der Geräte-Basis (Blickrichtung der Kamera). */
export function headingFromBasis(basis: DeviceBasis): number {
  // Kamera-Blickrichtung = −out; horizontale Projektion (Ost, Nord)
  const fE = -basis.out[0];
  const fN = -basis.out[1];
  return (Math.atan2(fE, fN) / D2R + 360) % 360;
}
