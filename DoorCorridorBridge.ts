import * as hz from "horizon/core";

export default class DoorCorridorBridge extends hz.Component<typeof DoorCorridorBridge> {
  static propsDefinition = {
    // --- RIFERIMENTI ---
    doorRef:              { type: hz.PropTypes.Entity }, // gruppo o entità che CONTIENE la porta
    anchorRef:            { type: hz.PropTypes.Entity }, // anchor specifico (opzionale)

    // --- RICERCA ANCHOR ---
    searchRootRef:        { type: hz.PropTypes.Entity }, // radice in cui cercare tutti gli anchor
    searchInParent:       { type: hz.PropTypes.Boolean, default: true },
    anchorNameIncludes:   { type: hz.PropTypes.String,  default: "anchor" },

    // --- DIREZIONE ---
    useDirectionalFind:   { type: hz.PropTypes.Boolean, default: true },
    maxDistance:          { type: hz.PropTypes.Number,  default: 8.0 },
    maxAngleDeg:          { type: hz.PropTypes.Number,  default: 30 },
    forwardVec:           { type: hz.PropTypes.Vec3 },

    // --- LOGICA ---
    mode:                 { type: hz.PropTypes.String,  default: "OPEN_STATE" }, // "PRESENCE" | "OPEN_STATE"
    pollMs:               { type: hz.PropTypes.Number,  default: 200 },

    // --- PORTE: come riconoscerle/leggerle ---
    doorEntNameIncludes:  { type: hz.PropTypes.String,  default: "" }, // es. "opener"
    doorCompNameIncludes: { type: hz.PropTypes.String,  default: "" }, // es. "door"
    doorStateFieldsCSV:   { type: hz.PropTypes.String,  default: "isOpen,open,opened" },
    doorStateMethodsCSV:  { type: hz.PropTypes.String,  default: "getIsOpen,isOpen" },

    // --- DEBUG ---
    labelText:            { type: hz.PropTypes.Entity },
    autoLabel:            { type: hz.PropTypes.Boolean, default: false },
    debug:                { type: hz.PropTypes.Boolean, default: true },
  };

  private timerId: number | null = null;

  start() {
    const tick = () => {
      const doorInfo = this.findDoorComp();
      if (!doorInfo) {
        if (this.props.debug) {
          console.warn("[DoorCorridorBridge] Porta non trovata. Controlla doorRef/filtri. Dump albero ↓");
          this.debugDumpDoorTree();
        }
        return;
      }
      const { doorComp, doorEnt } = doorInfo;

      const anchor = this.resolveAnchorComp(doorEnt);
      if (!anchor) {
        if (this.props.debug) console.warn("[DoorCorridorBridge] Anchor non trovato. Imposta searchRootRef (es. RectangularRoom) o anchorRef.");
        return;
      }

      const isOpen = this.readDoorOpenState(doorComp);
      const hasDoor = (this.props.mode === "OPEN_STATE") ? isOpen : true;

      (anchor as any).setDoorPresent?.(hasDoor);

      if (this.props.debug) {
        const aEnt = (anchor as any).entity as hz.Entity;
        console.log(`[DoorCorridorBridge] Door='${doorEnt.name?.get?.()}' → Anchor='${aEnt?.name?.get?.()}' → ${hasDoor ? "OPEN" : "CLOSED"}`);
      }

      // Label opzionale
      const labelEnt = (this.props.labelText as any)?.get?.() as hz.Entity | null;
      if (this.props.autoLabel && labelEnt) {
        const txt = (labelEnt.getComponents() as any[]).find(c => c.constructor?.name === "TextGizmo") as any;
        txt?.text?.set?.(`corridor: ${hasDoor ? "OPEN" : "CLOSED"}`);
      }
    };

    tick();
    this.timerId = this.async.setInterval(tick, Math.max(100, this.props.pollMs!));
  }

  destroy() {
    if (this.timerId !== null) this.async.clearInterval(this.timerId);
    this.timerId = null;
  }

