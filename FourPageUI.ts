import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';

class FourPageUI extends ui.UIComponent<typeof FourPageUI> {
  static propsDefinition = {
    scrollHeight: { type: hz.PropTypes.Number, default: 320 },
  };

  private pageLabel = new ui.Binding<string>('Page 1/4');
  private pageText  = new ui.Binding<string>('');

  private pageIdx = 0;

  // --- Testi ---
  private readonly P1 = `Simply Dungeon Creator — Quick Start Guide

Welcome to Simply Dungeon Creator. With this asset, you can quickly build semi‑procedural rooms and full dungeons.
Core concepts
Anchor Points (Empty Objects): invisible reference markers that define the exact position of every asset to be spawned. There is a dedicated Anchor Point for each object type that appears in‑game.
Required assets: walls, floors, ceilings, door‑walls, pillars, and connection corridors.
How it works
Anchor Points are arranged to reconstruct, via spawning, the linked mesh and automatically reassemble the room. The system supports 3D variants of your models so you can get different results while keeping the same base layout.

`;

  private readonly P2 = `Room types

Cubic room: uses 4 main Anchor Points.

Rectangular room: uses 6 main Anchor Points.

Important: Do not rotate the cubic or rectangular room assets. Rotation can cause placement errors. If you need to orient the whole set, rotate the parent container instead.

Semi‑procedural generation (Seed)

Generation is controlled randomness driven by a seed:

Set the seed value (text or number) in the asset properties.

Changing the seed changes the combination of elements, and therefore the look of the room/dungeon.

Each room is customizable through the seed and additional script parameters.
`;

  private readonly P3 = `From rooms to a dungeon

By connecting multiple rooms via their corresponding Anchor Points (including those for corridors), you build the complete dungeon. The system provides different Anchor Point types—one for each object or object group to spawn. The scripts’ documentation lists every Anchor and its properties in detail.

Best practices

Keep Anchor Points aligned with their reference meshes.

Avoid rotating room assets; use a parent object for global orientation.

Leverage model variants to diversify rooms quickly.

Tweak the seed to generate different layouts from the same configuration.

With these principles, you can create consistent rooms and link them together to form your dungeon—balancing control and variety by the seed system and Anchor Points.`;

  private readonly P4 = `We’ll tackle the script with all its parameters shortly! It may look difficult, but it isn’t—just simple rules! `;

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

hz.Component.register(FourPageUI);
