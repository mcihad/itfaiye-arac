"use client"

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { COMPARTMENT_NAMES } from "@/lib/constants"
import { 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Play, 
  Pause,
  Activity
} from "lucide-react"

export interface ThreeSceneProps {
  compartmentKeys: string[];
  activeCompartment: string | null;
  onSelect: (key: string) => void;
  vehicleType?: string;
  className?: string;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
  zDepth: number;
}

export interface HatchNode {
  key: string;
  label: string;
  x: number;
  y: number;
  z: number;
  side: "left" | "right" | "top" | "center";
}

export interface SolidFace {
  indices: number[];
  baseColor: [number, number, number];
  type: 'cab' | 'body' | 'bumper' | 'siren' | 'ladder' | 'line';
  outlineColor?: string;
  lineWidth?: number;
}

export interface HitboxPolygon {
  key: string;
  points: { x: number; y: number }[];
  zDepth: number;
}

interface CameraTarget {
  yaw: number;
  pitch: number;
  zoom: number;
}

interface DrawItem {
  zDepth: number;
  draw: () => void;
}

// === 3D MODEL VERTICES ===
const CAB_VERTICES: Point3D[] = [
  { x: 80, y: -18, z: -27 }, // 0: cab front bottom left
  { x: 80, y: -18, z: 27 },  // 1: cab front bottom right
  { x: 78, y: 3, z: -27 },   // 2: cab hood front left
  { x: 78, y: 3, z: 27 },    // 3: cab hood front right
  { x: 60, y: 22, z: -27 },  // 4: cab roof front left
  { x: 60, y: 22, z: 27 },   // 5: cab roof front right
  { x: 38, y: 22, z: -27 },  // 6: cab roof back left
  { x: 38, y: 22, z: 27 },   // 7: cab roof back right
  { x: 38, y: -18, z: -27 }, // 8: cab bottom back left
  { x: 38, y: -18, z: 27 },  // 9: cab bottom back right
];

const BODY_VERTICES: Point3D[] = [
  { x: 36, y: 24, z: -28 },  // 10: body front top left
  { x: 36, y: 24, z: 28 },   // 11: body front top right
  { x: 36, y: -18, z: -28 }, // 12: body front bottom left
  { x: 36, y: -18, z: 28 },  // 13: body front bottom right
  { x: -80, y: 24, z: -28 }, // 14: body rear top left
  { x: -80, y: 24, z: 28 },  // 15: body rear top right
  { x: -80, y: -18, z: -28 },// 16: body rear bottom left
  { x: -80, y: -18, z: 28 }, // 17: body rear bottom right
];

const LADDER_VERTICES: Point3D[] = [
  { x: 25, y: 29, z: -7 },   // 18: ladder front left
  { x: 25, y: 29, z: 7 },    // 19: ladder front right
  { x: -75, y: 29, z: -7 },  // 20: ladder rear left
  { x: -75, y: 29, z: 7 },   // 21: ladder rear right
];

const BUMPER_VERTICES: Point3D[] = [
  { x: 86, y: -12, z: -25 }, // 22: bumper top left
  { x: 86, y: -12, z: 25 },  // 23: bumper top right
  { x: 86, y: -18, z: -25 }, // 24: bumper bottom left
  { x: 86, y: -18, z: 25 },  // 25: bumper bottom right
];

const SIREN_VERTICES: Point3D[] = [
  { x: 55, y: 26, z: -15 },  // 26: siren left front top
  { x: 45, y: 26, z: -15 },  // 27: siren left back top
  { x: 55, y: 23, z: -18 },  // 28: siren left base front
  { x: 45, y: 23, z: -18 },  // 29: siren left base back
  { x: 55, y: 26, z: 15 },   // 30: siren right front top
  { x: 45, y: 26, z: 15 },   // 31: siren right back top
  { x: 55, y: 23, z: 18 },   // 32: siren right base front
  { x: 45, y: 23, z: 18 },   // 33: siren right base back
];

const ARMOR_VERTICES: Point3D[] = [
  // Body side armor plates
  { x: 30, y: 16, z: -28.1 },  // 34: Left armor front top
  { x: -75, y: 16, z: -28.1 }, // 35: Left armor rear top
  { x: -75, y: -10, z: -28.1 },// 36: Left armor rear bottom
  { x: 30, y: -10, z: -28.1 }, // 37: Left armor front bottom
  
  { x: 30, y: 16, z: 28.1 },   // 38: Right armor front top
  { x: -75, y: 16, z: 28.1 },  // 39: Right armor rear top
  { x: -75, y: -10, z: 28.1 }, // 40: Right armor rear bottom
  { x: 30, y: -10, z: 28.1 },  // 41: Right armor front bottom

  // Cab door armor plates
  { x: 56, y: 14, z: -27.1 },  // 42: Left cab front top
  { x: 40, y: 14, z: -27.1 },  // 43: Left cab rear top
  { x: 40, y: -8,  z: -27.1 }, // 44: Left cab rear bottom
  { x: 56, y: -8,  z: -27.1 }, // 45: Left cab front bottom

  { x: 56, y: 14, z: 27.1 },   // 46: Right cab front top
  { x: 40, y: 14, z: 27.1 },   // 47: Right cab rear top
  { x: 40, y: -8,  z: 27.1 },  // 48: Right cab rear bottom
  { x: 56, y: -8,  z: 27.1 },  // 49: Right cab front bottom
];

const VERTICES: Point3D[] = [
  ...CAB_VERTICES,
  ...BODY_VERTICES,
  ...LADDER_VERTICES,
  ...BUMPER_VERTICES,
  ...SIREN_VERTICES,
  ...ARMOR_VERTICES,
];

