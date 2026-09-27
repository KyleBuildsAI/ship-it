import * as THREE from 'three/webgpu';
import type { ObjectId } from '../../engine/git/types';
import type { GitWorldLayout } from './gitWorld';
import type { HistorySpec, PlatformSpec } from './historyLayout';
import { Label } from './labels';

const SPACING = 3.1;
const LANE_WIDTH = 3.4;
const RISE = 0.45;
const HOLOGRAM = 0x6fd3ff;

interface PlatformView {
  readonly group: THREE.Group;
  readonly label: Label;
  readonly home: THREE.Vector3;
  lane: 0 | 1;
}

/** Removes and frees a group's meshes; rebuilt every sync, so leaks would add up. */
function disposeChildren(group: THREE.Group, sharedMaterials: readonly THREE.Material[]): void {
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    // instanceof can't recover Mesh's type parameters, so name them for the type checker.
    const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    if (!sharedMaterials.includes(mesh.material)) mesh.material.dispose();
  }
  group.clear();
}

/** Eases a group toward a target position a little each frame. */
function glide(object: THREE.Object3D, target: THREE.Vector3, dt: number, rate = 6): void {
  object.position.lerp(target, Math.min(1, dt * rate));
}

/**
 * The commit path behind the Vault (DESIGN.md section 4): each commit a floating
 * platform, bridges to its parent, a banner per branch, HEAD as a hologram of the
 * player, cracked ground when HEAD is detached, and reflog footprints.
 */
export class CommitPath {
  private readonly layout: GitWorldLayout;
  private readonly root = new THREE.Group();
  private readonly bridges = new THREE.Group();
  private readonly footprints = new THREE.Group();
  private readonly platforms = new Map<ObjectId, PlatformView>();
  private readonly banners = new Map<string, { group: THREE.Group; target: THREE.Vector3 }>();
  private readonly hologram = new THREE.Group();
  private readonly cracks = new THREE.Group();
  private hologramTarget: THREE.Vector3 | null = null;
  private readonly materials = {
    road: new THREE.MeshStandardMaterial({
      color: 0x223049,
      roughness: 0.6,
      emissive: 0x6fd3ff,
      emissiveIntensity: 0.12,
    }),
    side: new THREE.MeshStandardMaterial({
      color: 0x1a1f2b,
      roughness: 0.8,
      transparent: true,
      opacity: 0.55,
    }),
    bridge: new THREE.MeshStandardMaterial({
      color: 0x6fd3ff,
      emissive: 0x6fd3ff,
      emissiveIntensity: 0.9,
    }),
    footprint: new THREE.MeshBasicMaterial({
      color: 0xffcf6b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  };

  constructor(layout: GitWorldLayout, scene: THREE.Scene) {
    this.layout = layout;
    this.root.add(this.bridges, this.footprints, this.hologram, this.cracks);
    scene.add(this.root);
    this.buildHologram();
    this.buildCracks();
  }

  sync(history: HistorySpec | null): void {
    const specs = history?.platforms ?? [];
    const wanted = new Set(specs.map((spec) => spec.id));
    for (const [id, view] of this.platforms) {
      if (wanted.has(id)) continue;
      this.root.remove(view.group);
      view.label.dispose();
      this.platforms.delete(id);
    }
    for (const spec of specs) this.upsertPlatform(spec);

    this.rebuildBridges(specs);
    this.syncBanners(history);
    this.syncHead(history);
    this.rebuildFootprints(history);
  }

  update(dt: number, elapsed: number): void {
    for (const view of this.platforms.values()) glide(view.group, view.home, dt, 3);
    for (const banner of this.banners.values()) glide(banner.group, banner.target, dt);
    if (this.hologramTarget) glide(this.hologram, this.hologramTarget, dt);
    this.hologram.children[0]?.position.set(0, 0.9 + Math.sin(elapsed * 2) * 0.05, 0);
  }

  /** The commit whose platform is under the pointer, if any. */
  pick(raycaster: THREE.Raycaster): ObjectId | null {
    const entries = [...this.platforms.entries()];
    const hit = raycaster.intersectObjects(
      entries.map(([, view]) => view.group),
      true,
    )[0];
    if (!hit) return null;
    const found = entries.find(([, view]) => view.group === hit.object.parent);
    return found ? found[0] : null;
  }

  /** Along the path by depth, rising as it goes; side-lane commits sit off to its right. */
  private positionFor(spec: PlatformSpec): THREE.Vector3 {
    const along = this.layout.pathDirection;
    const right = new THREE.Vector3(-along.z, 0, along.x);
    return this.layout.pathStart
      .clone()
      .addScaledVector(along, spec.depth * SPACING)
      .addScaledVector(right, spec.lane * LANE_WIDTH)
      .setY(this.layout.pathStart.y + spec.depth * RISE);
  }

  private upsertPlatform(spec: PlatformSpec): void {
    const home = this.positionFor(spec);
    const existing = this.platforms.get(spec.id);
    if (existing) {
      existing.home.copy(home);
      if (existing.lane !== spec.lane) {
        existing.lane = spec.lane;
        const slab = existing.group.children[0];
        if (slab instanceof THREE.Mesh)
          slab.material = spec.lane === 0 ? this.materials.road : this.materials.side;
      }
      return;
    }
    const group = new THREE.Group();
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 0.3, 6),
      spec.lane === 0 ? this.materials.road : this.materials.side,
    );
    const label = new Label(spec.label, { height: 0.34 });
    // Above the HEAD hologram's own label, below any branch banner's.
    label.sprite.position.y = 2.15;
    group.add(slab, label.sprite);
    // New commits rise into place from below the path.
    group.position.copy(home).add(new THREE.Vector3(0, -3, 0));
    this.root.add(group);
    this.platforms.set(spec.id, { group, label, home, lane: spec.lane });
  }

