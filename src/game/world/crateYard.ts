import * as THREE from 'three/webgpu';
import { baseName } from '../../engine/fs/paths';
import { gridCell, type CrateArea, type CrateLook, type CrateSpec } from './crateLayout';
import type { GitWorldLayout } from './gitWorld';
import { Label } from './labels';

const CRATE = 0.7;
const FLIGHT_SECONDS = 0.7;

/** One material per look, shared by every crate that looks that way. */
function createMaterials(): Record<CrateLook, THREE.Material> {
  const wood = (emissive = 0x000000, intensity = 0) =>
    new THREE.MeshStandardMaterial({
      color: 0x6b4a2e,
      roughness: 0.75,
      emissive,
      emissiveIntensity: intensity,
    });
  const ghost = (color: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false });
  return {
    clean: wood(),
    modified: wood(0xffb347, 1.4),
    untracked: new THREE.MeshStandardMaterial({ color: 0x8a93a8, roughness: 0.6 }),
    // Grey and see-through: git is told to look away from these.
    ignored: new THREE.MeshStandardMaterial({
      color: 0x566072,
      roughness: 1,
      transparent: true,
      opacity: 0.75,
    }),
    deleted: ghost(0xff7b7b),
    'staged-new': wood(0x7ee2a8, 0.9),
    'staged-change': wood(0xffb347, 0.7),
    'staged-delete': ghost(0xff7b7b),
  };
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
  arc: number;
}

interface CrateView {
  spec: CrateSpec;
  readonly group: THREE.Group;
  readonly box: THREE.Mesh;
  readonly label: Label;
  look: CrateLook;
  flight: Flight | null;
  /** Set when the crate is on its way out (into the Vault, or just vanishing). */
  leaving: 'vault' | 'fade' | null;
}

/**
 * Draws the working tree and staging area as crates, and animates the difference each
 * time the sandbox changes: `git add` flies a crate from the Workbench to the Loading
 * Dock, `git commit` flies the Dock's crates into the Vault.
 */
export class CrateYard {
  private readonly layout: GitWorldLayout;
  private readonly root = new THREE.Group();
  private readonly materials = createMaterials();
  private readonly geometry = new THREE.BoxGeometry(CRATE, CRATE, CRATE);
  private readonly views = new Map<string, CrateView>();
  private readonly doorMaterial: THREE.MeshStandardMaterial | null;
  private flash = 0;

  constructor(layout: GitWorldLayout, scene: THREE.Scene) {
    this.layout = layout;
    scene.add(this.root);
    this.doorMaterial = layout.vaultDoorMaterial;
    this.addBlocklistSign();
  }

  /** Makes the crates match `specs`. `committed` sends departing Dock crates into the Vault. */
  sync(specs: readonly CrateSpec[], committed: boolean): void {
    const wanted = new Map(specs.map((spec) => [spec.key, spec]));

    for (const [key, view] of this.views) {
      if (wanted.has(key) || view.leaving) continue;
      const intoVault = committed && key.startsWith('dock:');
      view.leaving = intoVault ? 'vault' : 'fade';
      if (intoVault) {
        this.fly(view, this.layout.vaultDoor.clone(), 1.2);
        this.flash = 1;
      }
    }

    for (const spec of specs) {
      const target = this.slotPosition(spec.area, spec.slot);
      let view = this.views.get(spec.key);
      if (view?.leaving) {
        // Back again before it finished leaving (e.g. staged, then unstaged): keep it.
        view.leaving = null;
        view.group.scale.setScalar(1);
      }
      if (!view) {
        view = this.createView(spec);
        // A staged crate starts where its file sits on the Workbench, so it visibly moves.
        const origin =
          this.views.get(`bench:${spec.path}`)?.group.position ??
          target.clone().add(new THREE.Vector3(0, 2.5, 0));
        view.group.position.copy(origin);
        this.fly(view, target, spec.area === 'dock' ? 1.4 : 0);
      } else if (!view.group.position.equals(target) && !view.flight?.to.equals(target)) {
        this.fly(view, target, 0.6);
      }
      this.restyle(view, spec);
    }
  }