// === SOLID 3D FACES & WIREFRAME LINES ===
const SOLID_FACES: SolidFace[] = [
  // --- CAB FACES ---
  { indices: [0, 1, 3, 2], baseColor: [30, 41, 59], type: 'cab' }, // front hood
  { indices: [2, 3, 5, 4], baseColor: [15, 76, 129], type: 'cab', outlineColor: 'rgba(34, 211, 238, 0.45)' }, // windshield (glowing blue-cyan tint)
  { indices: [4, 5, 7, 6], baseColor: [15, 23, 42], type: 'cab' }, // roof
  { indices: [6, 7, 9, 8], baseColor: [15, 23, 42], type: 'cab' }, // back wall
  { indices: [0, 8, 9, 1], baseColor: [8, 12, 20], type: 'cab' },   // bottom
  { indices: [0, 2, 4, 6, 8], baseColor: [20, 30, 48], type: 'cab' }, // left wall
  { indices: [1, 3, 5, 7, 9], baseColor: [20, 30, 48], type: 'cab' }, // right wall

  // --- CAB ARMOR PLATES ---
  { indices: [42, 43, 44, 45], baseColor: [32, 45, 75], type: 'cab', outlineColor: 'rgba(34, 211, 238, 0.55)' }, // left cab armor plate
  { indices: [46, 47, 48, 49], baseColor: [32, 45, 75], type: 'cab', outlineColor: 'rgba(34, 211, 238, 0.55)' }, // right cab armor plate

  // --- BODY FACES ---
  { indices: [10, 11, 13, 12], baseColor: [15, 23, 42], type: 'body' }, // front wall
  { indices: [14, 15, 17, 16], baseColor: [20, 30, 48], type: 'body', outlineColor: 'rgba(6, 182, 212, 0.3)' }, // rear wall
  { indices: [10, 11, 15, 14], baseColor: [12, 18, 30], type: 'body' }, // top deck
  { indices: [12, 13, 17, 16], baseColor: [8, 12, 22], type: 'body' },  // bottom frame
  { indices: [10, 14, 16, 12], baseColor: [16, 26, 44], type: 'body' }, // left side
  { indices: [11, 15, 17, 13], baseColor: [16, 26, 44], type: 'body' }, // right side

  // --- BODY ARMOR PLATES ---
  { indices: [34, 35, 36, 37], baseColor: [30, 48, 80], type: 'body', outlineColor: 'rgba(34, 211, 238, 0.55)' }, // left side armor plate
  { indices: [38, 39, 40, 41], baseColor: [30, 48, 80], type: 'body', outlineColor: 'rgba(34, 211, 238, 0.55)' }, // right side armor plate

  // --- BUMPER ---
  { indices: [22, 23, 25, 24], baseColor: [71, 85, 105], type: 'bumper' }, // bumper front face

  // --- SIRENS ---
  { indices: [26, 27, 29, 28], baseColor: [220, 38, 38], type: 'siren', outlineColor: 'rgba(239, 68, 68, 0.5)' }, // left red siren
  { indices: [30, 31, 33, 32], baseColor: [37, 99, 235], type: 'siren', outlineColor: 'rgba(59, 130, 246, 0.5)' }, // right blue siren

  // --- LADDER RAILS (rendered as lines) ---
  { indices: [18, 20], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.5)', lineWidth: 1.5 },
  { indices: [19, 21], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.5)', lineWidth: 1.5 },
  { indices: [18, 19], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.4)' },
  { indices: [20, 21], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.4)' },

  // --- BUMPER MOUNTS (rendered as lines) ---
  { indices: [0, 24], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.4)' },
  { indices: [1, 25], baseColor: [6, 182, 212], type: 'line', outlineColor: 'rgba(6, 182, 212, 0.4)' },
];

// === COMPARTMENT HITBOX POLYGONS IN 3D SPACE ===
const COMPARTMENT_PANELS: Record<string, Point3D[]> = {
  sol_on_kapak: [
    { x: 30, y: -12, z: -28.2 },
    { x: 5, y: -12, z: -28.2 },
    { x: 5, y: 15, z: -28.2 },
    { x: 30, y: 15, z: -28.2 }
  ],
  sol_orta_kapak: [
    { x: -2, y: -12, z: -28.2 },
    { x: -27, y: -12, z: -28.2 },
    { x: -27, y: 15, z: -28.2 },
    { x: -2, y: 15, z: -28.2 }
  ],
  sol_arka_kapak: [
    { x: -35, y: -12, z: -28.2 },
    { x: -75, y: -12, z: -28.2 },
    { x: -75, y: 15, z: -28.2 },
    { x: -35, y: 15, z: -28.2 }
  ],
  sag_on_kapak: [
    { x: 30, y: -12, z: 28.2 },
    { x: 5, y: -12, z: 28.2 },
    { x: 5, y: 15, z: 28.2 },
    { x: 30, y: 15, z: 28.2 }
  ],
  sag_orta_kapak: [
    { x: -2, y: -12, z: 28.2 },
    { x: -27, y: -12, z: 28.2 },
    { x: -27, y: 15, z: 28.2 },
    { x: -2, y: 15, z: 28.2 }
  ],
  sag_arka_kapak: [
    { x: -35, y: -12, z: 28.2 },
    { x: -75, y: -12, z: 28.2 },
    { x: -75, y: 15, z: 28.2 },
    { x: -35, y: 15, z: 28.2 }
  ],
  kabin_ici: [
    { x: 72, y: -10, z: -27.2 },
    { x: 42, y: -10, z: -27.2 },
    { x: 42, y: 18, z: -27.2 },
    { x: 58, y: 18, z: -27.2 }
  ],
  arac_ustu: [
    { x: 30, y: 22.2, z: -20 },
    { x: -70, y: 22.2, z: -20 },
    { x: -70, y: 22.2, z: 20 },
    { x: 30, y: 22.2, z: 20 }
  ],
  arac_ici: [
    { x: 25, y: -8, z: 0 },
    { x: -25, y: -8, z: 0 },
    { x: -25, y: 10, z: 0 },
    { x: 25, y: 10, z: 0 }
  ],
  arka_bolme: [
    { x: -80.2, y: -12, z: -22 },
    { x: -80.2, y: 14, z: -22 },
    { x: -80.2, y: 14, z: 22 },
    { x: -80.2, y: -12, z: 22 }
  ],
  arka_kapak: [
    { x: -80.4, y: -8, z: -16 },
    { x: -80.4, y: 10, z: -16 },
    { x: -80.4, y: 10, z: 16 },
    { x: -80.4, y: -8, z: 16 }
  ],
  sol_dolap: [
    { x: 30, y: -12, z: -28.2 },
    { x: -75, y: -12, z: -28.2 },
    { x: -75, y: 15, z: -28.2 },
    { x: 30, y: 15, z: -28.2 }
  ],
  sag_dolap: [
    { x: 30, y: -12, z: 28.2 },
    { x: -75, y: -12, z: 28.2 },
    { x: -75, y: 15, z: 28.2 },
    { x: 30, y: 15, z: 28.2 }
  ],
  bagaj_ici: [
    { x: -80.3, y: -10, z: -20 },
    { x: -80.3, y: 12, z: -20 },
    { x: -80.3, y: 12, z: 20 },
    { x: -80.3, y: -10, z: 20 }
  ],
  kasa_ici: [
    { x: 25, y: -8, z: 0 },
    { x: -25, y: -8, z: 0 },
    { x: -25, y: 10, z: 0 },
    { x: 25, y: 10, z: 0 }
  ]
};

