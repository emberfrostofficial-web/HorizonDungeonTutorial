import * as hz from "horizon/core";

type Ease = "linear" | "inOutSine";

function easeValue(t: number, mode: Ease): number {
  if (mode === "inOutSine") return -(Math.cos(Math.PI * t) - 1) / 2;
  return t;
}

export default class DoorSimpleSlide extends hz.Component<typeof DoorSimpleSlide> {
  static propsDefinition = {
    // Zona di trigger (Gizmo "Trigger Zone" o altro entity che emette OnPlayerEnter/ExitTrigger)
    trigger: { type: hz.PropTypes.Entity },

    // Di quanto deve scorrere la porta quando si apre (world space)
    openOffset: { type: hz.PropTypes.Vec3, default: hz.Vec3.zero },

    // secondi di animazione
    duration: { type: hz.PropTypes.Number, default: 1.0 },

    // Richiudi quando il player esce dal trigger?
    autoClose: { type: hz.PropTypes.Boolean, default: true },

    // Attendi un po’ prima di richiudere
    closeDelay: { type: hz.PropTypes.Number, default: 0.0 },

    // easing
    easing: { type: hz.PropTypes.String, default: "inOutSine" as Ease },

    // Se vuoi invertire l’asse, basta mettere valori negativi in openOffset
  };

  private startPos: hz.Vec3 = hz.Vec3.zero;
  private targetPosOpen: hz.Vec3 = hz.Vec3.zero;

  private animFrom: hz.Vec3 = hz.Vec3.zero;
  private animTo: hz.Vec3 = hz.Vec3.zero;
  private animTime = 0;
  private animDur = 1;
  private isAnimating = false;

  private wantOpen = false;
  private closeTimer: number = -1;

  start() {
    // La porta parte da qui
    this.startPos = this.entity.position.get();
    this.targetPosOpen = hz.Vec3.add(this.startPos, this.props.openOffset || hz.Vec3.zero);

    const trig = this.props.trigger;
    if (trig) {
      // Player entra → apri
      this.connectCodeBlockEvent(trig, hz.CodeBlockEvents.OnPlayerEnterTrigger, (_player: hz.Player) => {
        this.open();
      });

      // Player esce → eventualmente chiudi
      this.connectCodeBlockEvent(trig, hz.CodeBlockEvents.OnPlayerExitTrigger, (_player: hz.Player) => {
        if (this.props.autoClose) {
          if (this.closeTimer >= 0) this.async.clearTimeout(this.closeTimer);
          const delayMs = Math.max(0, (this.props.closeDelay || 0)) * 1000;
          this.closeTimer = this.async.setTimeout(() => { this.close(); }, delayMs);
        }
      });
    }
  }

  // Chiamabile anche da altri script/eventi se vuoi
  open() {
    this.wantOpen = true;
    if (this.closeTimer >= 0) { this.async.clearTimeout(this.closeTimer); this.closeTimer = -1; }
    this.startAnim(this.entity.position.get(), this.targetPosOpen, this.props.duration || 1.0);
  }

  close() {
    this.wantOpen = false;
    this.startAnim(this.entity.position.get(), this.startPos, this.props.duration || 1.0);
  }

  private startAnim(from: hz.Vec3, to: hz.Vec3, seconds: number) {
    this.animFrom = from;
    this.animTo = to;
    this.animTime = 0;
    this.animDur = Math.max(0.0001, seconds);
    this.isAnimating = true;
  }

  update(dt: number) {
    if (!this.isAnimating) return;
    this.animTime += dt;
    const tRaw = Math.min(1, this.animTime / this.animDur);
    const t = easeValue(tRaw, (this.props.easing as Ease) || "inOutSine");
    const cur = hz.Vec3.lerp(this.animFrom, this.animTo, t);
    this.entity.position.set(cur);
    if (tRaw >= 1) this.isAnimating = false;
  }
}

hz.Component.register(DoorSimpleSlide);