  // ---------- helpers ----------
  private csv(s?: string): string[] {
    return (s || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  }

  private findDoorComp(): { doorComp: any; doorEnt: hz.Entity } | null {
  const entFilter = (this.props.doorEntNameIncludes || "").toLowerCase();
  const compFilter = (this.props.doorCompNameIncludes || "").toLowerCase();
  const fields = (this.props.doorStateFieldsCSV || "isOpen,open,opened").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const methods = (this.props.doorStateMethodsCSV || "getIsOpen,isOpen").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);

  const tryOn = (ent: hz.Entity | null): { doorComp: any; doorEnt: hz.Entity } | null => {
    if (!ent) return null;
    const comp = this.pickDoorCompOn(ent, compFilter, fields, methods);
    return comp ? { doorComp: comp, doorEnt: ent } : null;
  };

  // 1) doorRef → cerca in tutto il subtree
  const refEnt = (this.props.doorRef as any)?.get?.() as hz.Entity | null;
  if (refEnt) {
    const found = this.pickDoorCompInSubtree(refEnt, entFilter, compFilter, fields, methods);
    if (found) return found;
  }

  // 2) stessa entità
  const here = this.entity;
  const hereFound = tryOn(here);
  if (hereFound) return hereFound;

  // 3) figli
  for (const k of (here.children?.get?.() ?? []) as hz.Entity[]) {
    const f = tryOn(k); if (f) return f;
  }

  // 4) PARENT + fratelli (copre il caso: bridge su figlio, porta sul parent o su fratelli)
  const parent = (here as any).parent?.get?.() as hz.Entity | null;
  const parFound = tryOn(parent);
  if (parFound) return parFound;
  if (parent) {
    for (const sib of parent.children.get() as hz.Entity[]) {
      if (sib === here) continue;
      const f = tryOn(sib); if (f) return f;
    }
  }
  return null;
}

  private pickDoorCompInSubtree(root: hz.Entity, entFilter: string, compFilter: string, fields: string[], methods: string[])
  : { doorComp: any; doorEnt: hz.Entity } | null {
    const stack: hz.Entity[] = [root];
    let fallback: { doorComp: any; doorEnt: hz.Entity } | null = null;

    while (stack.length) {
      const e = stack.pop()!;
      const name = (e.name?.get?.() ?? "").toLowerCase();

      const comp = this.pickDoorCompOn(e, compFilter, fields, methods);
      if (comp) {
        if (!entFilter || name.includes(entFilter)) return { doorComp: comp, doorEnt: e };
        if (!fallback) fallback = { doorComp: comp, doorEnt: e };
      }
      const kids = (e.children?.get?.() ?? []) as hz.Entity[];
      for (const k of kids) stack.push(k);
    }
    return fallback;
  }

  private pickDoorCompOn(ent: hz.Entity, compFilter: string, fields: string[], methods: string[]): any | null {
    const comps = ent.getComponents() as any[];
    // se indicato, prova prima i component filtrati per nome
    const list = comps.concat().sort((a, b) => {
      const an = (a?.constructor?.name || "").toLowerCase();
      const bn = (b?.constructor?.name || "").toLowerCase();
      const am = compFilter && an.includes(compFilter) ? 0 : 1;
      const bm = compFilter && bn.includes(compFilter) ? 0 : 1;
      return am - bm;
    });

    for (const c of list) {
      const okField = fields.some(f => typeof (c as any)[f] !== "undefined");
      const okMethod = methods.some(m => typeof (c as any)[m] === "function");
      if (okField || okMethod) return c;
    }
    return null;
  }

  private readDoorOpenState(door: any): boolean {
    const fields = this.csv(this.props.doorStateFieldsCSV);
    const methods = this.csv(this.props.doorStateMethodsCSV);
    try {
      for (const f of fields) {
        if (typeof door[f] !== "undefined") return !!door[f];
      }
      for (const m of methods) {
        if (typeof door[m] === "function") return !!door[m]();
      }
    } catch {}
    return false;
  }

  private resolveAnchorComp(doorEnt: hz.Entity): any | null {
    // 1) manuale
    const refEnt = (this.props.anchorRef as any)?.get?.() as hz.Entity | null;
    if (refEnt) return this.findCorridorAnchorOn(refEnt);

    // 2) subtree
    const root = (this.props.searchRootRef as any)?.get?.() as hz.Entity | null;
    if (root) {
      const list = this.collectAnchorsInSubtree(root);
      return this.pickBestAnchor(list, doorEnt);
    }

    // 3) fratelli del bridge
    if (this.props.searchInParent) {
      const parentEnt = (this.entity as any).parent?.get?.() as hz.Entity | null;
      const pool: hz.Entity[] = parentEnt ? parentEnt.children.get() : [];
      const list: any[] = [];
      const filter = (this.props.anchorNameIncludes || "").toLowerCase();
      for (const e of pool) {
        if (e === this.entity) continue;
        const name = (e.name?.get?.() ?? "").toLowerCase();
        if (filter && !name.includes(filter)) continue;
        const ca = this.findCorridorAnchorOn(e);
        if (ca) list.push(ca);
      }
      return this.pickBestAnchor(list, doorEnt);
    }

    return null;
  }

