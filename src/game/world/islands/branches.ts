import * as THREE from 'three/webgpu';
import { phase, type Beat } from '../beatPlayer';
import type { BeatId } from '../beats';
import {
  createStage,
  part,
  popIn,
  remember,
  segment,
  slide,
  type Palette,
  type Props,
  type Stage,
} from './kit';

/*
 * Act 3's island: a trunk path (main) that splits into two branches, commits along each,
 * one merging back. Its beats act out the lesson cards on that same graph: a branch grows,
 * HEAD hops, main's pointer slides forward, two edits clash.
 */

const NODE_Y = 0.3;
/** How high a branch's pointer floats over its commit. */
const TIP_Y = 0.8;
const NODE = new THREE.SphereGeometry(0.32, 20, 14);
const HEAD_RING = new THREE.TorusGeometry(0.42, 0.07, 10, 32);
const FLAG_POLE = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8);
const FLAG = new THREE.BoxGeometry(0.6, 0.36, 0.04);

/** A point on the island floor at commit height. */
const at = (x: number, z: number, y = NODE_Y) => new THREE.Vector3(x, y, z);

/** Where the graph's parts sit, so the beats can build on it. */
const MAIN_TIP = at(6, 2);
const HOTFIX_BASE = at(0, 2);
const HOTFIX_TIP = at(2, 5);
/** Where main's next commit lands when a beat adds one: just past its tip. */
const MAIN_NEXT = at(8.5, 2);
/** Where a merge commit lands, between main's tip and the hotfix branch. */
const MERGE_POINT = at(7, 4.4);

/** The parts of the idle graph that beats move. */
interface Graph {
  readonly mainTip: THREE.Mesh;
  readonly hotfixTip: THREE.Mesh;
  readonly hotfixNode: THREE.Mesh;
  readonly hotfixPath: THREE.Mesh;
  /** Main's commits, oldest first. */
  readonly mainNodes: readonly THREE.Mesh[];
}

/** The pointer's spot over a commit: a branch name is a label floating over its commit. */
function above(point: THREE.Vector3): THREE.Vector3 {
  return at(point.x, point.z, TIP_Y);
}

/** A beat's run that, on reset, clears the stage and puts the moved parts back. */
function run(
  stage: Stage,
  moved: readonly THREE.Mesh[],
  frame: (progress: number) => void,
): ReturnType<Beat['start']> {
  const restores = moved.map(remember);
  return {
    frame,
    reset: () => {
      stage.clear();
      restores.forEach((restore) => {
        restore();
      });
    },
  };
}

