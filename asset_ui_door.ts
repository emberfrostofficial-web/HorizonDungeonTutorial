import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';

class asset_ui_door extends ui.UIComponent<typeof asset_ui_door> {
  static propsDefinition = {
    scrollHeight: { type: hz.PropTypes.Number, default: 320 },
  };

  private pageLabel = new ui.Binding<string>('Page 1/4');
  private pageText  = new ui.Binding<string>('');

  private pageIdx = 0;

  // --- Testi ---
  private readonly P1 = `
DoorSimpleSlide: properties & flow

What it is
A lightweight slide controller for doors. It moves the door 
along one local axis (often vertical) to open/close with a smooth tween.

⚠️ Key note  door must be an Asset
The door field must reference an asset (e.g., DungDoor), 
not a single entity.
Why? The asset includes the 3D mesh + a child trigger. That trigger fires 
on collide and activates the open/close logic. Without an asset, 
children (and thus the trigger) aren't included, so nothing happens.

`;

  private readonly P2 = `
Properties

door (Asset, required): the door prefab, with a child trigger inside.

mode (String): slide direction in local space.
Typical values: "down" to lower, "up" to raise. 
(For lateral slides, rotate the prefab or compensate with the offset.)

distance (Number): travel in meters when opening (e.g., 2.8).

duration (Number): seconds for open/close animation (e.g., 0.6).

armDelay (Number): cooldown after a trigger to prevent spamming 
(e.g., 0.4s).

autoClose (Bool): if ON, the door auto-closes after the delay.

`;

  private readonly P3 = `
closeDelay (Number): seconds before auto-closing (e.g., 2).

customOffset (Vec3 X/Y/Z): additive offset for the closed pose; 
great to fix pivots or bury/lift slightly.

Runtime flow (typical)

The asset's child trigger detects the player = Open: slide 
by distance along mode in duration.

With autoClose ON, after closeDelay (respecting armDelay) =
Close back to the closed pose.

Re-trigger as needed; armDelay keeps it tidy.


  `;

  private readonly P4 = `
Quick tips

No movement? Ensure door points to an asset with a child trigger, 
distance > 0, and the mesh pivot makes sense.

Sideways doors: rotate the prefab or tweak customOffset.

World-level RAG_BA_DoorsDown/Up/Toggle can temporarily sink/raise doors; 
it's separate from DoorSimpleSlide.
  `;

  private setPage(n: number) {
    const clamped = Math.max(0, Math.min(3, n));
    this.pageIdx = clamped;
    this.pageLabel.set(`Page ${this.pageIdx + 1}/4`);
    this.pageText.set(
      this.pageIdx === 0 ? this.P1 :
      this.pageIdx === 1 ? this.P2 :
      this.pageIdx === 2 ? this.P3 : this.P4
    );
  }

  private btn(label: string, onClick: () => void): ui.UINode {
    return ui.Pressable({
      onClick,
      children: ui.Text({ text: label, style: { fontSize: 14, color: new hz.Color(1,1,1) } }),
      style: { padding: 6, margin: 4, backgroundColor: new hz.Color(0.20,0.20,0.20) },
    });
  }

  initializeUI(): ui.UINode {
    this.setPage(0);

    return ui.View({
      children: [
        // Header
        ui.View({
          children: [
            ui.Text({ text: this.pageLabel, style: { fontSize: 18, color: new hz.Color(0,0,0) } }),
          ],
          style: { padding: 6, backgroundColor: new hz.Color(1,1,1) },
        }),

        // Pulsanti piccoli
        ui.View({
          children: [
            this.btn('Prev', () => this.setPage(this.pageIdx - 1)),
            this.btn('1', () => this.setPage(0)),
            this.btn('2', () => this.setPage(1)),
            this.btn('3', () => this.setPage(2)),
            this.btn('4', () => this.setPage(3)),
          ],
          style: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            backgroundColor: new hz.Color(0.10,0.10,0.10),
            padding: 4,
          },
        }),

        // Testo scrollabile
        ui.View({
          children: [
            ui.ScrollView({
              style: {
                height: this.props.scrollHeight,
                padding: 6,
                backgroundColor: new hz.Color(1,1,1),
              },
              children: [
                ui.Text({ text: this.pageText, style: { fontSize: 16, color: new hz.Color(0,0,0) } }),
              ],
            }),
          ],
          style: { backgroundColor: new hz.Color(1,1,1), padding: 6 },
        }),
      ],
      style: { flexDirection: 'column', padding: 8, backgroundColor: new hz.Color(0.9,0.9,0.9) },
    });
  }
}

hz.Component.register(asset_ui_door);


