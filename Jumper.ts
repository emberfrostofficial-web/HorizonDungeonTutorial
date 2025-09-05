import { CodeBlockEvents, Component, Player, PropTypes, Vec3, Entity } from 'horizon/core';

class Jumper extends Component<typeof Jumper> {
  static propsDefinition = {
    trigger: { type: PropTypes.Entity }, // (opz) se non settato usa this.entity
    autoJump: { type: PropTypes.Boolean, default: true },
    jumpForce: { type: PropTypes.Number, default: 8 },
    defaultJumpSpeed: { type: PropTypes.Number, default: 4.3 },
    gravityAdjust: { type: PropTypes.Number, default: 0.7 },
    defaultGravity: { type: PropTypes.Number, default: 9.81 }
  };

  private clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

  start() {
    const trg: Entity = this.props.trigger ?? this.entity;

    // ENTER
    this.connectCodeBlockEvent(
      trg,
      CodeBlockEvents.OnPlayerEnterTrigger,
      (player: Player) => {
        const g = this.clamp(this.props.gravityAdjust ?? 0.7, 0.1, 3);
        player.gravity.set(g);

        const jf = this.clamp(this.props.jumpForce ?? 8, 0, 50);

        if (this.props.autoJump) {
          // spinta verso l’alto istantanea
          const dirUp = new Vec3(0, 1, 0);
          player.velocity.set(dirUp.mul(jf));
        } else {
          // alza solo la velocità di salto “normale”
          player.jumpSpeed.set(jf);
        }
      }
    );

    // EXIT → ripristina
    this.connectCodeBlockEvent(
      trg,
      CodeBlockEvents.OnPlayerExitTrigger,
      (player: Player) => {
        player.gravity.set(this.props.defaultGravity ?? 9.81);
        player.jumpSpeed.set(this.props.defaultJumpSpeed ?? 4.3);
      }
    );
  }
}

Component.register(Jumper);