function act3Beats(stage: Stage, graph: Graph, colors: Palette): Record<BeatId<'act3'>, Beat> {
  const node = (point: THREE.Vector3, material: THREE.Material) => {
    const mesh = stage.part(NODE, material, point.x, point.y, point.z);
    mesh.visible = false;
    return mesh;
  };
  const path = (from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material = colors.base) => {
    const stick = stage.segment(from, to, material);
    stick.grow(0);
    return stick;
  };

  /** Two paths reaching for the merge point, from main's tip and the hotfix's tip. */
  const towardMerge = (material: THREE.Material) => ({
    fromMain: path(MAIN_TIP, MERGE_POINT, material),
    fromHotfix: path(HOTFIX_TIP, MERGE_POINT, material),
  });

  return {
    // A new branch: a path grows out of main, a commit lands on it, its pointer appears.
    'branch-splits': {
      seconds: 2.2,
      start: () => {
        const end = at(8, 5);
        const stick = path(MAIN_TIP, end, colors.glow);
        const commit = node(end, colors.light);
        const pointer = node(above(end), colors.glow);
        return run(stage, [], (progress) => {
          stick.grow(phase(progress, 0, 0.5));
          popIn(commit, phase(progress, 0.4, 0.7));
          popIn(pointer, phase(progress, 0.65, 1), 0.7);
        });
      },
    },
    // A commit lands where HEAD is, and the branch's pointer moves up to it.
    'commit-on-branch': {
      seconds: 2.2,
      start: () => {
        const next = at(4, 6.5);
        const stick = path(HOTFIX_TIP, next);
        const commit = node(next, colors.light);
        return run(stage, [graph.hotfixTip], (progress) => {
          stick.grow(phase(progress, 0, 0.45));
          popIn(commit, phase(progress, 0.3, 0.6));
          slide(graph.hotfixTip, above(HOTFIX_TIP), above(next), phase(progress, 0.55, 1), 0.6);
        });
      },
    },
    // HEAD, the ring, hops from main's pointer to the branch's: switching moves only HEAD.
    'switch-branch': {
      seconds: 2.4,
      start: () => {
        const head = stage.part(HEAD_RING, colors.light, MAIN_TIP.x, 1.6, MAIN_TIP.z);
        head.rotation.x = Math.PI / 2;
        const from = at(MAIN_TIP.x, MAIN_TIP.z, 1.6);
        const to = at(HOTFIX_TIP.x, HOTFIX_TIP.z, 1.6);
        return run(stage, [], (progress) => {
          popIn(head, phase(progress, 0, 0.3));
          slide(head, from, to, phase(progress, 0.35, 1), 1.4);
        });
      },
    },
    // Main has nothing new, so merging just slides its pointer up the branch's commits.
    'fast-forward': {
      seconds: 2.6,
      start: () => {
        const ahead = [at(6, 4), at(6, 6)];
        const sticks = [
          path(MAIN_TIP, ahead[0] ?? MAIN_TIP),
          path(ahead[0] ?? MAIN_TIP, ahead[1] ?? MAIN_TIP),
        ];
        const commits = ahead.map((point) => node(point, colors.glow));
        const last = ahead[1] ?? MAIN_TIP;
        return run(stage, [graph.mainTip], (progress) => {
          const shown = phase(progress, 0, 0.3);
          sticks.forEach((stick) => {
            stick.grow(shown);
          });
          commits.forEach((commit) => {
            popIn(commit, shown, 0.85);
            // Once main's pointer reaches them, they're main's commits too.
            commit.material = progress >= 1 ? colors.light : colors.glow;
          });
          slide(graph.mainTip, above(MAIN_TIP), above(last), phase(progress, 0.4, 1), 0.3);
        });
      },
    },
    // Both lines changed, so git ties them with a new commit that has two parents.
    'merge-commit': {
      seconds: 2.6,
      start: () => {
        const { fromMain, fromHotfix } = towardMerge(colors.glow);
        const merge = node(MERGE_POINT, colors.glow);
        return run(stage, [graph.mainTip], (progress) => {
          const reach = phase(progress, 0, 0.55);
          fromMain.grow(reach);
          fromHotfix.grow(reach);
          popIn(merge, phase(progress, 0.5, 0.75), 1.3);
          slide(graph.mainTip, above(MAIN_TIP), above(MERGE_POINT), phase(progress, 0.6, 1), 0.5);
        });
      },
    },
    // The branch's commit is replayed onto main's tip as a new commit; the old one fades.
    'rebase-replay': {
      seconds: 2.8,
      start: () => {
        const landing = at(8.5, 4);
        const stick = path(MAIN_TIP, landing);
        const copy = node(HOTFIX_TIP, colors.glow);
        return run(stage, [graph.hotfixTip, graph.hotfixNode, graph.hotfixPath], (progress) => {
          popIn(copy, phase(progress, 0, 0.2));
          slide(copy, HOTFIX_TIP, landing, phase(progress, 0.15, 0.7), 2);
          stick.grow(phase(progress, 0.5, 0.8));
          slide(graph.hotfixTip, above(HOTFIX_TIP), above(landing), phase(progress, 0.6, 1), 1);
          // The old commit is left behind, unreachable: it dims instead of vanishing.
          const faded = progress >= 0.7;
          graph.hotfixNode.material = faded ? colors.dark : colors.light;
          graph.hotfixPath.material = faded ? colors.dark : colors.base;
        });
      },
    },
    // Two commits changed the same lines: the paths meet, stop short, and flash red.
    'conflict-clash': {
      seconds: 2.6,
      start: () => {
        const { fromMain, fromHotfix } = towardMerge(colors.base);
        const stopAt = 0.78;
        const mainEnd = new THREE.Vector3().lerpVectors(MAIN_TIP, MERGE_POINT, stopAt);
        const hotfixEnd = new THREE.Vector3().lerpVectors(HOTFIX_TIP, MERGE_POINT, stopAt);
        const clashes = [node(mainEnd, colors.alert), node(hotfixEnd, colors.alert)];
        return run(stage, [], (progress) => {
          const reach = phase(progress, 0, 0.5) * stopAt;
          fromMain.grow(reach);
          fromHotfix.grow(reach);
          const shake =
            progress < 1 ? Math.sin(progress * 60) * 0.08 * phase(progress, 0.6, 0.8) : 0;
          clashes.forEach((clash, index) => {
            popIn(clash, phase(progress, 0.45, 0.65), 0.8);
            clash.position.x = (index === 0 ? mainEnd : hotfixEnd).x + shake;
          });
        });
      },
    },
    // Only the fix is copied: a twin of the branch's commit lands on main, the branch stays.
    'cherry-pick': {
      seconds: 2.6,
      start: () => {
        const stick = path(MAIN_TIP, MAIN_NEXT);
        const copy = node(HOTFIX_TIP, colors.glow);
        return run(stage, [graph.mainTip], (progress) => {
          popIn(copy, phase(progress, 0, 0.2));
          slide(copy, HOTFIX_TIP, MAIN_NEXT, phase(progress, 0.15, 0.7), 2);
          stick.grow(phase(progress, 0.5, 0.8));
          slide(graph.mainTip, above(MAIN_TIP), above(MAIN_NEXT), phase(progress, 0.7, 1), 0.3);
        });
      },
    },
    // Deleting a branch removes its pointer. The commit it pointed at is still there.
    'branch-deleted': {
      seconds: 1.8,
      start: () =>
        run(stage, [graph.hotfixTip], (progress) => {
          const gone = phase(progress, 0, 0.8);
          graph.hotfixTip.scale.setScalar(Math.max(0.001, 0.7 * (1 - gone)));
          graph.hotfixTip.visible = gone < 1;
        }),
    },
    // A tag names one commit for good: a flag goes up on main's tip, the release.
    'tag-release': {
      seconds: 1.8,
      start: () => {
        const flag = new THREE.Group();
        flag.add(
          stage.part(FLAG_POLE, colors.light, 0, 0.7, 0),
          stage.part(FLAG, colors.glow, 0.32, 1.2, 0),
        );
        flag.position.set(MAIN_TIP.x - 0.5, NODE_Y, MAIN_TIP.z);
        flag.visible = false;
        stage.add(flag);
        return run(stage, [], (progress) => {
          popIn(flag, phase(progress, 0, 0.7));
        });
      },
    },
    // Bisect halves the suspects each step: main's commits light up, then half are cleared
    // at a time until one, the culprit, is left glowing red.
    'bisect-search': {
      seconds: 3,
      start: () => {
        const nodes = graph.mainNodes;
        const culprit = 3;
        // After each test, which commits are still suspects.
        const steps = [[0, 1, 2, 3, 4], [2, 3, 4], [3, 4], [3]];
        return run(stage, nodes, (progress) => {
          const step = steps[Math.min(steps.length - 1, Math.floor(progress * steps.length))] ?? [];
          nodes.forEach((node, index) => {
            const suspect = step.includes(index);
            const found = progress >= 1 && index === culprit;
            node.material = found ? colors.alert : suspect ? colors.glow : colors.light;
          });
        });
      },
    },
  };
}

