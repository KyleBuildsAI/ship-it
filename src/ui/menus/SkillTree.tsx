import { actSummaries, recommendedAct } from '../../game/play/catalog';
import { nodeLabel, nodeNote, skillTree, type SkillNode } from '../../game/play/skillTree';
import type { SaveData } from '../../game/save/schema';

/** A node's state as a shape: a ring, dashed, solid or filled. A final is a diamond. */
function NodeDot({ node }: { node: SkillNode }) {
  const final = node.kind === 'final' ? ' skill-dot--final' : '';
  return <span className={`skill-dot skill-dot--${node.state}${final}`} aria-hidden="true" />;
}

/**
 * The skill tree (DESIGN.md section 6): a row per Act, a node per part. It reads summaries
 * and the save only, so opening the Trophy Wall never downloads an Act.
 */
export function SkillTree({ save }: { save: SaveData }) {
  const branches = skillTree(actSummaries(), save);
  // One row starts open, so the wall stays short: the Act the player is offered first.
  const openAct = recommendedAct(save);
  return (
    <section className="skill-tree" aria-label="Skill tree">
      <p className="play-panel__eyebrow">Skill tree</p>
      <p className="skill-tree__rule">
        A mission lights at 9 of its last 10 drills right. A lesson lights at ★★★.
      </p>
      {branches.map((branch) => (
        <details key={branch.act} className="skill-branch" open={branch.act === openAct}>
          <summary>
            <span className="skill-branch__title">{`Act ${String(branch.act)} · ${branch.title}`}</span>
            <span className="skill-branch__count">
              {`${String(branch.lit)} of ${String(branch.nodes.length)} lit`}
            </span>
          </summary>
          <ol className="skill-nodes">
            {branch.nodes.map((node) => (
              <li key={node.id} className={`skill-node skill-node--${node.state}`}>
                <NodeDot node={node} />
                <span className="skill-node__text">
                  {nodeLabel(node)}
                  <small>{nodeNote(node)}</small>
                </span>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}