// === HOTSPOT CENTERS (mainly for floating labels and leader lines) ===
const HOTSPOT_3D: Record<string, HatchNode> = {
  kabin_ici:      { key: "kabin_ici",      x: 57,  y: 4,   z: -27.2, label: "Kabin İçi",   side: "center" },
  arac_ici:       { key: "arac_ici",       x: 0,   y: 0,   z: 0,     label: "Araç İçi",    side: "center" },
  sol_on_kapak:   { key: "sol_on_kapak",   x: 17.5,y: 1.5, z: -28.2, label: "Sol Ön",      side: "left" },
  sol_orta_kapak: { key: "sol_orta_kapak", x: -14.5,y: 1.5,z: -28.2, label: "Sol Orta",    side: "left" },
  sol_arka_kapak: { key: "sol_arka_kapak", x: -55, y: 1.5, z: -28.2, label: "Sol Arka",    side: "left" },
  sag_on_kapak:   { key: "sag_on_kapak",   x: 17.5,y: 1.5, z: 28.2,  label: "Sağ Ön",      side: "right" },
  sag_orta_kapak: { key: "sag_orta_kapak", x: -14.5,y: 1.5,z: 28.2,  label: "Sağ Orta",    side: "right" },
  sag_arka_kapak: { key: "sag_arka_kapak", x: -55, y: 1.5, z: 28.2,  label: "Sağ Arka",    side: "right" },
  arac_ustu:      { key: "arac_ustu",      x: -20, y: 22.5, z: 0,    label: "Araç Üstü",   side: "top" },
  arka_bolme:     { key: "arka_bolme",     x: -80, y: 1,   z: 0,     label: "Arka Bölme",  side: "center" },
  arka_kapak:     { key: "arka_kapak",     x: -80.2,y: 1,   z: 0,     label: "Arka Kapak",  side: "center" },
  sol_dolap:      { key: "sol_dolap",      x: -22.5,y: 1.5, z: -28.2, label: "Sol Dolap",   side: "left" },
  sag_dolap:      { key: "sag_dolap",      x: -22.5,y: 1.5, z: 28.2,  label: "Sağ Dolap",   side: "right" },
  bagaj_ici:      { key: "bagaj_ici",      x: -80.1,y: 1,   z: 0,     label: "Bagaj İçi",   side: "center" },
  kasa_ici:       { key: "kasa_ici",       x: 0,   y: 1,   z: 0,     label: "Kasa İçi",    side: "center" },
};

// === CAMERA FOCUS TARGETS FOR EACH COMPARTMENT ===
const COMPARTMENT_CAMERA_TARGETS: Record<string, CameraTarget> = {
  sol_on_kapak:   { yaw: -Math.PI / 2, pitch: 0.05, zoom: 120 },
  sol_orta_kapak: { yaw: -Math.PI / 2, pitch: 0.05, zoom: 120 },
  sol_arka_kapak: { yaw: -Math.PI / 2, pitch: 0.05, zoom: 120 },
  sag_on_kapak:   { yaw: Math.PI / 2,  pitch: 0.05, zoom: 120 },
  sag_orta_kapak: { yaw: Math.PI / 2,  pitch: 0.05, zoom: 120 },
  sag_arka_kapak: { yaw: Math.PI / 2,  pitch: 0.05, zoom: 120 },
  kabin_ici:      { yaw: -Math.PI / 5, pitch: 0.22, zoom: 130 },
  arac_ici:       { yaw: -Math.PI / 4, pitch: 0.35, zoom: 115 },
  arac_ustu:      { yaw: 0,            pitch: Math.PI / 3, zoom: 130 },
  arka_bolme:     { yaw: -Math.PI,     pitch: 0.1,  zoom: 125 },
  arka_kapak:     { yaw: -Math.PI,     pitch: 0.1,  zoom: 125 },
  sol_dolap:      { yaw: -Math.PI / 2, pitch: 0.05, zoom: 120 },
  sag_dolap:      { yaw: Math.PI / 2,  pitch: 0.05, zoom: 120 },
  bagaj_ici:      { yaw: -Math.PI,     pitch: 0.1,  zoom: 125 },
  kasa_ici:       { yaw: -Math.PI / 4, pitch: 0.35, zoom: 115 },
};

// === Point-in-Polygon (Ray-casting Algorithm) ===
function isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > py) !== (yj > py))
        && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// === 3D TO 2D PERSPECTIVE PROJECTION ===