  private collectAnchorsInSubtree(root: hz.Entity): any[] {
    const out: any[] = [];
    const stack: hz.Entity[] = [root];
    const filter = (this.props.anchorNameIncludes || "").toLowerCase();

    while (stack.length) {
      const e = stack.pop()!;
      const name = (e.name?.get?.() ?? "").toLowerCase();
      if (!filter || name.includes(filter)) {
        const ca = this.findCorridorAnchorOn(e);
        if (ca) out.push(ca);
      }
      const kids = (e.children?.get?.() ?? []) as hz.Entity[];
      for (const k of kids) stack.push(k);
    }
    return out;
  }

  private pickBestAnchor(candidates: any[], doorEnt: hz.Entity): any | null {
    if (!candidates.length) return null;

    const mePos = doorEnt.position.get();
    const fwd = this.computeForwardNormalized(doorEnt);
    const maxD = this.props.maxDistance || 8.0;
    const cosMax = Math.cos((this.props.maxAngleDeg || 30) * Math.PI / 180);

    let best: { comp: any; score: number } | null = null;

    for (const ca of candidates) {
      const e = (ca as any).entity as hz.Entity;
      const p = e.position.get();
      const vx = p.x - mePos.x, vy = p.y - mePos.y, vz = p.z - mePos.z;
      const dist = Math.sqrt(vx*vx + vy*vy + vz*vz);
      if (dist <= 0 || dist > maxD) continue;

      let score: number;
      if (this.props.useDirectionalFind!) {
        const nx = vx / dist, ny = vy / dist, nz = vz / dist;
        const dot = fwd.x * nx + fwd.y * ny + fwd.z * nz;
        if (dot < cosMax) continue;
        score = dot;
      } else {
        score = -dist;
      }

      if (!best || score > best.score) best = { comp: ca, score };
    }

    return best ? best.comp : null;
  }

  private findCorridorAnchorOn(e: hz.Entity): any | null {
    const comps = e.getComponents() as any[];
    return comps.find(c => c.constructor?.name === "CorridorAnchor") || null;
  }

  private computeForwardNormalized(refEnt?: hz.Entity): hz.Vec3 {
    const fv = this.props.forwardVec as hz.Vec3 | undefined;
    if (fv) {
      const len = Math.max(1e-6, Math.hypot(fv.x, fv.y, fv.z));
      return new hz.Vec3(fv.x/len, fv.y/len, fv.z/len);
    }
    const ent = refEnt ?? this.entity;
    try {
      const r: any = ent.rotation?.get?.();
      if (r?.rotateVector) {
        const f: any = r.rotateVector(new hz.Vec3(0, 0, 1));
        const len = Math.max(1e-6, Math.hypot(f.x, f.y, f.z));
        return new hz.Vec3(f.x/len, f.y/len, f.z/len);
      }
    } catch {}
    return new hz.Vec3(0, 0, 1);
  }

  // Dump di debug dell'albero sotto doorRef: entity + components
  private debugDumpDoorTree() {
    const refEnt = (this.props.doorRef as any)?.get?.() as hz.Entity | null;
    if (!refEnt) { console.warn("[DoorCorridorBridge] doorRef non impostato."); return; }
    const stack: hz.Entity[] = [refEnt];
    while (stack.length) {
      const e = stack.pop()!;
      const comps = (e.getComponents() as any[]).map(c => c.constructor?.name).join(", ");
      console.log(`[DoorCorridorBridge][DUMP] Ent='${e.name?.get?.()}' comps=[${comps}]`);
      const kids = (e.children?.get?.() ?? []) as hz.Entity[];
      for (const k of kids) stack.push(k);
    }
  }
}
hz.Component.register(DoorCorridorBridge);