  update(dt: number): void {
    for (const [key, view] of this.views) {
      const { flight } = view;
      if (flight) {
        flight.progress = Math.min(1, flight.progress + dt / FLIGHT_SECONDS);
        const eased = 1 - (1 - flight.progress) ** 3;
        view.group.position.lerpVectors(flight.from, flight.to, eased);
        view.group.position.y += Math.sin(Math.PI * flight.progress) * flight.arc;
        if (flight.progress >= 1) view.flight = null;
      }
      if (view.leaving === 'vault') {
        // Shrink while flying in; gone once it reaches the door.
        view.group.scale.setScalar(1 - 0.8 * (view.flight?.progress ?? 1));
        if (!view.flight) this.remove(key, view);
      } else if (view.leaving === 'fade') {
        const next = view.group.scale.x - dt * 3;
        if (next <= 0.01) this.remove(key, view);
        else view.group.scale.setScalar(next);
      }
    }
    if (this.doorMaterial) {
      this.flash = Math.max(0, this.flash - dt * 1.2);
      this.doorMaterial.emissiveIntensity = 0.6 + this.flash * 4;
    }
  }

  private remove(key: string, view: CrateView): void {
    this.root.remove(view.group);
    view.label.dispose();
    this.views.delete(key);
  }

  private createView(spec: CrateSpec): CrateView {
    const group = new THREE.Group();
    const box = new THREE.Mesh(this.geometry, this.materials[spec.look]);
    const label = new Label(baseName(spec.path), { height: 0.26 });
    label.sprite.position.y = 0.62;
    group.add(box, label.sprite);
    group.userData = { path: spec.path, area: spec.area };
    this.root.add(group);
    const view: CrateView = {
      spec,
      group,
      box,
      label,
      look: spec.look,
      flight: null,
      leaving: null,
    };
    this.views.set(spec.key, view);
    return view;
  }

  /** The crate under the pointer, if any (crates on their way out don't count). */
  pick(raycaster: THREE.Raycaster): CrateSpec | null {
    const live = [...this.views.values()].filter((view) => !view.leaving);
    const hit = raycaster.intersectObjects(
      live.map((view) => view.box),
      false,
    )[0];
    return live.find((view) => view.box === hit?.object)?.spec ?? null;
  }

  private restyle(view: CrateView, spec: CrateSpec): void {
    view.spec = spec;
    view.look = spec.look;
    view.box.material = this.materials[spec.look];
    view.group.userData = { path: spec.path, area: spec.area };
    // Untracked crates carry no label (DESIGN.md section 4): git doesn't know their name yet.
    view.label.sprite.visible = spec.look !== 'untracked';
  }

  private fly(view: CrateView, to: THREE.Vector3, arc: number): void {
    view.flight = { from: view.group.position.clone(), to, progress: 0, arc };
  }

  private slotPosition(area: CrateArea, slot: number): THREE.Vector3 {
    if (area === 'bench') {
      const { column, row, layer } = gridCell(slot, 8, 3);
      return this.layout.workbenchTop
        .clone()
        .add(
          new THREE.Vector3(
            -3.08 + column * 0.88,
            CRATE / 2 + layer * (CRATE + 0.04),
            -0.9 + row * 0.9,
          ),
        );
    }
    if (area === 'dock') {
      const { column, row, layer } = gridCell(slot, 4, 3);
      return this.layout.dockTop
        .clone()
        .add(
          new THREE.Vector3(
            -1.45 + column * 0.97,
            CRATE / 2 + layer * (CRATE + 0.04),
            -1 + row * 1,
          ),
        );
    }
    const { column, row, layer } = gridCell(slot, 2, 4);
    return this.layout.blocklistGround
      .clone()
      .add(new THREE.Vector3(column * 0.8, CRATE / 2 + layer * (CRATE + 0.04), -1.2 + row * 0.85));
  }

  private addBlocklistSign(): void {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 2, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x2a3244 }),
    );
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.7, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x2a1a1a,
        emissive: 0xff7b7b,
        emissiveIntensity: 0.35,
      }),
    );
    board.position.y = 1.1;
    const title = new Label('Blocklist · .gitignore', { height: 0.24, color: '#ffb0b0' });
    title.sprite.position.y = 1.9;
    const sign = new THREE.Group();
    sign.add(post, board, title.sprite);
    sign.position.copy(this.layout.blocklistGround).add(new THREE.Vector3(0.4, 1, -2.4));
    this.root.add(sign);
  }
}
