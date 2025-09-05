import * as hz from "horizon/core";

export default class DoorSimpleSlide extends hz.Component<typeof DoorSimpleSlide> {
  static propsDefinition = {
    // Porta da muovere (se vuoto muove l'entità che ha lo script)
    door:        { type: hz.PropTypes.Entity },

    // Direzione e parametri animazione
    mode:        { type: hz.PropTypes.String, default: "down" }, // "down"|"up"|"left"|"right"|"in"|"out"|"custom"
    distance:    { type: hz.PropTypes.Number, default: 1.1 },
    duration:    { type: hz.PropTypes.Number, default: 0.6 },    // sec

    // Evita apertura al Play se il player è già dentro al trigger
    armDelay:    { type: hz.PropTypes.Number, default: 0.4 },    // sec prima che il trigger sia “armato”

    // Richiusura automatica
    autoClose:   { type: hz.PropTypes.Boolean, default: true },
    closeDelay:  { type: hz.PropTypes.Number, default: 2.0 },    // sec

    // Offset custom (se mode="custom")
    customOffset:{ type: hz.PropTypes.Vec3 },
  };

  private base!: hz.Vec3;
  private open!: hz.Vec3;
  private isOpen = false;
  private moving = false;
  private armed  = false;
  private timerId: number | null = null;

  start() {
    const target = this.props.door ?? this.entity;
    this.base = target.position.get();
    this.open = this.base.add(this.computeOffset());

    // Armo il trigger dopo un piccolo ritardo
    this.async.setTimeout(() => { this.armed = true; }, Math.max(0, this.props.armDelay || 0) * 1000);

    // Eventi del Trigger
    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (_p: hz.Player) => {
      if (!this.armed) return;
      if (!this.isOpen) this.openDoor();
    });

    this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitTrigger, (_p: hz.Player) => {
      if (!this.armed) return;
      if (this.props.autoClose) this.scheduleClose();
    });
  }

  // ----- helpers -----
  private computeOffset(): hz.Vec3 {
    const d = this.props.distance || 1;
    const m = (this.props.mode || "down").toLowerCase();
    if (m === "custom" && this.props.customOffset) return this.props.customOffset;
    if (m === "up")    return new hz.Vec3(0, +d, 0);
    if (m === "down")  return new hz.Vec3(0, -d, 0);
    if (m === "left")  return new hz.Vec3(-d, 0, 0);
    if (m === "right") return new hz.Vec3(+d, 0, 0);
    if (m === "in")    return new hz.Vec3(0, 0, -d);
    if (m === "out")   return new hz.Vec3(0, 0, +d);
    return new hz.Vec3(0, -d, 0);
  }
  private lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
  private ease(t: number) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2; }

  private animate(toOpen: boolean, done?: () => void) {
    if (this.moving) return;
    this.moving = true;

    const target = this.props.door ?? this.entity;
    const from = toOpen ? this.base : this.open;
    const to   = toOpen ? this.open : this.base;
    const durMs = Math.max(10, (this.props.duration || 0.5) * 1000);
    const t0 = Date.now();

    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / durMs);
      const e = this.ease(t);
      target.position.set(new hz.Vec3(
        this.lerp(from.x, to.x, e),
        this.lerp(from.y, to.y, e),
        this.lerp(from.z, to.z, e)
      ));
      if (t >= 1) {
        if (this.timerId !== null) this.async.clearInterval(this.timerId);
        this.timerId = null;
        this.moving = false;
        if (done) done();
      }
    };

    // ✅ ordine corretto: (callback, ms), non (ms, callback)
    this.timerId = this.async.setInterval(tick, 16);
  }

  private openDoor() { this.animate(true,  () => { this.isOpen = true;  }); }
  private closeDoor(){ this.animate(false, () => { this.isOpen = false; }); }
  private scheduleClose() {
    this.async.setTimeout(() => this.closeDoor(), Math.max(0, this.props.closeDelay || 0) * 1000);
  }
}
hz.Component.register(DoorSimpleSlide);
