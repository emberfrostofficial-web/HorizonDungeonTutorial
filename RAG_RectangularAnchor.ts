// RAG_BlockAnchors.ts 
import * as hz from "horizon/core";

// ================= RNG deterministico (seed) =================
function hash32(str: string): number { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(seed: number) { let t = seed >>> 0; return function () { t += 0x6D2B79F5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
class Rng { private fn: () => number; constructor(seed: string) { this.fn = mulberry32(hash32(seed)); } next(): number { return this.fn(); } nextInt(min: number, max: number): number { const f = this.next(); return Math.floor(min + f * (max - min + 1)); } nextBool(p = 0.5): boolean { return this.next() < p; } pick<T>(arr: T[]): T { return arr[this.nextInt(0, arr.length - 1)]; } }

// Eventi semplici
export const RAG_BA_Generate = new hz.LocalEvent<{}>("RAG_BA_Generate");
export const RAG_BA_Clear    = new hz.LocalEvent<{}>("RAG_BA_Clear");
// Toggle porte (E / Touch - opzionale, utile se vuoi ancora alzare/abbassare le ante spostandole sotto il floor)
export const RAG_BA_DoorsDown   = new hz.LocalEvent<{}>("RAG_BA_DoorsDown");
export const RAG_BA_DoorsUp     = new hz.LocalEvent<{}>("RAG_BA_DoorsUp");
export const RAG_BA_DoorsToggle = new hz.LocalEvent<{}>("RAG_BA_DoorsToggle");

// Helpers yaw/rot2D
function yaw(deg: number): hz.Quaternion { return hz.Quaternion.fromEuler(new hz.Vec3(0, deg, 0)); }
function rot2D(x: number, z: number, yawDeg: number): hz.Vec3 {
  const r = (yawDeg * Math.PI) / 180; const c = Math.cos(r), s = Math.sin(r);
  return new hz.Vec3(x * c - z * s, 0, x * s + z * c);
}

// Direzioni
type Side = "N" | "E" | "S" | "W";
const OPP: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };

function sideYaw(side: Side, meshAlongX: boolean): number {
  let base = side === "N" ? 0 : side === "E" ? 90 : side === "S" ? 180 : 270;
  const meshOffset = meshAlongX ? 0 : 90;
  return (base + meshOffset) % 360;
}
function inwardNormal(side: Side): hz.Vec3 {
  if (side === "N") return new hz.Vec3(0, 0, -1);
  if (side === "S") return new hz.Vec3(0, 0, +1);
  if (side === "E") return new hz.Vec3(-1, 0, 0);
  return new hz.Vec3(+1, 0, 0);
}
function uniq<T>(arr: T[]): T[] { const out: T[] = []; for (let i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]); return out; }

function pickDoorsCount(rng: Rng, candidates: Side[], count: number, preferOpposites: boolean): Side[] {
  const res: Side[] = [];
  const want = Math.max(0, Math.min(count, candidates.length));
  const cset = uniq(candidates.slice());
  if (preferOpposites && want >= 2) {
    const pairs: [Side, Side][] = [["N","S"],["E","W"]];
    const avail = pairs.filter(([a,b]) => cset.indexOf(a) >= 0 && cset.indexOf(b) >= 0);
    if (avail.length > 0) {
      const [a,b] = avail[rng.nextInt(0, avail.length - 1)];
      res.push(a,b);
    }
  }
  const remaining = cset.filter(s => res.indexOf(s) < 0);
  while (res.length < want && remaining.length > 0) {
    const i = rng.nextInt(0, remaining.length - 1);
    res.push(remaining.splice(i,1)[0]);
  }
  return res;
}
function pickDoorsAutoPairs2(rng: Rng, candidates: Side[], count: number, preferOpposites: boolean): Side[] {
  return pickDoorsCount(rng, candidates, count, preferOpposites);
}

// ===== helper generico per pick N da un array =====
function pickN<T>(rng: Rng, arr: T[], count: number): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  const want = Math.max(0, Math.min(count, pool.length));
  while (out.length < want && pool.length > 0) {
    const i = rng.nextInt(0, pool.length - 1);
    out.push(pool.splice(i,1)[0]);
  }
  return out;
}

function shuffleInPlace<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}


// Prova a leggere lo yaw (Y euler) da un'entità, fallback 0 se non supportato
function yawFromEntity(e?: hz.Entity): number {
  if (!e) return 0;
  try {
    const q: any = e.rotation.get() as any;
    if (q && typeof q.toEuler === "function") {
      const ev = q.toEuler();
      return ev?.y ?? 0;
    }
  } catch {}
  return 0;
}

// === Helper: pick di una variante asset (seed-based) ===
function pickAsset(
  rng: Rng,
  enabled: boolean,
  base?: hz.Asset,
  ...alts: (hz.Asset | undefined)[]
): hz.Asset | undefined {
  // filtra solo gli asset validi
  const pool = (enabled ? [base, ...alts] : [base]).filter(
    (a): a is hz.Asset => !!a
  );
  if (pool.length === 0) return undefined;
  return pool[rng.nextInt(0, pool.length - 1)];
}


export default class RAG_RectangularAnchor extends hz.Component<typeof RAG_RectangularAnchor> {

