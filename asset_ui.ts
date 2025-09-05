import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';

class asset_ui extends ui.UIComponent<typeof asset_ui> {
  static propsDefinition = {
    scrollHeight: { type: hz.PropTypes.Number, default: 320 },
  };

  private pageLabel = new ui.Binding<string>('Page 1/4');
  private pageText  = new ui.Binding<string>('');

  private pageIdx = 0;

  // --- Testi ---
  private readonly P1 = `
seed = Base string for the deterministic RNG. If empty, it uses seedBase. 
Changing it yields different but repeatable layouts.

seedMode = "manual" | "per_entity" | "per_generate"

manual: same seed = same results on every Generate.

per_entity: same seed for the scene but different per entity (adds |EID:<id>).

per_generate: every Generate call creates a new variant 
(non-deterministic across runs).

seedBase
Fallback used when seed is empty.

seedSalt
Optional salt (|<salt>) to differentiate instances with the same seed without 
touching seed/seedBase.

autoGenerateOnStart
If enabled, calls generate() in start(). Handy for instant preview.




`;

  private readonly P2 = `
Doors — randomization rules

doorMode = "manual" | "manual_count" | "auto_pairs2" |
| "auto_total" | "auto_chance"

manual: places a door only on sides that have an Anchor_Door_.

manual_count: ignores per-side selection and chooses an exact number of sides 
(see doorManualCount) from candidates that have a door anchor.

auto_pairs2: picks a total number of sides (see autoDoorsCount),
trying opposite pairs when possible.

auto_total: draws a random number between doorMin and doorMax 
and places them coherently.

auto_chance: for each candidate side, creates 
a door with probability doorChance.

autoDoorsCount
Amount to place in auto_pairs2.

preferOpposites
If true, prefers N / S or E / W pairs when possible 
(useful for linear corridors).

doorChance
Probability (0..1) used by auto_chance.

doorMin / doorMax
Range used by auto_total for the number of doors. With the defaults 
(1..4) you ensure at least one door.

doorManualCount
How many doors to place in manual_count.

doorEnsureAtLeastOne
If enabled, guarantees at least one door when random choices would
yield zero (applies to manual_count and auto_chance).
`;

  private readonly P3 = `
  Objects — global randomization rules
(We are talking about global count/range/chance, not individual slots;
the slots are covered in the “OBJECT SLOTS” block.)

objectsMode = "manual" | "manual_count" | "auto_total" | "auto_chance"
Logic mirrors the doors but applies to enabled object slots.

objectsManualCount
Number of slots to use in manual_count.

objectsMin / objectsMax
Range of slots to use in auto_total.

objectsChance
Probability (0..1) to include each slot in auto_chance.

objectsEnsureAtLeastOne
If enabled, ensures at least one object when the selection 
would otherwise be empty.

  `;

  private readonly P4 = `
  Practical examples
(1) In Inspector:

seed: (leave empty)

seedBase: ProjectTheme-01

seedSalt: room1=A, room2=B, room3=C…

seedMode: per_entity

Effect: all rooms “look alike” (same theme), but each is consistently different.

2) A specific room that must not change

seed: BossRoom-Seed-77 (set)

seedBase: anything (ignored for that room)

seedSalt: empty (or a detail if you need it)

seedMode: manual (or per_entity if you want only the ID to affect it)

Effect: that room stays identical across regenerations.

3) Iterate until you find a layout you like

seedMode: per_generate

seed: empty (uses seedBase)

Press Generate until you like it; then switch to manual or per_entity 
and copy the seedBase/seed so you “lock in” the result.

Advanced notes 

In short: when to change what

I want a consistent “global theme” = set seedBase, leave seed empty.

I want to differentiate two sibling instances = change seedSalt.

I want to lock an exact room = set seed (ignores seedBase) and use manual/per_entity.

I want to “shuffle” on each regeneration = per_generate (just for exploring/iterating).

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

hz.Component.register(asset_ui);