/** Act 3: a trunk path that splits into two branches, commits along each, one merging back. */
export function branches(colors: Palette): Props {
  const group = new THREE.Group();
  const main = [-6, -3, 0, 3, 6].map((x) => at(x, 2));
  const feature = [at(-3, 2), at(-1, -1.5), at(1.5, -1.5), at(3, 2)];
  const hotfix = [HOTFIX_BASE, HOTFIX_TIP];
  const paths: THREE.Mesh[] = [];
  for (const line of [main, feature, hotfix]) {
    line.slice(1).forEach((point, index) => {
      const stick = segment(line[index] ?? point, point, colors.base);
      paths.push(stick.mesh);
      group.add(stick.mesh);
    });
  }
  const nodes = [...main, ...feature.slice(1, 3), ...hotfix.slice(1)].map((point) => {
    const mesh = part(NODE, colors.light, point.x, point.y, point.z);
    group.add(mesh);
    return mesh;
  });
  // The branch tips glow: that's where HEAD could point.
  const tips = [MAIN_TIP, HOTFIX_TIP].map((point) => {
    const tip = part(NODE, colors.glow, point.x, TIP_Y, point.z);
    tip.scale.setScalar(0.7);
    group.add(tip);
    return tip;
  });
  const [mainTip, hotfixTip] = tips;
  const hotfixNode = nodes.at(-1);
  const hotfixPath = paths.at(-1);
  if (!mainTip || !hotfixTip || !hotfixNode || !hotfixPath) {
    throw new Error('The branches island lost a part of its graph.');
  }
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      tips.forEach((tip, index) => {
        tip.position.y = TIP_Y + Math.sin(elapsed * 2 + index) * 0.12;
      });
    },
    beats: act3Beats(
      stage,
      { mainTip, hotfixTip, hotfixNode, hotfixPath, mainNodes: nodes.slice(0, main.length) },
      colors,
    ),
  };
}