    static propsDefinition = {
 __H_GENERATION__:        { type: hz.PropTypes.String, default: "RANDOM RULES" },

  // ===== GENERATION (first) =====
  seed:                { type: hz.PropTypes.String,  default: "RAG-Seed" },
  seedMode:           { type: hz.PropTypes.String,  default: "manual" }, // "manual" | "per_entity" | "per_generate"
  seedBase:           { type: hz.PropTypes.String,  default: "RAG-Seed" }, // used if empty
  seedSalt:           { type: hz.PropTypes.String }, // opzionale per differenziare istanze con stesso seed
  autoGenerateOnStart: { type: hz.PropTypes.Boolean, default: true },

  // Doors – random rules
  doorMode:            { type: hz.PropTypes.String,  default: "manual" }, // "manual"|"manual_count"|"auto_pairs2"|"auto_total"|"auto_chance"
  autoDoorsCount:      { type: hz.PropTypes.Number,  default: 2 },
  preferOpposites:     { type: hz.PropTypes.Boolean, default: true },
  doorChance:          { type: hz.PropTypes.Number,  default: 0.5 },
  doorMin:             { type: hz.PropTypes.Number,  default: 1 },
  doorMax:             { type: hz.PropTypes.Number,  default: 4 },
  doorManualCount:     { type: hz.PropTypes.Number,  default: 1 },
  doorEnsureAtLeastOne:{ type: hz.PropTypes.Boolean, default: true },

  // Objects – random rules
  objectsMode:            { type: hz.PropTypes.String,  default: "manual" },
  objectsManualCount:     { type: hz.PropTypes.Number,  default: 1 },
  objectsMin:             { type: hz.PropTypes.Number,  default: 0 },
  objectsMax:             { type: hz.PropTypes.Number,  default: 4 },
  objectsChance:          { type: hz.PropTypes.Number,  default: 0.7 },
  objectsEnsureAtLeastOne:{ type: hz.PropTypes.Boolean, default: false },

  __H_ASSETS__:            { type: hz.PropTypes.String, default: "BASE ASSETS" },

  // Core assets
  Floor:    { type: hz.PropTypes.Asset },
  WallFull: { type: hz.PropTypes.Asset },
  WallDoor: { type: hz.PropTypes.Asset },
  Door:     { type: hz.PropTypes.Asset },
  Ceiling:  { type: hz.PropTypes.Asset },
  Pillar:   { type: hz.PropTypes.Asset },

  

  
  __H_VARIANTS_ASSETS__:   { type: hz.PropTypes.String, default: "VARIANT ASSETS" },

  // Variant assets
  WallFull_V1:  { type: hz.PropTypes.Asset }, WallFull_V2:  { type: hz.PropTypes.Asset }, WallFull_V3:  { type: hz.PropTypes.Asset },
  WallDoor_V1:  { type: hz.PropTypes.Asset }, WallDoor_V2:  { type: hz.PropTypes.Asset }, WallDoor_V3:  { type: hz.PropTypes.Asset },
  Floor_V1:     { type: hz.PropTypes.Asset }, Floor_V2:     { type: hz.PropTypes.Asset }, Floor_V3:     { type: hz.PropTypes.Asset },
  Ceiling_V1:   { type: hz.PropTypes.Asset }, Ceiling_V2:   { type: hz.PropTypes.Asset }, Ceiling_V3:   { type: hz.PropTypes.Asset },
  Door_V1:      { type: hz.PropTypes.Asset }, Door_V2:      { type: hz.PropTypes.Asset }, Door_V3:      { type: hz.PropTypes.Asset },
  Pillar_V1:    { type: hz.PropTypes.Asset }, Pillar_V2:    { type: hz.PropTypes.Asset }, Pillar_V3:    { type: hz.PropTypes.Asset },

  __H_VARIANTS_TOGGLE__:   { type: hz.PropTypes.String, default: "USE VARIANT?" },

  // Variant toggles
  useFloorVariants:   { type: hz.PropTypes.Boolean, default: true },
  useWallVariants:    { type: hz.PropTypes.Boolean, default: true },
  useDoorVariants:    { type: hz.PropTypes.Boolean, default: true },
  useCeilingVariants: { type: hz.PropTypes.Boolean, default: true },
  usePillarVariants:  { type: hz.PropTypes.Boolean, default: false },

  __H_ANCHORS_BASE__:      { type: hz.PropTypes.String, default: "BASE ANCHORS" },

  // Base anchors
  Anchor_Floor:   { type: hz.PropTypes.Entity },
  Anchor_Ceiling: { type: hz.PropTypes.Entity },

  __H_ANCHORS_BASE_2__:   { type: hz.PropTypes.String, default: "BASE ANCHORS — SET 2" },
  Anchor_Floor2:          { type: hz.PropTypes.Entity },
  Anchor_Ceiling2:        { type: hz.PropTypes.Entity },


  __H_ANCHORS_WALLS__:     { type: hz.PropTypes.String, default: "WALL/DOOR ANCHORS" },

  // Wall & door anchors
  Anchor_Wall_N:  { type: hz.PropTypes.Entity },
  Anchor_Wall_E:  { type: hz.PropTypes.Entity },
  Anchor_Wall_S:  { type: hz.PropTypes.Entity },
  Anchor_Wall_W:  { type: hz.PropTypes.Entity },
  Anchor_Door_N:  { type: hz.PropTypes.Entity },
  Anchor_Door_E:  { type: hz.PropTypes.Entity },
  Anchor_Door_S:  { type: hz.PropTypes.Entity },
  Anchor_Door_W:  { type: hz.PropTypes.Entity },

  __H_ANCHORS_WALLS_2__:  { type: hz.PropTypes.String, default: "WALL/DOOR ANCHORS — SET 2" },
// Solo i lati che hai creato (E/W)
  Anchor_Wall_E2:         { type: hz.PropTypes.Entity },
  Anchor_Wall_W2:         { type: hz.PropTypes.Entity },
  Anchor_Door_E2:         { type: hz.PropTypes.Entity },
  Anchor_Door_W2:         { type: hz.PropTypes.Entity },


  __H_ANCHORS_PILLARS__:   { type: hz.PropTypes.String, default: "PILLAR ANCHORS" },

  // Pillar corner anchors
  Anchor_Pillar_NE:{ type: hz.PropTypes.Entity },
  Anchor_Pillar_SE:{ type: hz.PropTypes.Entity },
  Anchor_Pillar_SW:{ type: hz.PropTypes.Entity },
  Anchor_Pillar_NW:{ type: hz.PropTypes.Entity },

  __H_ANCHORS_PILLARS_2__:{ type: hz.PropTypes.String, default: "PILLAR ANCHORS — SET 2" },
// Solo gli angoli che hai creato (NE/NW)
  Anchor_Pillar_NE2:      { type: hz.PropTypes.Entity },
  Anchor_Pillar_NW2:      { type: hz.PropTypes.Entity },


  __H_CEILING__:           { type: hz.PropTypes.String, default: "CEILING CONTROLS" },

  // Ceiling controls
  spawnCeiling:        { type: hz.PropTypes.Boolean, default: false },
  ceilingUseFloorY:    { type: hz.PropTypes.Boolean, default: false },
  ceilingYawFromAnchor:{ type: hz.PropTypes.Boolean, default: true },
  ceilingPivotOffsetX: { type: hz.PropTypes.Number,  default: 0 },
  ceilingPivotOffsetY: { type: hz.PropTypes.Number,  default: 0 },
  ceilingPivotOffsetZ: { type: hz.PropTypes.Number,  default: 0 },

  __H_WALLS__:             { type: hz.PropTypes.String, default: "WALL CONTROLS" },

  // Walls controls
  wallMeshAlongX:      { type: hz.PropTypes.Boolean, default: false },
  wallHalfThickness:   { type: hz.PropTypes.Number,  default: 0.10 },

  __H_OFFSETS__:          { type: hz.PropTypes.String, default: "PIVOT (WALLS & DOOR)" },

  // Pivot/offset for walls & door
  wallFullPivotOffsetX:{ type: hz.PropTypes.Number,  default: 0 },
  wallFullPivotOffsetY:{ type: hz.PropTypes.Number,  default: 0 },
  wallFullPivotOffsetZ:{ type: hz.PropTypes.Number,  default: 0 },
  wallDoorPivotOffsetX:{ type: hz.PropTypes.Number,  default: 0 },
  wallDoorPivotOffsetY:{ type: hz.PropTypes.Number,  default: 0 },
  wallDoorPivotOffsetZ:{ type: hz.PropTypes.Number,  default: 0 },
  doorPivotOffsetX:    { type: hz.PropTypes.Number,  default: 0 },
  doorPivotOffsetY:    { type: hz.PropTypes.Number,  default: 0 },
  doorPivotOffsetZ:    { type: hz.PropTypes.Number,  default: 0 },
  doorHideDepth:       { type: hz.PropTypes.Number,  default: 1.0 },

  __H_PILLARS__:          { type: hz.PropTypes.String, default: "PILLAR CONTROLS" },

  // Pillars controls
  pillarUseFloorY:     { type: hz.PropTypes.Boolean, default: false },
  pillarYawFromAnchor: { type: hz.PropTypes.Boolean, default: true },
  pillarPivotOffsetX:  { type: hz.PropTypes.Number,  default: 0 },
  pillarPivotOffsetY:  { type: hz.PropTypes.Number,  default: 0 },
  pillarPivotOffsetZ:  { type: hz.PropTypes.Number,  default: 0 },

  
  __H_OBJECTS_GLOBAL__:  { type: hz.PropTypes.String, default: "OBJECTS (GLOBAL CONTROLS)" },

  // Objects – global controls
  objectYawFromAnchor: { type: hz.PropTypes.Boolean, default: true },
  objectPivotOffsetX:  { type: hz.PropTypes.Number,  default: 0 },
  objectPivotOffsetY:  { type: hz.PropTypes.Number,  default: 0 },
  objectPivotOffsetZ:  { type: hz.PropTypes.Number,  default: 0 },
  objectsShuffleAnchors: { type: hz.PropTypes.Boolean, default: true },

  __H_OBJECTS_SLOTS__:   { type: hz.PropTypes.String, default: "OBJECT SLOTS" },

  // Object slots 1..8
  Obj1_Asset:  { type: hz.PropTypes.Asset },  Obj1_Anchor:  { type: hz.PropTypes.Entity },  Obj1_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj2_Asset:  { type: hz.PropTypes.Asset },  Obj2_Anchor:  { type: hz.PropTypes.Entity },  Obj2_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj3_Asset:  { type: hz.PropTypes.Asset },  Obj3_Anchor:  { type: hz.PropTypes.Entity },  Obj3_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj4_Asset:  { type: hz.PropTypes.Asset },  Obj4_Anchor:  { type: hz.PropTypes.Entity },  Obj4_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj5_Asset:  { type: hz.PropTypes.Asset },  Obj5_Anchor:  { type: hz.PropTypes.Entity },  Obj5_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj6_Asset:  { type: hz.PropTypes.Asset },  Obj6_Anchor:  { type: hz.PropTypes.Entity },  Obj6_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj7_Asset:  { type: hz.PropTypes.Asset },  Obj7_Anchor:  { type: hz.PropTypes.Entity },  Obj7_Enabled:  { type: hz.PropTypes.Boolean, default: true },
  Obj8_Asset:  { type: hz.PropTypes.Asset },  Obj8_Anchor:  { type: hz.PropTypes.Entity },  Obj8_Enabled:  { type: hz.PropTypes.Boolean, default: true },

  Obj1_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj1_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj1_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj1_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj1_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj2_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj2_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj2_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj2_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj2_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj3_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj3_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj3_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj3_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj3_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj4_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj4_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj4_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj4_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj4_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj5_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj5_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj5_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj5_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj5_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj6_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj6_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj6_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj6_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj6_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj7_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj7_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj7_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj7_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj7_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },
  Obj8_UseRandom:{ type: hz.PropTypes.Boolean, default: false }, Obj8_RandomRadius:{ type: hz.PropTypes.Number, default: 0 }, Obj8_RandomYaw:{ type: hz.PropTypes.Boolean, default: false }, Obj8_SnapToFloor:{ type: hz.PropTypes.Boolean, default: false }, Obj8_FloorYOffset:{ type: hz.PropTypes.Number, default: 0 },

