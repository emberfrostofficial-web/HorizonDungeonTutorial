import * as hz from 'horizon/core';

import { AudioGizmo, CodeBlockEvents , SpawnPointGizmo , Component, Entity, EventSubscription, ParticleGizmo, Player, PlayerDeviceType, PropTypes, Vec3 } from 'horizon/core';
class Respawner extends hz.Component<typeof Respawner> {
  static propsDefinition = {

    Respawn_player: {type: PropTypes.Entity},
    //optional_effect_VFX: { type: hz.PropTypes.Entity }
  };

  start() {

    this.connectCodeBlockEvent(
      this.entity,
      hz.CodeBlockEvents.OnPlayerEnterTrigger,
      (player: Player) => {
      
         
          // Esegue il suono
          this.props.Respawn_player?.as(SpawnPointGizmo)?.teleportPlayer(player);
          //this.props.optional_effect_VFX?.as(ParticleGizmo)?.play();

          
        }

      
    );

  }
}
hz.Component.register(Respawner);