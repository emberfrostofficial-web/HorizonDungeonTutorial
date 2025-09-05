import * as hz from "horizon/core";

export enum Dir { N=0, E=1, S=2, W=3 }

export class CorridorAnchor extends hz.Component<typeof CorridorAnchor> {
  static propsDefinition = {
    // (facoltativi: solo per seed deterministico delle varianti)
    gridX:    { type: hz.PropTypes.Number, default: 0 },
    gridY:    { type: hz.PropTypes.Number, default: 0 },
    dir:      { type: hz.PropTypes.Number, default: Dir.N },
    priority: { type: hz.PropTypes.Number, default: 1 },

    // Modalità random global per OPEN (e default closed)
    randomizeMode: { type: hz.PropTypes.String, default: "deterministic" }, // "deterministic" | "per_refresh"

    // ======================
    //   ✅ Spunta qui
    // ======================
    openCorridor:  { type: hz.PropTypes.Boolean, default: false }, // SPUNTA = APERTO

    // ASSET (minimo: 1 open + 1 closed)
    openVar1:      { type: hz.PropTypes.Asset },
    openVar2:      { type: hz.PropTypes.Asset },
    openVar3:      { type: hz.PropTypes.Asset },

    // Closed: supporta sia singolo CAP sia 3 varianti
    closedCap:     { type: hz.PropTypes.Asset },
    closedVar1:    { type: hz.PropTypes.Asset },
    closedVar2:    { type: hz.PropTypes.Asset },
    closedVar3:    { type: hz.PropTypes.Asset },

    // Controlli OPEN
    randomizeMeshOpen:  { type: hz.PropTypes.Boolean, default: true },
    forceOpenIndex: { type: hz.PropTypes.Number,  default: 1 },

    // Controlli CLOSED
    randomizeMeshClosed:     { type: hz.PropTypes.Boolean, default: true },
    forceClosedIndex:    { type: hz.PropTypes.Number,  default: 1 },
    randomizeClosedMode: { type: hz.PropTypes.String,  default: "deterministic" }, // "deterministic" | "per_refresh"

    // Avvio & polling leggero per cogliere cambi dall’editor
    spawnOnStart:  { type: hz.PropTypes.Boolean, default: true },
    pollMs:        { type: hz.PropTypes.Number,  default: 150 },

    // debug opzionale
    debug:         { type: hz.PropTypes.Boolean, default: false },
  };

  private doorPresentRuntime = true;   // stato effettivo OPEN/CLOSED
  private spawned: hz.Entity[] = [];
  private busy = false;
  private refreshPending = false;
  private timerId: number | null = null;
  private refreshTick = 0; // per random per_refresh

  preStart(): void {
    // inizializza direttamente dalla spunta
    this.doorPresentRuntime = !!this.props.openCorridor;
  }

  async start() {
    if (this.props.spawnOnStart) await this.refreshSpawn();

    // Poll leggero: se cambi la checkbox in editor, aggiorna lo spawn
    const tick = () => {
      const wantOpen = !!this.props.openCorridor;
      if (wantOpen !== this.doorPresentRuntime) {
        this.doorPresentRuntime = wantOpen;
        this.queueRefresh();
        if (this.props.debug) console.log(`[CorridorAnchor] openCorridor=${wantOpen ? 1 : 0}`);
      }
    };
    this.timerId = this.async.setInterval(tick, Math.max(50, this.props.pollMs!));
  }

  destroy(): void {
    if (this.timerId !== null) this.async.clearInterval(this.timerId);
    this.timerId = null;
    this.despawnAll();
  }

  // ===== API pubblica (se vuoi pilotare da altri script) =====
  public setDoorPresent(v: boolean): void {
    const nv = !!v;
    if (nv === this.doorPresentRuntime) return;
    this.doorPresentRuntime = nv;
    this.queueRefresh();
  }
  public isDoorPresent(): boolean { return this.doorPresentRuntime; }

  // ===== Spawn Mgmt =====
  private queueRefresh() {
    if (this.busy) { this.refreshPending = true; return; }
    this.refreshSpawn();
  }