  __H_SCALES__:           { type: hz.PropTypes.String, default: "GENERAL SCALE" },

  // All scales at the bottom
  FloorScale:    { type: hz.PropTypes.Vec3 },
  WallFullScale: { type: hz.PropTypes.Vec3 },
  WallDoorScale: { type: hz.PropTypes.Vec3 },
  DoorScale:     { type: hz.PropTypes.Vec3 },
  CeilingScale:  { type: hz.PropTypes.Vec3 },
  PillarScale:   { type: hz.PropTypes.Vec3 },
  
  __H_QOL_DEBUG__:       { type: hz.PropTypes.String, default: "DEBUG" },

  // QoL / Debug
  snapAnchorsToFloorY: { type: hz.PropTypes.Boolean, default: true },
  debugLogs:           { type: hz.PropTypes.Boolean, default: false },


  };



  private spawned: hz.SpawnController[] = [];
  private doors: { sc: hz.SpawnController; basePos: hz.Vec3; rotY: number; asset: hz.Asset; scale?: hz.Vec3 }[] = [];
  private doorsHidden = false;

  start() {
    this.connectLocalEvent(this.entity, RAG_BA_Generate, () => this.generate());
    this.connectLocalEvent(this.entity, RAG_BA_Clear,    () => this.clearAll());
    this.connectLocalEvent(this.entity, RAG_BA_DoorsDown,   () => this.onDoorsDown());
    this.connectLocalEvent(this.entity, RAG_BA_DoorsUp,     () => this.onDoorsUp());
    this.connectLocalEvent(this.entity, RAG_BA_DoorsToggle, () => this.onDoorsToggle());
    if (this.props.autoGenerateOnStart) this.generate();
  }

  private spawn(asset: hz.Asset, pos: hz.Vec3, rotY: number, scale?: hz.Vec3): hz.SpawnController {
  const sc = new hz.SpawnController(asset, pos, yaw(rotY), scale ?? hz.Vec3.one);
    this.spawned.push(sc);
    sc.spawn().catch(() => console.error("[RAG_BlockAnchors] spawn error", asset));
    return sc;
  }
  private posOf(e?: hz.Entity): hz.Vec3 | null { return e ? e.position.get() : null; }
  private floorY(): number { const pf = this.posOf(this.props.Anchor_Floor); return pf ? pf.y : this.entity.position.get().y; }

    // Seed effettivo per questa istanza (e per sottostream come "|objects")
  private effectiveSeed(suffix = ""): string {
    const mode = (this.props.seedMode || "manual").toLowerCase();
    const base = (this.props.seed && this.props.seed.length > 0)
      ? this.props.seed
      : (this.props.seedBase || "RAG-Seed");
    const salt = this.props.seedSalt && this.props.seedSalt.length > 0 ? `|${this.props.seedSalt}` : "";
    if (mode === "per_entity") {
      // deterministico, diverso per entità
      return `${base}${salt}|EID:${this.entity.id}${suffix}`;
    } else if (mode === "per_generate") {
      // NON deterministico tra run: ogni Generate() cambia
      // (ok per prototipi; se vuoi assoluta sincronia client/server, preferisci "per_entity")
      const r = Math.floor(Math.random() * 0x7fffffff);
      return `${base}${salt}|RUN:${r}${suffix}`;
    } else {
      // manual
      return `${base}${salt}${suffix}`;
    }
  }


 private genWall(
  side: Side,
  wallAnchor: hz.Entity | undefined,
  doorAnchor: hz.Entity | undefined,
  wantDoor: boolean | undefined,
  rng: Rng
) {
  const alongX = !!this.props.wallMeshAlongX;
  const halfT  = this.props.wallHalfThickness || 0;
  const yawDeg = sideYaw(side, alongX);

  const pRaw = this.posOf(wallAnchor);
  if (!pRaw) { if (this.props.debugLogs) console.warn("[RAG_BlockAnchors] missing Wall Anchor for", side); return; }

  const yBase = this.props.snapAnchorsToFloorY ? this.floorY() : pRaw.y;
  const p     = new hz.Vec3(pRaw.x, yBase, pRaw.z);

  const inward   = inwardNormal(side);
  const posWall  = new hz.Vec3(p.x + inward.x * halfT, p.y, p.z + inward.z * halfT);

  // ===== Muro (con/senza porta) – varianti seed-based =====
  const useDoorWall = (wantDoor === true);

  const wallAsset = useDoorWall
    ? pickAsset(
        rng, !!this.props.useWallVariants,
        this.props.WallDoor,
        this.props.WallDoor_V1, this.props.WallDoor_V2, this.props.WallDoor_V3
      )
    : pickAsset(
        rng, !!this.props.useWallVariants,
        this.props.WallFull,
        this.props.WallFull_V1, this.props.WallFull_V2, this.props.WallFull_V3
      );

  const wox = useDoorWall ? (this.props.wallDoorPivotOffsetX || 0) : (this.props.wallFullPivotOffsetX || 0);
  const woy = useDoorWall ? (this.props.wallDoorPivotOffsetY || 0) : (this.props.wallFullPivotOffsetY || 0);
  const woz = useDoorWall ? (this.props.wallDoorPivotOffsetZ || 0) : (this.props.wallFullPivotOffsetZ || 0);
  const woff = rot2D(wox, woz, yawDeg);
  const posWallCorr = new hz.Vec3(posWall.x + woff.x, posWall.y + woy, posWall.z + woff.z);

  const wallScale = useDoorWall
    ? (this.props.WallDoorScale || hz.Vec3.one)
    : (this.props.WallFullScale || hz.Vec3.one);

  if (wallAsset) this.spawn(wallAsset, posWallCorr, yawDeg, wallScale);

  // ===== Porta (anta) – varianti seed-based =====
  if (useDoorWall && (this.props.Door || this.props.Door_V1 || this.props.Door_V2 || this.props.Door_V3)) {
    // punto base: doorAnchor se c'è, altrimenti centro lato (wall anchor)
    const pdRaw = this.posOf(doorAnchor) || pRaw;
    const pd    = new hz.Vec3(pdRaw.x, yBase, pdRaw.z);

    // inset mezzo spessore verso l'interno stanza
    const posDoor = new hz.Vec3(pd.x + inward.x * halfT, pd.y, pd.z + inward.z * halfT);

    // correzione pivot porta (ruotata secondo yaw del muro)
    const dox = this.props.doorPivotOffsetX || 0;
    const doy = this.props.doorPivotOffsetY || 0;
    const doz = this.props.doorPivotOffsetZ || 0;
    const doff = rot2D(dox, doz, yawDeg);
    const posDoorCorr = new hz.Vec3(posDoor.x + doff.x, posDoor.y + doy, posDoor.z + doff.z);

    const doorAsset = pickAsset(
      rng, !!this.props.useDoorVariants,
      this.props.Door,
      this.props.Door_V1, this.props.Door_V2, this.props.Door_V3
    );
    const doorScale = this.props.DoorScale || hz.Vec3.one;

    if (doorAsset) {
      const scd = this.spawn(doorAsset, posDoorCorr, yawDeg, doorScale);
      this.doors.push({ sc: scd, basePos: posDoorCorr, rotY: yawDeg, asset: doorAsset, scale: doorScale });
    }
  }
}

