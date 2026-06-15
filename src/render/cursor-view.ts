// Ground-projected aim cursor (reticle). Reads the player's world aim point so
// mouse aiming feels and reads right. Pure view (V2).

import { Group, Mesh, RingGeometry, MeshBasicMaterial, type Scene } from 'three';
import type { Player } from '../sim/player';
import { COL } from './art/palette';

export class CursorView {
  readonly group: Group;

  constructor(scene: Scene) {
    this.group = new Group();
    const color = COL.kineticGold;
    const ring = new Mesh(
      new RingGeometry(0.55, 0.75, 32),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const dot = new Mesh(
      new RingGeometry(0, 0.12, 16),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.6, toneMapped: false }),
    );
    dot.rotation.x = -Math.PI / 2;
    this.group.add(ring, dot);
    this.group.position.y = 0.06;
    this.group.visible = false;
    scene.add(this.group);
  }

  sync(player: Player): void {
    this.group.visible = player.aim.has;
    if (player.aim.has) this.group.position.set(player.aim.x, 0.06, player.aim.z);
  }
}