  private async refreshSpawn() {
    if (this.busy) { this.refreshPending = true; return; }
    this.busy = true; this.refreshPending = false;
    this.refreshTick++;

    this.despawnAll();

    // Se aperto → variante OPEN; se chiuso → variante CLOSED (o closedCap fallback)
    let asset: hz.Asset | null = null;
    if (this.doorPresentRuntime) {
      asset = this.pickOpenAsset();
    } else {
      asset = this.pickClosedAsset() ?? (this.props.closedCap as hz.Asset | undefined) ?? null;
    }

    if (!asset) {
      if (this.props.debug) console.warn("[CorridorAnchor] nessun asset assegnato (open o closed).");
      this.busy = false;
      if (this.refreshPending) this.refreshSpawn();
      return;
    }

    const pos = this.entity.position.get();
    const rot = this.entity.rotation.get();

    try {
      const objs = await this.world.spawnAsset(asset, pos, rot);
      this.spawned = objs ?? [];
      if (this.props.debug) console.log(`[CorridorAnchor] spawn OK: ${this.spawned.length} entità.`);
    } catch (e) {
      if (this.props.debug) console.error("[CorridorAnchor] spawn FAILED:", e);
    } finally {
      this.busy = false;
      if (this.refreshPending) this.refreshSpawn();
    }
  }

  private despawnAll() {
    if (!this.spawned.length) return;
    for (const e of this.spawned) {
      try { this.world.deleteAsset(e); } catch {}
    }
    this.spawned.length = 0;
  }

  // ===== Varianti OPEN =====
  private pickOpenAsset(): hz.Asset | null {
    const list: hz.Asset[] = [];
    if (this.props.openVar1) list.push(this.props.openVar1 as hz.Asset);
    if (this.props.openVar2) list.push(this.props.openVar2 as hz.Asset);
    if (this.props.openVar3) list.push(this.props.openVar3 as hz.Asset);
    if (!list.length) return null;

    // Nessun random: forzi indice (1..3)
    if (!this.props.randomizeMeshOpen) {
      const forced = Math.max(1, Math.min(3, this.props.forceOpenIndex || 1)) - 1;
      return list[forced] ?? list[0];
    }

    // Random controllato
    const mode = (this.props as any).randomizeMode || "deterministic"; // "deterministic" | "per_refresh"

    // seed deterministico base (coerente tra client per stessi gx,gy,dir)
    const gx = this.props.gridX ?? 0;
    const gy = this.props.gridY ?? 0;
    const d  = this.props.dir   ?? 0;
    let seed = ((gx * 73856093) ^ (gy * 19349663) ^ (d * 83492791)) >>> 0;

    // per_refresh: cambia ad ogni refresh
    if (mode === "per_refresh") {
      seed = (seed ^ ((this.refreshTick + 1) * 2654435761)) >>> 0;
    }

    const idx = seed % list.length;
    return list[idx];
  }

  // ===== Varianti CLOSED =====
  private pickClosedAsset(): hz.Asset | null {
    const list: hz.Asset[] = [];
    if (this.props.closedVar1) list.push(this.props.closedVar1 as hz.Asset);
    if (this.props.closedVar2) list.push(this.props.closedVar2 as hz.Asset);
    if (this.props.closedVar3) list.push(this.props.closedVar3 as hz.Asset);
    if (!list.length) return null;

    // Nessun random: forzi indice (1..3)
    if (!this.props.randomizeMeshClosed) {
      const forced = Math.max(1, Math.min(3, this.props.forceClosedIndex || 1)) - 1;
      return list[forced] ?? list[0];
    }

    // Modalità random closed (default: deterministic)
    const mode = (this.props as any).randomizeClosedMode || "deterministic"; // "deterministic" | "per_refresh"

    // Seed deterministico base + SALT per differenziare dagli open
    const gx = this.props.gridX ?? 0;
    const gy = this.props.gridY ?? 0;
    const d  = this.props.dir   ?? 0;
    let seed = (((gx * 73856093) ^ (gy * 19349663) ^ (d * 83492791)) ^ 0xB5297A4D) >>> 0;

    // per_refresh: cambia ad ogni refresh
    if (mode === "per_refresh") {
      seed = (seed ^ ((this.refreshTick + 1) * 2654435761)) >>> 0;
    }

    const idx = seed % list.length;
    return list[idx];
  }
}

hz.Component.register(CorridorAnchor);