// ===== Pillar helper (colonne SEMPRE se c'è Anchor/Asset) =====
private genPillar(anchor: hz.Entity | undefined, rng: Rng, tag: string) {
  if (!anchor) { if (this.props.debugLogs) console.warn(`[RAG_BlockAnchors] Pillar ${tag}: anchor mancante`); return; }

  // Posizione (probabile punto del mistero)
  const p = this.posOf(anchor);
  if (!p) { if (this.props.debugLogs) console.warn(`[RAG_BlockAnchors] Pillar ${tag}: posOf(null)`); return; }

  // Y: opzionale snap al floor
  const y = this.props.pillarUseFloorY ? this.floorY() : p.y;
  const base = new hz.Vec3(p.x, y, p.z);

  // Yaw: di default segue l’Anchor (disattivabile)
  const yawDeg = (this.props.pillarYawFromAnchor ?? true) ? yawFromEntity(anchor) : 0;

  // Offset pivot globale ruotato
  const px = this.props.pillarPivotOffsetX ?? 0;
  const py = this.props.pillarPivotOffsetY ?? 0;
  const pz = this.props.pillarPivotOffsetZ ?? 0;
  const poff = rot2D(px, pz, yawDeg);
  const pos = new hz.Vec3(base.x + poff.x, base.y + py, base.z + poff.z);

  // Asset: spawna SEMPRE se esiste almeno uno definito
  let asset: hz.Asset | undefined;
  if (this.props.usePillarVariants) {
    asset = pickAsset(rng, true, this.props.Pillar, this.props.Pillar_V1, this.props.Pillar_V2, this.props.Pillar_V3);
  } else {
    asset = this.props.Pillar;
  }
  if (!asset) asset = this.props.Pillar_V1 || this.props.Pillar_V2 || this.props.Pillar_V3 || this.props.Pillar;

  if (!asset) { if (this.props.debugLogs) console.warn(`[RAG_BlockAnchors] Pillar ${tag}: nessun asset (Pillar/Pillar_V1..3)`); return; }

  if (this.props.debugLogs) {
    const id = (anchor as any)?.id ?? "?";
    console.log(`[RAG_BlockAnchors] Pillar ${tag}`, {
      anchorId: id,
      anchorPos: { x: p.x, y: p.y, z: p.z },
      finalPos:  { x: pos.x, y: pos.y, z: pos.z },
      yawDeg,
    });
  }

  this.spawn(asset, pos, yawDeg, this.props.PillarScale || hz.Vec3.one);




}

  // ====== OGGETTI ======
  private collectObjectSlots() {
  const P: any = this.props as any;
  const slots: {
    idx: number;
    asset?: hz.Asset;
    anchor?: hz.Entity;
    enabled: boolean;
    scale?: hz.Vec3;
    useRandom: boolean;
    randRadius: number;
    randomYaw: boolean;
    snapToFloor: boolean;
    floorYOffset: number;
  }[] = [];

  for (let i = 1; i <= 8; i++) {
    slots.push({
      idx: i,
      asset: P[`Obj${i}_Asset`],
      anchor: P[`Obj${i}_Anchor`],
      enabled: P[`Obj${i}_Enabled`] !== false,
      scale: P[`Obj${i}_Scale`] as hz.Vec3 | undefined,
      useRandom: !!P[`Obj${i}_UseRandom`],
      randRadius: Number(P[`Obj${i}_RandomRadius`] ?? 0),
      randomYaw: !!P[`Obj${i}_RandomYaw`],
      snapToFloor: !!P[`Obj${i}_SnapToFloor`],
      floorYOffset: Number(P[`Obj${i}_FloorYOffset`] ?? 0),
    });
  }
  return slots;
}


  // ===== Oggetti: versione pulita =====
