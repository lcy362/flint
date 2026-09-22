import { describe, expect, it } from 'vitest';
import type { AgentSkillRow } from '../src/core/agents.js';
import { agentCards } from '../src/domain/cards.js';

/** 造一行 Agent 技能行：默认是「指向库外的外部软链」 */
function row(over: Partial<AgentSkillRow> = {}): AgentSkillRow {
  return {
    name: 'alpha',
    source: 'managed',
    wanted: false,
    present: true,
    store: 'symlink',
    reason: 'external',
    ...over,
  };
}

const kinds = (over: Partial<AgentSkillRow>) => agentCards([row(over)])[0].actions.map((a) => a.kind);

describe('Agent 技能行的操作推导（acts）', () => {
  it('指向库外且仓库没有同名副本的软链：提供「归集到仓库」与「移除」', () => {
    expect(kinds({ alreadyInLibrary: false })).toEqual(['collect', 'delete']);
  });

  it('已有归属的软链（目标落在已登记库内，或仓库里已有同名副本）：不再提供归集，只保留移除', () => {
    expect(kinds({ alreadyInLibrary: true })).toEqual(['delete']);
  });

  it('自带真实目录不受影响：本体在本地，收进仓库才有意义', () => {
    expect(kinds({ reason: 'own', store: 'own' })).toEqual(['collect', 'delete']);
  });

  it('受管技能（预设 / 手动投放）没有开关，只能删除物理产物', () => {
    expect(kinds({ reason: 'manual', store: 'symlink', wanted: true })).toEqual(['delete']);
    expect(kinds({ reason: 'preset', store: 'symlink', wanted: false })).toEqual(['delete']);
  });

  it('共享标准目录读取不给任何操作', () => {
    expect(kinds({ reason: 'shared', store: 'own', alreadyInLibrary: true })).toEqual([]);
  });
});

describe('Agent 技能行的状态（state）', () => {
  const stateOf = (over: Partial<AgentSkillRow>) => agentCards([row(over)])[0].state;

  it('自带真实目录 / 外部软链 / 共享目录读取：已在目录里、本 Agent 可用 → 开启', () => {
    expect(stateOf({ reason: 'own', store: 'own', dir: '/from/own' })).toBe('on');
    expect(stateOf({ reason: 'external', alreadyInLibrary: false })).toBe('on');
    expect(stateOf({ reason: 'shared', store: 'own' })).toBe('on');
  });

  it('本工具分发：在名单内开启，移出名单则已停用', () => {
    expect(stateOf({ reason: 'manual', wanted: true })).toBe('on');
    expect(stateOf({ reason: 'preset', wanted: false })).toBe('off');
  });
});