  private rebuildBridges(specs: readonly PlatformSpec[]): void {
    disposeChildren(this.bridges, [this.materials.bridge]);
    const link = (from: THREE.Vector3, to: THREE.Vector3) => {
      const length = from.distanceTo(to);
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, length),
        this.materials.bridge,
      );
      bridge.position.copy(from).lerp(to, 0.5);
      bridge.lookAt(to);
      this.bridges.add(bridge);
    };
    for (const spec of specs) {
      const home = this.positionFor(spec);
      const parent =
        spec.parent === null ? undefined : specs.find((candidate) => candidate.id === spec.parent);
      // The first commit connects to the Vault it came out of.
      link(parent ? this.positionFor(parent) : this.layout.vaultDoor.clone().setY(0.6), home);
    }
  }

  private syncBanners(history: HistorySpec | null): void {
    const wanted = new Set(history?.banners.map((banner) => banner.branch) ?? []);
    for (const [branch, banner] of this.banners) {
      if (wanted.has(branch)) continue;
      this.root.remove(banner.group);
      this.banners.delete(branch);
    }
    for (const { branch, commit } of history?.banners ?? []) {
      const platform = this.platforms.get(commit);
      if (!platform) continue;
      const target = platform.home.clone().add(new THREE.Vector3(-0.8, 0.15, -0.5));
      const existing = this.banners.get(branch);
      if (existing) {
        existing.target = target;
        continue;
      }
      const group = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xc9d4e8 }),
      );
      pole.position.y = 1.1;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshStandardMaterial({
          color: 0x7ee2a8,
          emissive: 0x7ee2a8,
          emissiveIntensity: 1.1,
          side: THREE.DoubleSide,
        }),
      );
      flag.position.set(0.47, 1.9, 0);
      const label = new Label(branch, { height: 0.24, color: '#7ee2a8' });
      label.sprite.position.y = 2.5;
      group.add(pole, flag, label.sprite);
      group.position.copy(target).add(new THREE.Vector3(0, 3, 0));
      this.root.add(group);
      this.banners.set(branch, { group, target });
    }
  }

  private syncHead(history: HistorySpec | null): void {
    const commit = history?.head.commit ?? null;
    const platform = commit === null ? undefined : this.platforms.get(commit);
    this.hologram.visible = platform !== undefined;
    this.cracks.visible = platform !== undefined && history?.head.detached === true;
    if (!platform) {
      this.hologramTarget = null;
      return;
    }
    this.hologramTarget = platform.home.clone().add(new THREE.Vector3(0.4, 0.15, 0.3));
    if (this.hologram.position.lengthSq() === 0) this.hologram.position.copy(this.hologramTarget);
    this.cracks.position.copy(platform.home).add(new THREE.Vector3(0, 0.16, 0));
  }

  private rebuildFootprints(history: HistorySpec | null): void {
    disposeChildren(this.footprints, [this.materials.footprint]);
    const prints = history?.footprints ?? [];
    prints.slice(1).forEach((commit, age) => {
      const platform = this.platforms.get(commit);
      if (!platform) return;
      const material = this.materials.footprint.clone();
      // Older footprints fade, the way the reflog's older entries matter less.
      material.opacity = Math.max(0.2, 0.85 - age * 0.12);
      for (const side of [-0.14, 0.14]) {
        const print = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), material);
        print.rotation.x = -Math.PI / 2;
        print.scale.set(1, 1.8, 1);
        print.position
          .copy(platform.home)
          .add(new THREE.Vector3(side - 0.3, 0.17, 0.4 - age * 0.05));
        this.footprints.add(print);
      }
    });
  }

  private buildHologram(): void {
    const material = new THREE.MeshBasicMaterial({
      color: HOLOGRAM,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 6, 12), material);
    const label = new Label('HEAD', { height: 0.26, color: '#6fd3ff' });
    label.sprite.position.y = 1.62;
    this.hologram.add(body, label.sprite);
    this.hologram.visible = false;
  }

  private buildCracks(): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0xff5a5a,
      emissive: 0xff5a5a,
      emissiveIntensity: 1.6,
    });
    const zigzag = [
      [-0.8, 0.2, 0.5, 0.3],
      [-0.3, -0.1, 0.45, -0.6],
      [0.1, 0.3, 0.4, 0.5],
      [0.5, -0.2, 0.5, -0.4],
    ] as const;
    for (const [x, z, length, angle] of zigzag) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(length, 0.02, 0.04), material);
      crack.position.set(x, 0, z);
      crack.rotation.y = angle;
      this.cracks.add(crack);
    }
    this.cracks.visible = false;
  }
}