private generateObjects(rng: Rng) {
  const slots = this.collectObjectSlots()
    .filter(s => !!s.enabled && !!s.asset && !!s.anchor);

  if (slots.length === 0) return;

  const mode = (this.props.objectsMode || "manual").toLowerCase();
  let chosen: typeof slots = [];

  if (mode === "manual") {
    chosen = slots;
  } else if (mode === "manual_count") {
    const count = Math.max(0, Math.min(this.props.objectsManualCount || 1, slots.length));
    chosen = pickN(rng, slots, count);
    if ((this.props.objectsEnsureAtLeastOne ?? false) && chosen.length === 0) chosen = pickN(rng, slots, 1);
  } else if (mode === "auto_total") {
    const minO = Math.max(0, Math.min(this.props.objectsMin || 0, slots.length));
    const maxO = Math.max(minO, Math.min(this.props.objectsMax || slots.length, slots.length));
    const count = rng.nextInt(minO, maxO);
    chosen = pickN(rng, slots, count);
    if ((this.props.objectsEnsureAtLeastOne ?? false) && chosen.length === 0) chosen = pickN(rng, slots, 1);
  } else if (mode === "auto_chance") {
    const p = Math.max(0, Math.min(1, this.props.objectsChance || 0.7));
    chosen = slots.filter(_ => rng.nextBool(p));
    if ((this.props.objectsEnsureAtLeastOne ?? false) && chosen.length === 0) chosen = pickN(rng, slots, 1);
  } else {
    chosen = slots;
  }

  // Offset pivot globale (definito UNA volta, usato nel loop)
  const ox = this.props.objectPivotOffsetX || 0;
  const oy = this.props.objectPivotOffsetY || 0;
  const oz = this.props.objectPivotOffsetZ || 0;

  for (let i = 0; i < chosen.length; i++) {
    const slot = chosen[i];
    const aPos = this.posOf(slot.anchor!)!;
    // base Y: rispetta il globale, ma se lo slot chiede SnapToFloor, forziamo il floor
    let yBase = this.props.snapAnchorsToFloorY ? this.floorY() : aPos.y;
    if (slot.snapToFloor) yBase = this.floorY();

    // yaw: ancora o random (se richiesto)
    let yawDeg = this.props.objectYawFromAnchor ? yawFromEntity(slot.anchor!) : 0;
    if (slot.randomYaw) yawDeg = Math.floor(rng.next() * 360);

    // offset pivot globale ruotato
    const off = rot2D(ox, oz, yawDeg);

    // jitter locale nel piano (uniforme nel disco) se useRandom + raggio > 0
    let jx = 0, jz = 0;
    const rad = Math.max(0, slot.randRadius || 0);
    if (slot.useRandom && rad > 0) {
      const theta = rng.next() * Math.PI * 2;
      const r = rad * Math.sqrt(rng.next());
      jx = r * Math.cos(theta);
      jz = r * Math.sin(theta);
    }
    const joff = rot2D(jx, jz, yawDeg);

    // posa finale
    const base = new hz.Vec3(aPos.x, yBase, aPos.z);
    const pos = new hz.Vec3(
      base.x + off.x + joff.x,
      base.y + oy + (slot.floorYOffset || 0),
      base.z + off.z + joff.z
    );

    this.spawn(slot.asset!, pos, yawDeg, slot.scale || hz.Vec3.one);
  }
}