function project(
  p: Point3D,
  yaw: number,
  pitch: number,
  zoom: number,
  width: number,
  height: number
): Point2D {
  // Rotate around Y-axis (Yaw)
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = p.x * cosY - p.z * sinY;
  const z1 = p.x * sinY + p.z * cosY;

  // Rotate around X-axis (Pitch)
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = p.y * cosP - z1 * sinP;
  const z2 = p.y * sinP + z1 * cosP;

  // Camera settings
  const distance = 210;
  const fov = 350;
  const scale = fov / (distance + z2);

  const cx = width / 2;
  const cy = height / 2;

  // Apply zoom scaling
  const projX = cx + x1 * scale * (zoom / 100);
  const projY = cy - y2 * scale * (zoom / 100);

  return { x: projX, y: projY, zDepth: z2 };
}

// === ROTATE 3D POINT ONLY (for Z-sorting math) ===
function rotatePoint(p: Point3D, yaw: number, pitch: number): Point3D {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = p.x * cosY - p.z * sinY;
  const z1 = p.x * sinY + p.z * cosY;

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y2 = p.y * cosP - z1 * sinP;
  const z2 = p.y * sinP + z1 * cosP;

  return { x: x1, y: y2, z: z2 };
}

// === HELPER DRAWING FUNCTIONS ===
function drawWheel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  centerZ: number,
  yaw: number,
  pitch: number,
  zoom: number,
  w: number,
  h: number
) {
  const radius = 9.5;
  const segments = 12;
  const outerPoints: Point3D[] = [];
  const innerPoints: Point3D[] = [];
  const thickness = centerZ > 0 ? -4.5 : 4.5;
  
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    outerPoints.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      z: centerZ
    });
    innerPoints.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      z: centerZ + thickness
    });
  }

  const projOuter = outerPoints.map(p => project(p, yaw, pitch, zoom, w, h));
  const projInner = innerPoints.map(p => project(p, yaw, pitch, zoom, w, h));

  // 1. Draw solid connector faces (tire tread)
  ctx.fillStyle = "rgb(12, 16, 26)";
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    ctx.beginPath();
    ctx.moveTo(projOuter[i].x, projOuter[i].y);
    ctx.lineTo(projOuter[next].x, projOuter[next].y);
    ctx.lineTo(projInner[next].x, projInner[next].y);
    ctx.lineTo(projInner[i].x, projInner[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // 2. Draw outer face
  ctx.fillStyle = "rgb(20, 28, 44)";
  ctx.beginPath();
  ctx.moveTo(projOuter[0].x, projOuter[0].y);
  for (let i = 1; i < segments; i++) {
    ctx.lineTo(projOuter[i].x, projOuter[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Draw inner face
  ctx.fillStyle = "rgb(10, 15, 24)";
  ctx.beginPath();
  ctx.moveTo(projInner[0].x, projInner[0].y);
  for (let i = 1; i < segments; i++) {
    ctx.lineTo(projInner[i].x, projInner[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawLadderRungs(
  ctx: CanvasRenderingContext2D,
  yaw: number,
  pitch: number,
  zoom: number,
  w: number,
  h: number
) {
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const leftP = {
      x: 25 * (1 - t) + -75 * t,
      y: 29,
      z: -7
    };
    const rightP = {
      x: 25 * (1 - t) + -75 * t,
      y: 29,
      z: 7
    };

    const projL = project(leftP, yaw, pitch, zoom, w, h);
    const projR = project(rightP, yaw, pitch, zoom, w, h);

    ctx.beginPath();
    ctx.moveTo(projL.x, projL.y);
    ctx.lineTo(projR.x, projR.y);
    ctx.stroke();
  }
}

function drawWaterCannon(
  ctx: CanvasRenderingContext2D,
  yaw: number,
  pitch: number,
  zoom: number,
  w: number,
  h: number
) {
  const base = { x: 28, y: 24, z: 0 };
  const neck = { x: 28, y: 27, z: 0 };
  const nozzle = { x: 36, y: 28, z: 0 };

  const projBase = project(base, yaw, pitch, zoom, w, h);
  const projNeck = project(neck, yaw, pitch, zoom, w, h);
  const projNozzle = project(nozzle, yaw, pitch, zoom, w, h);

  ctx.beginPath();
  ctx.moveTo(projBase.x, projBase.y);
  ctx.lineTo(projNeck.x, projNeck.y);
  ctx.lineTo(projNozzle.x, projNozzle.y);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1; // restore
}

function drawHeadlightBeams(
  ctx: CanvasRenderingContext2D,
  yaw: number,
  pitch: number,
  zoom: number,
  w: number,
  h: number
) {
  const leftHeadlight = { x: 80, y: -8, z: -20 };
  const rightHeadlight = { x: 80, y: -8, z: 20 };

  const leftBeamEnd = { x: 125, y: -12, z: -35 };
  const rightBeamEnd = { x: 125, y: -12, z: 35 };

  const projLStart = project(leftHeadlight, yaw, pitch, zoom, w, h);
  const projLEnd = project(leftBeamEnd, yaw, pitch, zoom, w, h);

  const projRStart = project(rightHeadlight, yaw, pitch, zoom, w, h);
  const projREnd = project(rightBeamEnd, yaw, pitch, zoom, w, h);

  // Light cones
  ctx.fillStyle = "rgba(250, 204, 21, 0.05)";
  
  ctx.beginPath();
  ctx.moveTo(projLStart.x, projLStart.y);
  ctx.lineTo(projLEnd.x, projLEnd.y - 14);
  ctx.lineTo(projLEnd.x, projLEnd.y + 14);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(projRStart.x, projRStart.y);
  ctx.lineTo(projREnd.x, projREnd.y - 14);
  ctx.lineTo(projREnd.x, projREnd.y + 14);
  ctx.closePath();
  ctx.fill();

  // Headlight flares
  ctx.fillStyle = "rgba(250, 204, 21, 0.9)";
  ctx.beginPath();
  ctx.arc(projLStart.x, projLStart.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(projRStart.x, projRStart.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

// === COMPONENT ===
export function Vehicle3DSchematic({
  compartmentKeys,
  activeCompartment,
  onSelect,
  vehicleType,
  className
}: ThreeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI Control states
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hudActive, setHudActive] = useState<boolean>(true);

  // Rotation, pitch and zoom states in refs to maintain 60fps draw loops
  const yawRef = useRef<number>(-Math.PI / 4);
  const pitchRef = useRef<number>(0.25);
  const zoomRef = useRef<number>(100);

  const targetYawRef = useRef<number>(-Math.PI / 4);
  const targetPitchRef = useRef<number>(0.25);
  const targetZoomRef = useRef<number>(100);

  // Drag states
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartYawRef = useRef<number>(-Math.PI / 4);
  const dragStartPitchRef = useRef<number>(0.25);
  const isDragClickRef = useRef<boolean>(true);
  
  const lastInteractionRef = useRef<number>(0);
  
  // Hitbox polygon coordinates (populated dynamically during render loop)
  const projectedPanelsRef = useRef<HitboxPolygon[]>([]);

  // Orbit transition LERP target locking on active compartment change
  useEffect(() => {
    if (activeCompartment && COMPARTMENT_CAMERA_TARGETS[activeCompartment]) {
      const target = COMPARTMENT_CAMERA_TARGETS[activeCompartment];
      targetYawRef.current = target.yaw;
      targetPitchRef.current = target.pitch;
      targetZoomRef.current = target.zoom;
      lastInteractionRef.current = 0; // lock immediately
    }
  }, [activeCompartment]);

  // Unified Mouse & Touch coordinate helper
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement> | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e && e.touches && e.touches.length > 0) {
      const touchList = e.touches as unknown as TouchList;
      const touch = touchList[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else if ('changedTouches' in e && e.changedTouches && e.changedTouches.length > 0) {
      const touchList = e.changedTouches as unknown as TouchList;
      const touch = touchList[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      };
    } else {
      const mouseEvent = e as MouseEvent | React.MouseEvent<HTMLCanvasElement>;
      return {
        x: mouseEvent.clientX - rect.left,
        y: mouseEvent.clientY - rect.top
      };
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('button' in e && e.button !== 0) return;
    
    isDraggingRef.current = true;
    isDragClickRef.current = true;
    const pos = getMousePos(e);
    dragStartRef.current = pos;
    dragStartYawRef.current = yawRef.current;
    dragStartPitchRef.current = pitchRef.current;
    lastInteractionRef.current = Date.now();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    
    if (isDraggingRef.current) {
      const dx = pos.x - dragStartRef.current.x;
      const dy = pos.y - dragStartRef.current.y;
      
      // Increased drag sensitivity (0.011)
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragClickRef.current = false;
      }
      
      targetYawRef.current = dragStartYawRef.current + dx * 0.011;
      targetPitchRef.current = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, dragStartPitchRef.current - dy * 0.011));
      lastInteractionRef.current = Date.now();
    } else {
      // Ray-cast Hitbox Check
      let foundHover: string | null = null;
      const hits: { key: string; zDepth: number }[] = [];
      
      projectedPanelsRef.current.forEach(panel => {
        if (isPointInPolygon(pos.x, pos.y, panel.points)) {
          hits.push({ key: panel.key, zDepth: panel.zDepth });
        }
      });
      
      if (hits.length > 0) {
        // Sort by Z-depth to target the closest panel (Raycast hit)
        hits.sort((a, b) => a.zDepth - b.zDepth);
        foundHover = hits[0].key;
      }
      
      if (foundHover !== hoveredKey) {
        setHoveredKey(foundHover);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    if (isDragClickRef.current) {
      const pos = getMousePos(e);
      const hits: { key: string; zDepth: number }[] = [];
      
      projectedPanelsRef.current.forEach(panel => {
        if (isPointInPolygon(pos.x, pos.y, panel.points)) {
          hits.push({ key: panel.key, zDepth: panel.zDepth });
        }
      });
      
      if (hits.length > 0) {
        hits.sort((a, b) => a.zDepth - b.zDepth);
        const clickedKey = hits[0].key;
        if (compartmentKeys.includes(clickedKey)) {
          onSelect(clickedKey);
        }
      }
    }
    lastInteractionRef.current = Date.now();
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredKey(null);
  };

  // Main 60fps render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const w = 800;
      const h = 450;
      
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);

      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteractionRef.current;

      // Inactivity Auto-orbit and lock transitions
      if (timeSinceLastInteraction > 3000 && autoRotate) {
        if (activeCompartment && COMPARTMENT_CAMERA_TARGETS[activeCompartment]) {
          const target = COMPARTMENT_CAMERA_TARGETS[activeCompartment];
          targetYawRef.current = target.yaw;
          targetPitchRef.current = target.pitch;
          targetZoomRef.current = target.zoom;
        } else {
          targetYawRef.current += 0.002;
          targetPitchRef.current = 0.25;
          targetZoomRef.current = 100;
        }
      }

      // Smooth camera süzülme (LERP factor = 0.05 for extremely smooth transitions)
      yawRef.current += (targetYawRef.current - yawRef.current) * 0.05;
      pitchRef.current += (targetPitchRef.current - pitchRef.current) * 0.05;
      zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.05;

      const yaw = yawRef.current;
      const pitch = pitchRef.current;
      const zoom = zoomRef.current;

      // 1. Perspective grid on Y = -18 floor with glowing holographic fade
      if (hudActive) {
        ctx.lineWidth = 0.8;
        const gridY = -18;
        const spacing = 20;
        const range = 6;
        
        // Z direction lines
        for (let i = -range; i <= range; i++) {
          const gridX = i * spacing;
          const p1 = { x: gridX, y: gridY, z: -spacing * range };
          const p2 = { x: gridX, y: gridY, z: spacing * range };
          const pr1 = project(p1, yaw, pitch, zoom, w, h);
          const pr2 = project(p2, yaw, pitch, zoom, w, h);
          
          const opacity = Math.max(0, 0.12 - Math.abs(i) * 0.016);
          ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
          
          ctx.beginPath();
          ctx.moveTo(pr1.x, pr1.y);
          ctx.lineTo(pr2.x, pr2.y);
          ctx.stroke();
        }
        // X direction lines
        for (let i = -range; i <= range; i++) {
          const gridZ = i * spacing;
          const p1 = { x: -spacing * range, y: gridY, z: gridZ };
          const p2 = { x: spacing * range, y: gridY, z: gridZ };
          const pr1 = project(p1, yaw, pitch, zoom, w, h);
          const pr2 = project(p2, yaw, pitch, zoom, w, h);
          
          const opacity = Math.max(0, 0.12 - Math.abs(i) * 0.016);
          ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
          
          ctx.beginPath();
          ctx.moveTo(pr1.x, pr1.y);
          ctx.lineTo(pr2.x, pr2.y);
          ctx.stroke();
        }
      }

      // --- 3D ROTATION PRE-COMPUTATION ---
      const rotatedVertices = VERTICES.map(v => rotatePoint(v, yaw, pitch));
      const projectedVertices = rotatedVertices.map(rv => {
        const distance = 210;
        const fov = 350;
        const scale = fov / (distance + rv.z);
        const cx = w / 2;
        const cy = h / 2;
        return {
          x: cx + rv.x * scale * (zoom / 100),
          y: cy - rv.y * scale * (zoom / 100),
          zDepth: rv.z
        };
      });

      // --- PAINTER'S ALGORITHM DRAW ITEMS ASSEMBLY ---
      const drawItems: DrawItem[] = [];

      // 2. Add solid faces to rendering stack with flat ambient shading
      SOLID_FACES.forEach(face => {
        const zDepth = face.indices.reduce((sum, idx) => sum + rotatedVertices[idx].z, 0) / face.indices.length;
        
        drawItems.push({
          zDepth,
          draw: () => {
            ctx.beginPath();
            const p0 = projectedVertices[face.indices[0]];
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < face.indices.length; i++) {
              const pi = projectedVertices[face.indices[i]];
              ctx.lineTo(pi.x, pi.y);
            }
            ctx.closePath();
            
            if (face.type === 'line') {
              ctx.strokeStyle = face.outlineColor || "rgba(6, 182, 212, 0.5)";
              ctx.lineWidth = face.lineWidth || 1;
              ctx.stroke();
            } else {
              // Calculate normal and light shading
              const A = rotatedVertices[face.indices[0]];
              const B = rotatedVertices[face.indices[1]];
              const C = rotatedVertices[face.indices[2]];
              
              const v1 = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
              const v2 = { x: C.x - A.x, y: C.y - A.y, z: C.z - A.z };
              const nx = v1.y * v2.z - v1.z * v2.y;
              const ny = v1.z * v2.x - v1.x * v2.z;
              const nz = v1.x * v2.y - v1.y * v2.x;
              const len = Math.hypot(nx, ny, nz);
              let intensity = 0.65;
              
              if (len > 0) {
                const normX = nx / len;
                const normY = ny / len;
                const normZ = nz / len;
                
                // Light direction
                const lx = 0.3;
                const ly = 0.8;
                const lz = -0.5;
                const lenL = Math.hypot(lx, ly, lz);
                const dot = (normX * lx + normY * ly + normZ * lz) / lenL;
                intensity = 0.28 + 0.72 * Math.abs(dot);
              }
              
              const r = Math.floor(face.baseColor[0] * intensity);
              const g = Math.floor(face.baseColor[1] * intensity);
              const b = Math.floor(face.baseColor[2] * intensity);
              
              ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
              ctx.fill();
              
              ctx.strokeStyle = face.outlineColor || "rgba(6, 182, 212, 0.35)";
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
          }
        });
      });

      // 3. Add solid cylinder wheels to rendering stack
      const wheels = [
        { x: 58, y: -18, z: -27.5 },
        { x: 58, y: -18, z: 27.5 },
        { x: -25, y: -18, z: -28.5 },
        { x: -25, y: -18, z: 28.5 },
        { x: -58, y: -18, z: -28.5 },
        { x: -58, y: -18, z: 28.5 },
      ];
      
      wheels.forEach(wCenter => {
        const rotCenter = rotatePoint(wCenter, yaw, pitch);
        drawItems.push({
          zDepth: rotCenter.z,
          draw: () => {
            ctx.strokeStyle = "rgba(6, 182, 212, 0.38)";
            ctx.lineWidth = 0.8;
            drawWheel(ctx, wCenter.x, wCenter.y, wCenter.z, yaw, pitch, zoom, w, h);
          }
        });
      });

      // 4. Add ladder rungs to rendering stack
      const ladderZ = (rotatedVertices[18].z + rotatedVertices[19].z + rotatedVertices[20].z + rotatedVertices[21].z) / 4;
      drawItems.push({
        zDepth: ladderZ,
        draw: () => {
          ctx.strokeStyle = "rgba(6, 182, 212, 0.4)";
          ctx.lineWidth = 0.8;
          drawLadderRungs(ctx, yaw, pitch, zoom, w, h);
        }
      });

      // 5. Add water cannon to rendering stack
      const cannonRot = rotatePoint({ x: 28, y: 24, z: 0 }, yaw, pitch);
      drawItems.push({
        zDepth: cannonRot.z,
        draw: () => {
          ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
          drawWaterCannon(ctx, yaw, pitch, zoom, w, h);
        }
      });

      // 6. Gather and store hitbox polygon projections, add panels to rendering stack
      const newProjectedPanels: HitboxPolygon[] = [];

      Object.entries(COMPARTMENT_PANELS).forEach(([key, vertices]) => {
        if (!compartmentKeys.includes(key)) return;
        
        const projPoints = vertices.map(v => project(v, yaw, pitch, zoom, w, h));
        const zDepth = vertices.reduce((sum, v) => sum + rotatePoint(v, yaw, pitch).z, 0) / vertices.length;
        
        newProjectedPanels.push({
          key,
          points: projPoints,
          zDepth
        });

        const isActive = activeCompartment === key;
        const isHovered = hoveredKey === key;

        drawItems.push({
          zDepth: zDepth - 0.25, // Offset slightly forward to prevent z-fighting on body side
          draw: () => {
            if (isActive || isHovered) {
              // Breathing glow calculation for Sivas İtfaiyesi Premium visual style
              const pulseIntensity = Math.abs(Math.sin(now / 220));
              const activeFillAlpha = 0.20 + pulseIntensity * 0.18; // Pulses between 0.20 and 0.38
              const activeStrokeAlpha = 0.75 + pulseIntensity * 0.25; // Pulses between 0.75 and 1.00
              const glowBlur = isActive ? (10 + pulseIntensity * 8) : 6;

              ctx.fillStyle = isActive 
                ? `rgba(34, 197, 94, ${activeFillAlpha})` 
                : "rgba(34, 211, 238, 0.12)";
              ctx.strokeStyle = isActive 
                ? `rgba(34, 197, 94, ${activeStrokeAlpha})` 
                : "#22d3ee";
              ctx.lineWidth = isActive ? 3 : 1.5;

              ctx.beginPath();
              ctx.moveTo(projPoints[0].x, projPoints[0].y);
              for (let i = 1; i < projPoints.length; i++) {
                ctx.lineTo(projPoints[i].x, projPoints[i].y);
              }
              ctx.closePath();
              ctx.fill();
              
              ctx.shadowBlur = glowBlur;
              ctx.shadowColor = isActive ? "#22c55e" : "#22d3ee";
              ctx.stroke();
              ctx.shadowBlur = 0; // reset

              // Centroid calculation for glowing targeting indicator & floating labels
              const centroidX = projPoints.reduce((sum, p) => sum + p.x, 0) / projPoints.length;
              const centroidY = projPoints.reduce((sum, p) => sum + p.y, 0) / projPoints.length;

              const color = isActive ? "#22c55e" : "#22d3ee";
              ctx.strokeStyle = color;
              
              // Pulsing centroid center
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(centroidX, centroidY, isActive ? 4 : 3, 0, Math.PI * 2);
              ctx.fill();
              ctx.beginPath();
              const pulse = (isActive ? 7 : 5) + Math.sin(now / 120) * 2;
              ctx.arc(centroidX, centroidY, pulse, 0, Math.PI * 2);
              ctx.stroke();

              // Radar leader line
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.moveTo(centroidX, centroidY);
              const labelX = centroidX + (centroidX > w / 2 ? -95 : 35);
              const labelY = centroidY - 25;
              ctx.lineTo(centroidX + (centroidX > w / 2 ? -15 : 15), centroidY - 15);
              ctx.lineTo(labelX, labelY);
              ctx.stroke();

              // Tactical HUD Info Box
              ctx.fillStyle = "rgba(10, 15, 30, 0.94)";
              ctx.lineWidth = 1;
              
              const hs = HOTSPOT_3D[key];
              const labelText = hs ? hs.label.toUpperCase() : key.toUpperCase();
              const subText = isActive ? "LOCK SECURED" : "HATCH FOCUS";
              
              ctx.font = "bold 9px monospace";
              const textW = Math.max(ctx.measureText(labelText).width, ctx.measureText(subText).width) + 12;
              const textH = 24;
              const boxX = centroidX > w / 2 ? labelX - textW : labelX;

              ctx.beginPath();
              ctx.rect(boxX, labelY - 12, textW, textH);
              ctx.fill();
              ctx.stroke();

              // Info Box Text
              ctx.fillStyle = color;
              ctx.fillText(labelText, boxX + 6, labelY - 2);
              ctx.font = "7px monospace";
              ctx.fillStyle = isActive ? "#22c55e" : "rgba(34, 211, 238, 0.75)";
              ctx.fillText(subText, boxX + 6, labelY + 7);
            } else {
              // Subtle blueprint lines for inactive compartments
              ctx.strokeStyle = "rgba(6, 182, 212, 0.28)";
              ctx.lineWidth = 0.65;
              ctx.fillStyle = "rgba(6, 182, 212, 0.02)";
              
              ctx.beginPath();
              ctx.moveTo(projPoints[0].x, projPoints[0].y);
              for (let i = 1; i < projPoints.length; i++) {
                ctx.lineTo(projPoints[i].x, projPoints[i].y);
              }
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
        });
      });

      // Update projected panels ref for ray-cast mouse calculations
      projectedPanelsRef.current = newProjectedPanels;

      // 7. Headlight Beams Stack Entry (always rendered in front for transparency blending)
      const headlightZ = rotatedVertices[0].z; // cab front Z
      drawItems.push({
        zDepth: headlightZ - 5,
        draw: () => {
          ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
          drawHeadlightBeams(ctx, yaw, pitch, zoom, w, h);
        }
      });

      // --- EXECUTE PAINTER'S ALGORITHM DRAW ORDER ---
      drawItems.sort((a, b) => b.zDepth - a.zDepth); // Sort back-to-front (descending zDepth)
      drawItems.forEach(item => item.draw());

      // --- HUD OVERLAYS & TELEMETRY PANELS ---
      if (hudActive) {
        ctx.fillStyle = "rgba(6, 182, 212, 0.85)";
        ctx.font = "bold 9px monospace";

        // Four Corner Brackets
        const chSize = 15;
        ctx.strokeStyle = "rgba(6, 182, 212, 0.25)";
        ctx.lineWidth = 1;
        
        ctx.beginPath(); // Top-Left
        ctx.moveTo(chSize, 5); ctx.lineTo(5, 5); ctx.lineTo(5, chSize);
        ctx.stroke();
        ctx.beginPath(); // Top-Right
        ctx.moveTo(w - chSize, 5); ctx.lineTo(w - 5, 5); ctx.lineTo(w - 5, chSize);
        ctx.stroke();
        ctx.beginPath(); // Bottom-Left
        ctx.moveTo(chSize, h - 5); ctx.lineTo(5, h - 5); ctx.lineTo(5, h - chSize);
        ctx.stroke();
        ctx.beginPath(); // Bottom-Right
        ctx.moveTo(w - chSize, h - 5); ctx.lineTo(w - 5, h - 5); ctx.lineTo(w - 5, h - chSize);
        ctx.stroke();

        // Top Left Telemetry Readout
        ctx.fillText("TACTICAL HUD GARAJI v23.1", 15, 20);
        ctx.fillStyle = "rgba(6, 182, 212, 0.55)";
        ctx.font = "8px monospace";
        ctx.fillText("MESH MODE: SOLID FLAT SHADING", 15, 30);
        ctx.fillText(`AZIMUTH:   ${((yaw * 180) / Math.PI).toFixed(1)}°`, 15, 42);
        ctx.fillText(`ELEVATION: ${((pitch * 180) / Math.PI).toFixed(1)}°`, 15, 52);
        ctx.fillText(`ZOOM:      ${zoom.toFixed(1)}%`, 15, 62);

        // Top Right Target Readout
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(6, 182, 212, 0.85)";
        ctx.font = "bold 9px monospace";
        ctx.fillText("RADAR LINK: OPERATIONAL", w - 15, 20);
        
        ctx.font = "8px monospace";
        ctx.fillStyle = activeCompartment ? "#22c55e" : "rgba(6, 182, 212, 0.5)";
        const activeName = activeCompartment ? (COMPARTMENT_NAMES[activeCompartment] || activeCompartment).toUpperCase() : "NONE";
        ctx.fillText(`LOCKED TARGET: [${activeName}]`, w - 15, 32);

        ctx.fillStyle = "rgba(6, 182, 212, 0.5)";
        ctx.fillText(`CAMERA MODE:   [${autoRotate ? "AUTO-ORBIT" : "MANUAL-DRAG"}]`, w - 15, 42);
        ctx.fillText(`VEHICLE TYPE:  [${(vehicleType || "Taktiksel").toUpperCase()}]`, w - 15, 52);
        ctx.textAlign = "left";

        // Bottom Left Radar Sweep
        const radarCx = 35;
        const radarCy = h - 35;
        const radarR = 18;
        ctx.strokeStyle = "rgba(6, 182, 212, 0.2)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(radarCx, radarCy, radarR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(radarCx, radarCy, radarR / 2, 0, Math.PI * 2);
        ctx.stroke();
        
        const sweepAngle = (now / 600) % (Math.PI * 2);
        ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
        ctx.beginPath();
        ctx.moveTo(radarCx, radarCy);
        ctx.lineTo(radarCx + Math.cos(sweepAngle) * radarR, radarCy + Math.sin(sweepAngle) * radarR);
        ctx.stroke();

        ctx.fillStyle = "rgba(6, 182, 212, 0.6)";
        ctx.font = "8px monospace";
        ctx.fillText("HITBOX SCAN ACTIVE", 60, h - 32);

        // Bottom Right Status
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(6, 182, 212, 0.5)";
        ctx.fillText("GRID_LOCK: TRUE", w - 15, h - 30);
        ctx.fillText("COMM_LINK: 100%", w - 15, h - 20);
        ctx.textAlign = "left";

        // CRT Scanline filter
        ctx.strokeStyle = "rgba(6, 182, 212, 0.03)";
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 4) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [compartmentKeys, activeCompartment, hoveredKey, autoRotate, hudActive, vehicleType]);

  return (
    <div className="w-full relative rounded-xl border border-cyan-500/10 bg-slate-950/80 overflow-hidden select-none">
      {/* 3D Solid Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        className="w-full aspect-[16/9] bg-slate-950/80 cursor-grab active:cursor-grabbing block"
      />

      {/* Floating HUD Control Overlay */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={cn(
            "p-2 rounded-lg border font-mono text-[9px] font-bold tracking-wider transition-all flex items-center gap-1.5",
            autoRotate
              ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
              : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
          )}
          title="Auto-Orbit"
        >
          {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>DÖNDÜR</span>
        </button>

        <button
          onClick={() => setHudActive(!hudActive)}
          className={cn(
            "p-2 rounded-lg border font-mono text-[9px] font-bold tracking-wider transition-all flex items-center gap-1.5",
            hudActive
              ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
              : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
          )}
          title="Toggle HUD Telemetry"
        >
          <Activity className="w-3.5 h-3.5" />
          <span>HUD</span>
        </button>

        <button
          onClick={() => {
            targetYawRef.current = -Math.PI / 4;
            targetPitchRef.current = 0.25;
            targetZoomRef.current = 100;
            lastInteractionRef.current = Date.now();
          }}
          className="p-2 rounded-lg border bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 font-mono text-[9px] font-bold tracking-wider transition-all flex items-center gap-1.5"
          title="Reset Camera Angle"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>SIFIRLA</span>
        </button>

        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950/60 overflow-hidden">
          <button
            onClick={() => {
              targetZoomRef.current = Math.max(50, targetZoomRef.current - 15);
              lastInteractionRef.current = Date.now();
            }}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border-r border-slate-800 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              targetZoomRef.current = Math.min(200, targetZoomRef.current + 15);
              lastInteractionRef.current = Date.now();
            }}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
