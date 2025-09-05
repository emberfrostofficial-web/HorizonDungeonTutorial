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
CorridorAnchor: properties & flow

Purpose
Handles a single corridor anchor (open/closed) with mesh variants. 
Meant for manually linking rooms while keeping choices consistent 
(deterministic) when needed.

Local seed for variants

gridX, gridY (Number): optional grid coordinates. Contribute 
to the seed used for picking open/closed variants.

dir (Number, 0..3): corridor direction (0=N, 1=E, 2=S, 3=W). 
Part of the seed.

priority (Number): external ordering/conflict resolution 
(not used internally here, handy for higher-level systems).

Random modes

randomizeMode ("deterministic" | "per_refresh"): 
how to pick the OPEN variant.

deterministic: same gridX/gridY/dir = same variant.

per_refresh: changes at every refresh (explore options fast).


`;

  private readonly P2 = `
Corridor state

openCorridor (Boolean): checked = open; unchecked = closed.
The script watches this flag and respawns automatically.

Assets

Open: openVar1, openVar2, openVar3 (at least one).

Closed: two ways

Variants: closedVar1, closedVar2, closedVar3 (at least one).

Single cap: closedCap 
(fallback used when closed variants are not set).

OPEN controls

randomizeMeshOpen (Bool): ON = pick via seed/mode; OFF = force index.

forceOpenIndex (1..3): forced index when randomizeMeshOpen is OFF.

CLOSED controls

randomizeMeshClosed (Bool): ON = pick via seed/mode; OFF = force index.

forceClosedIndex (1..3): forced index when randomizeMeshClosed is OFF.

randomizeClosedMode ("deterministic" | "per_refresh"): 
random mode for closed 

(same logic as randomizeMode, with a different salt so 
open/closed don't collide).


`;

  private readonly P3 = `
Lifecycle / QoL

spawnOnStart (Bool): if ON, spawns on start.

pollMs (Number): editor polling interval (ms) to detect live 
changes to openCorridor.

debug (Bool): helpful logs (missing assets, spawn result, etc.).

Public API (for other scripts)

setDoorPresent(bool): set OPEN/CLOSED at runtime (queues a refresh).

isDoorPresent(): read current state.

How the variant is chosen (quick)

Builds a seed from gridX, gridY, dir (+ a salt for closed).
  `;

  private readonly P4 = `
If per_refresh, mixes in an internal tick to change the pick each refresh.

With randomizeMesh* OFF, it uses the forced 1..3 index.

If no valid assets: for closed it tries closedCap; otherwise nothing 
spawns and it logs (when debug).

Operational flow

On start (or when openCorridor changes) = refreshSpawn().

Despawn previous, pick correct asset (open/closed) = world.spawnAsset() at 
the anchor's position/rotation.

Track spawned entities for later cleanup.

Quick tips

Need exploratory variety? Use per_refresh while designing, then switch 
to deterministic.

No closed variants? Just set closedCap and you're good.

Align forced indices with your meshes (e.g., 1=straight, 2=arched, 3=broken).
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