// ===== generate(): chiama generateObjects con rngObj separato =====
generate() {
  this.clearAll();
  this.doors = [];
  this.doorsHidden = false;

  const rng = new Rng(this.effectiveSeed());

    // Floor (con varianti seed-based)
  const pf = this.posOf(this.props.Anchor_Floor);
  if (pf) {
    const pFloor = this.props.snapAnchorsToFloorY ? new hz.Vec3(pf.x, this.floorY(), pf.z) : pf;

    const floorAsset = pickAsset(
      rng,
      !!this.props.useFloorVariants,
      this.props.Floor,
      this.props.Floor_V1, this.props.Floor_V2, this.props.Floor_V3
    );

    if (floorAsset) {
      this.spawn(floorAsset, pFloor, 0, this.props.FloorScale || hz.Vec3.one);
    }
  }

// === Floor 2  ===
{
  const pf2 = this.posOf(this.props.Anchor_Floor2);
  if (pf2) {
    const pFloor2 = this.props.snapAnchorsToFloorY ? new hz.Vec3(pf2.x, this.floorY(), pf2.z) : pf2;

    const floorAsset2 = pickAsset(
      rng,
      !!this.props.useFloorVariants,
      this.props.Floor,
      this.props.Floor_V1, this.props.Floor_V2, this.props.Floor_V3
    );

    if (floorAsset2) {
      this.spawn(floorAsset2, pFloor2, 0, this.props.FloorScale || hz.Vec3.one);
    }
  }
}

  // >>> Pillars fissi agli angoli (NE, SE, SW, NW/NV)
{
  const rngPill = new Rng(this.effectiveSeed("|pillars"));

  const P: any = this.props as any;

  const aNE = this.props.Anchor_Pillar_NE;
  const aSE = this.props.Anchor_Pillar_SE;
  const aSW = this.props.Anchor_Pillar_SW;
  const aNW = this.props.Anchor_Pillar_NW || P.Anchor_Pillar_NV; // supporta "NV"

  // Log stato anchor/asset (solo se debug attivo)
  if (this.props.debugLogs) {
    console.log("[RAG_BlockAnchors] Pillar anchors:",
      { NE: !!aNE, SE: !!aSE, SW: !!aSW, NW_or_NV: !!aNW },
      "Pillar asset set?", !!this.props.Pillar || !!this.props.Pillar_V1 || !!this.props.Pillar_V2 || !!this.props.Pillar_V3
    );
  }

  // Spawna con tag per capire chi è chi
  if (aNE) this.genPillar(aNE, rngPill, "NE");
  if (aSE) this.genPillar(aSE, rngPill, "SE");
  if (aSW) this.genPillar(aSW, rngPill, "SW");
  if (aNW) this.genPillar(aNW, rngPill, "NW/NV");
}

// >>> Pillars SET 2 (NE2/NW2 — sempre)
{
  const rngPill2 = new Rng(this.effectiveSeed("|pillars2"));
  const ne2 = this.props.Anchor_Pillar_NE2;
  const nw2 = this.props.Anchor_Pillar_NW2;
  if (ne2) this.genPillar(ne2, rngPill2, "NE2");
  if (nw2) this.genPillar(nw2, rngPill2, "NW2");
}


  // Walls + Doors
  const sides: Side[] = ["N", "E", "S", "W"];
  const wallAnchor: Record<Side, hz.Entity | undefined> = {
    N: this.props.Anchor_Wall_N, E: this.props.Anchor_Wall_E, S: this.props.Anchor_Wall_S, W: this.props.Anchor_Wall_W
  } as any;
  const doorAnchor: Record<Side, hz.Entity | undefined> = {
    N: this.props.Anchor_Door_N, E: this.props.Anchor_Door_E, S: this.props.Anchor_Door_S, W: this.props.Anchor_Door_W
  } as any;

  const wallsAvailable: Side[] = sides.filter(s => !!wallAnchor[s]);
  const anyDoorAnchor = !!(doorAnchor.N || doorAnchor.E || doorAnchor.S || doorAnchor.W);
  const doorCandidates: Side[] = anyDoorAnchor ? wallsAvailable.filter(s => !!doorAnchor[s]) : wallsAvailable;

  const wantDoor: Record<Side, boolean> = { N: false, E: false, S: false, W: false };
  const mode = (this.props.doorMode || "manual").toLowerCase();

  if (mode === "manual") {
    for (let i = 0; i < sides.length; i++) { const s = sides[i]; wantDoor[s] = !!doorAnchor[s]; }
  } else if (mode === "manual_count") {
    const count = Math.max(0, Math.min(this.props.doorManualCount || 1, doorCandidates.length));
    const picked = pickDoorsCount(rng, doorCandidates, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor[picked[i]] = true;
    if ((this.props.doorEnsureAtLeastOne ?? true) && picked.length === 0 && doorCandidates.length > 0) {
      wantDoor[rng.pick(doorCandidates)] = true;
    }
  } else if (mode === "auto_pairs2") {
    const count = Math.max(1, Math.min(this.props.autoDoorsCount || 2, doorCandidates.length));
    const picked = pickDoorsCount(rng, doorCandidates, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor[picked[i]] = true;
  } else if (mode === "auto_total") {
    const minD = Math.max(1, Math.min(this.props.doorMin || 1, doorCandidates.length));
    const maxD = Math.max(minD, Math.min(this.props.doorMax || 4, doorCandidates.length));
    const count = rng.nextInt(minD, maxD);
    const picked = pickDoorsCount(rng, doorCandidates, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor[picked[i]] = true;
  } else if (mode === "auto_chance") {
    const p = Math.max(0, Math.min(1, this.props.doorChance || 0.5));
    for (let i = 0; i < doorCandidates.length; i++) if (rng.nextBool(p)) wantDoor[doorCandidates[i]] = true;
    if ((this.props.doorEnsureAtLeastOne ?? true)
        && !wantDoor.N && !wantDoor.E && !wantDoor.S && !wantDoor.W
        && doorCandidates.length > 0) {
      wantDoor[rng.pick(doorCandidates)] = true;
    }
  }

  for (let i = 0; i < wallsAvailable.length; i++) {
    const s = wallsAvailable[i];
    const wA = wallAnchor[s];
    const dA = doorAnchor[s];
    this.genWall(s, wA, dA, wantDoor[s], rng);
  }

// === Walls + Doors — SET 2 (solo E/W come in scena) ===
{
  const sidesEW: Side[] = ["E", "W"];
  const wallAnchor2: Record<Side, hz.Entity | undefined> = {
    N: undefined,
    E: this.props.Anchor_Wall_E2,
    S: undefined,
    W: this.props.Anchor_Wall_W2,
  } as any;

  const doorAnchor2: Record<Side, hz.Entity | undefined> = {
    N: undefined,
    E: this.props.Anchor_Door_E2,
    S: undefined,
    W: this.props.Anchor_Door_W2,
  } as any;

  const wallsAvailable2: Side[] = sidesEW.filter(s => !!wallAnchor2[s]);
  const anyDoorAnchor2 = !!(doorAnchor2.E || doorAnchor2.W);
  const doorCandidates2: Side[] = anyDoorAnchor2 ? wallsAvailable2.filter(s => !!doorAnchor2[s]) : wallsAvailable2;

  const wantDoor2: Record<Side, boolean> = { N:false, E:false, S:false, W:false };
  const mode2 = (this.props.doorMode || "manual").toLowerCase();

  if (mode2 === "manual") {
    for (let i = 0; i < sidesEW.length; i++) { const s = sidesEW[i]; wantDoor2[s] = !!doorAnchor2[s]; }
  } else if (mode2 === "manual_count") {
    const count = Math.max(0, Math.min(this.props.doorManualCount || 1, doorCandidates2.length));
    const picked = pickDoorsCount(rng, doorCandidates2, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor2[picked[i]] = true;
    if ((this.props.doorEnsureAtLeastOne ?? true) && picked.length === 0 && doorCandidates2.length > 0) {
      wantDoor2[rng.pick(doorCandidates2)] = true;
    }
  } else if (mode2 === "auto_pairs2") {
    const count = Math.max(1, Math.min(this.props.autoDoorsCount || 2, doorCandidates2.length));
    const picked = pickDoorsCount(rng, doorCandidates2, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor2[picked[i]] = true;
  } else if (mode2 === "auto_total") {
    const minD = Math.max(1, Math.min(this.props.doorMin || 1, doorCandidates2.length));
    const maxD = Math.max(minD, Math.min(this.props.doorMax || 4, doorCandidates2.length));
    const count = rng.nextInt(minD, maxD);
    const picked = pickDoorsCount(rng, doorCandidates2, count, !!this.props.preferOpposites);
    for (let i = 0; i < picked.length; i++) wantDoor2[picked[i]] = true;
  } else if (mode2 === "auto_chance") {
    const p = Math.max(0, Math.min(1, this.props.doorChance || 0.5));
    for (let i = 0; i < doorCandidates2.length; i++) if (rng.nextBool(p)) wantDoor2[doorCandidates2[i]] = true;
    if ((this.props.doorEnsureAtLeastOne ?? true)
        && !wantDoor2.E && !wantDoor2.W
        && doorCandidates2.length > 0) {
      wantDoor2[rng.pick(doorCandidates2)] = true;
    }
  }

  for (let i = 0; i < wallsAvailable2.length; i++) {
    const s = wallsAvailable2[i];
    this.genWall(s, wallAnchor2[s], doorAnchor2[s], wantDoor2[s], rng);
  }
}

  // Ceiling da Anchor dedicato (fallback: Anchor_Floor) + varianti
  if (this.props.spawnCeiling) {
    const ac = this.props.Anchor_Ceiling || this.props.Anchor_Floor;
    const pc = this.posOf(ac);
    if (pc) {
      const y = this.props.ceilingUseFloorY ? this.floorY() : pc.y;
      const base = new hz.Vec3(pc.x, y, pc.z);

      const yawDeg = this.props.ceilingYawFromAnchor ? yawFromEntity(ac!) : 0;

      const cox = this.props.ceilingPivotOffsetX || 0;
      const coy = this.props.ceilingPivotOffsetY || 0;
      const coz = this.props.ceilingPivotOffsetZ || 0;
      const coff = rot2D(cox, coz, yawDeg);
      const pos = new hz.Vec3(base.x + coff.x, base.y + coy, base.z + coff.z);

      const ceilAsset = pickAsset(
        rng,
        !!this.props.useCeilingVariants,
        this.props.Ceiling,
        this.props.Ceiling_V1, this.props.Ceiling_V2, this.props.Ceiling_V3
      );

      if (ceilAsset) {
        this.spawn(ceilAsset, pos, yawDeg, this.props.CeilingScale || hz.Vec3.one);
      }
    }
  }

// === Ceiling 2 (se presente) ===
if (this.props.spawnCeiling) {
  const ac2 = this.props.Anchor_Ceiling2 || this.props.Anchor_Floor2;
  const pc2 = this.posOf(ac2);
  if (pc2) {
    const y2 = this.props.ceilingUseFloorY ? this.floorY() : pc2.y;
    const base2 = new hz.Vec3(pc2.x, y2, pc2.z);

    const yawDeg2 = this.props.ceilingYawFromAnchor ? yawFromEntity(ac2!) : 0;

    const cox2 = this.props.ceilingPivotOffsetX || 0;
    const coy2 = this.props.ceilingPivotOffsetY || 0;
    const coz2 = this.props.ceilingPivotOffsetZ || 0;
    const coff2 = rot2D(cox2, coz2, yawDeg2);
    const pos2 = new hz.Vec3(base2.x + coff2.x, base2.y + coy2, base2.z + coff2.z);

    const ceilAsset2 = pickAsset(
      rng,
      !!this.props.useCeilingVariants,
      this.props.Ceiling,
      this.props.Ceiling_V1, this.props.Ceiling_V2, this.props.Ceiling_V3
    );

    if (ceilAsset2) {
      this.spawn(ceilAsset2, pos2, yawDeg2, this.props.CeilingScale || hz.Vec3.one);
    }
  }
}


  // Oggetti randomizzati (usa RNG separato!)
    const rngObj = new Rng(this.effectiveSeed("|objects"));

  this.generateObjects(rngObj);
}


  clearAll() {
    for (let i = 0; i < this.spawned.length; i++) {
      try { this.spawned[i].unload(); } catch {}
    }
    this.spawned = [];
    this.doors = [];
    this.doorsHidden = false;
  }

  // ===== Porte: toggle su/giù (se vuoi ancora questo tipo di controllo "meccanico") =====
  private removeFromSpawned(sc: hz.SpawnController) {
    for (let i = 0; i < this.spawned.length; i++) {
      if (this.spawned[i] === sc) { this.spawned.splice(i,1); break; }
    }
  }
  private respawnDoor(entry: { sc: hz.SpawnController; basePos: hz.Vec3; rotY: number; asset: hz.Asset; scale?: hz.Vec3 }, hidden: boolean) {
  try { entry.sc.unload(); } catch {}
  this.removeFromSpawned(entry.sc);
  const pos = hidden
    ? new hz.Vec3(entry.basePos.x, entry.basePos.y - (this.props.doorHideDepth || 1.0), entry.basePos.z)
    : entry.basePos;
  const sc = new hz.SpawnController(entry.asset, pos, yaw(entry.rotY), entry.scale || hz.Vec3.one);
  this.spawned.push(sc);
  sc.spawn().catch(() => {});
  entry.sc = sc;
  }
  private setDoorsHidden(hidden: boolean) {
    if (this.doorsHidden === hidden) return;
    for (let i = 0; i < this.doors.length; i++) this.respawnDoor(this.doors[i], hidden);
    this.doorsHidden = hidden;
  }
  private onDoorsDown()  { this.setDoorsHidden(true); }
  private onDoorsUp()    { this.setDoorsHidden(false); }
  private onDoorsToggle(){ this.setDoorsHidden(!this.doorsHidden); }
}

hz.Component.register(RAG_RectangularAnchor);

