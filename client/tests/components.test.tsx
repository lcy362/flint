import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import FilterBar from '../src/components/common/FilterBar';
import BadgeLegend from '../src/components/common/BadgeLegend';
import FoldButton from '../src/components/common/FoldButton';
import EntityList, { EntityCard, EntityRow, type EntityItem } from '../src/components/common/EntityList';
import NavRail from '../src/components/layout/NavRail';
import Topbar from '../src/components/layout/Topbar';
import AgentNamesTitle from '../src/components/agent/AgentNamesTitle';
import OpenStandardTitle from '../src/components/agent/OpenStandardTitle';
import { AddAgentModal } from '../src/components/agent/AddAgentModal';
import SkillActions from '../src/components/skill/SkillActions';
import AddableSkillList from '../src/components/skill/AddableSkillList';
import SkillList, { skillToEntity } from '../src/components/skill/SkillList';
import {
  dirBadge, isOn, isToolManaged, linkBadge, reasonBadge, skillBadgeLegend, skillBadges,
  stateBadge, storeBadge, takenOverBadge,
} from '../src/components/skill/SkillBadges';
import { skillViewToCard } from '../src/components/skill/adapters';
import { ToastProvider } from '../src/components/ui/Toast';
import { I18nProvider, useI18n, type TFunc } from '../src/i18n';
import type { AgentView, SkillCardView } from '../src/api/types';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api/types', () => ({
  api: apiMock,
  assertApiPath: (p: string) => p,
}));

function wrap(ui: ReactNode) {
  return (
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>
  );
}

/** 取一份 en 的 t，供纯函数形式的徽标 / legend 使用 */
function useTFunc(): TFunc {
  return useI18n().t;
}

function Probe({ children }: Readonly<{ children: (t: TFunc) => ReactNode }>) {
  return <>{children(useTFunc())}</>;
}

const item = (over: Partial<EntityItem> = {}): EntityItem => ({ id: 'i1', title: 'Title', ...over });

const skill = (over: Partial<SkillCardView> = {}): SkillCardView => ({
  id: 'a@repo',
  name: 'a',
  source: 'repo',
  tags: [],
  reason: 'preset',
  store: 'symlink',
  state: 'on',
  actions: [],
  ...over,
});

const agent = (over: Partial<AgentView> = {}): AgentView => ({
  key: 'cursor', name: 'Cursor', globalDir: '/g', installed: true, primaryKey: 'cursor',
  sync: 'symlink', active: true, sharedWith: [], ...over,
});

describe('FilterBar', () => {
  it('搜索输入、清空按钮与 Esc 清空', async () => {
    const onChange = vi.fn();
    const { rerender } = render(wrap(<FilterBar search={{ value: '', onChange }} />));
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search');

    await userEvent.type(screen.getByRole('searchbox'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');

    // 有值时出现清空按钮；Esc 也能清空
    rerender(wrap(<FilterBar search={{ value: 'abc', onChange }} />));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith('');

    await userEvent.type(screen.getByRole('searchbox'), '{Escape}');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('带筛选时出现重置按钮，并渲染控件与视图切换', async () => {
    const onReset = vi.fn();
    const onChange = vi.fn();
    render(
      wrap(
        <FilterBar
          search={{ value: '', onChange, placeholder: '自定义占位' }}
          controls={<span>controls</span>}
          hasFilters
          onReset={onReset}
          actions={<span>actions</span>}
          view={{ value: 'card', onChange }}
        />,
      ),
    );
    expect(screen.getByPlaceholderText('自定义占位')).toBeTruthy();
    expect(screen.getByText('controls')).toBeTruthy();
    expect(screen.getByText('actions')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});

describe('BadgeLegend / FoldButton', () => {
  it('图例入口打开弹窗并列出徽标解释', async () => {
    render(
      wrap(
        <BadgeLegend
          title="图例"
          intro="说明"
          items={[{ label: 'L1', tone: 'warn', dot: 'warn', desc: 'D1' }]}
        />,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Badge guide' }));
    expect(screen.getByText('图例')).toBeTruthy();
    expect(screen.getByText('L1')).toBeTruthy();
    expect(screen.getByText('D1')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText('D1')).toBeNull());
  });

  it('折叠按钮的无障碍名称随状态变化', async () => {
    const onClick = vi.fn();
    const { rerender } = render(wrap(<FoldButton expanded label="技能" onClick={onClick} />));
    expect(screen.getByRole('button', { name: 'Collapse 技能' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();

    rerender(wrap(<FoldButton expanded={false} label="技能" onClick={onClick} />));
    expect(screen.getByRole('button', { name: 'Expand 技能' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('EntityList / EntityCard / EntityRow', () => {
  it('空列表展示自定义空状态', () => {
    render(wrap(<EntityList items={[]} title="T" empty={<span>没东西</span>} />));
    expect(screen.getByText('没东西')).toBeTruthy();
  });

  it('卡片视图渲染标题、副标题、徽标、标签、meta 与操作', async () => {
    const onTag = vi.fn();
    const onAction = vi.fn();
    const it0 = item({
      sub: <span>sub</span>,
      desc: <span>desc</span>,
      badges: <span>badge</span>,
      status: <span>status</span>,
      meta: <span>meta</span>,
      toggle: <span>toggle</span>,
      tags: [{ label: 'tag1', onClick: onTag }],
      actions: <button type="button" onClick={onAction}>do</button>,
      variant: 'standard',
    });
    const { container } = render(wrap(<EntityList items={[it0]} mode="card" />));
    expect(container.querySelector('.entity-card--standard')).toBeTruthy();
    expect(screen.getByText('Title')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'tag1' }));
    expect(onTag).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'do' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('列表视图与置灰态', () => {
    const { container } = render(wrap(<EntityList items={[item({ muted: true })]} mode="list" />));
    expect(container.querySelector('.entity-row.is-off')).toBeTruthy();
  });

  it('整块可点击：鼠标点击与键盘 Enter / Space 都能触发', async () => {
    const onClick = vi.fn();
    const onKey = vi.fn();
    render(wrap(<EntityCard item={item({ onClick })} />));
    const card = screen.getByRole('button');
    await userEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);

    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
    onKey();
  });

  it('未提供 onClick 时不带交互语义', () => {
    const { container } = render(wrap(<EntityRow item={item()} />));
    expect(container.querySelector('.entity-row')?.getAttribute('role')).toBeNull();
  });

  it('可折叠区块：折叠按钮切换，折叠后隐藏内容', async () => {
    render(wrap(<EntityList items={[item()]} title="T" collapsible defaultCollapsed />));
    expect(screen.queryByText('Title')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Expand list' }));
    expect(screen.getByText('Title')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse list' }));
    expect(screen.queryByText('Title')).toBeNull();
  });

  it('视图切换器切换卡片 / 列表', async () => {
    const { container } = render(wrap(<EntityList items={[item()]} title="T" />));
    expect(container.querySelector('.entity-grid')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(container.querySelector('.entity-list')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Cards' }));
    expect(container.querySelector('.entity-grid')).toBeTruthy();
  });

  it('hideToggle 时不渲染切换器', () => {
    const { container } = render(wrap(<EntityList items={[item()]} title="T" hideToggle />));
    expect(container.querySelector('.seg')).toBeNull();
  });
});

describe('布局组件', () => {
  it('NavRail 高亮当前页、可选计数并回调', async () => {
    const onSelect = vi.fn();
    const { container } = render(wrap(<NavRail active="agents" onSelect={onSelect} counts={{ agents: 3 }} />));
    expect(container.querySelector('.rail__link.is-active')?.textContent).toContain('Agents');
    expect(screen.getByText('3')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Library/ }));
    expect(onSelect).toHaveBeenCalledWith('library');
  });

  it('Topbar 主题 / 刷新 / 语言三个动作', async () => {
    const onToggleTheme = vi.fn();
    const onReload = vi.fn();
    const { rerender } = render(
      wrap(<Topbar title="T" sub="S" theme="light" onToggleTheme={onToggleTheme} onReload={onReload} reloading />),
    );
    expect(screen.getByText('T')).toBeTruthy();
    expect(screen.getByText('S')).toBeTruthy();
    // 刷新按钮只有图标，无障碍名来自 title
    await userEvent.click(screen.getByTitle('Refresh'));
    expect(onReload).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    // 语言切换按钮把界面切成中文
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Chinese' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '切换为 English' })).toBeTruthy());

    rerender(wrap(<Topbar title="T" theme="dark" onToggleTheme={onToggleTheme} />));
    expect(screen.queryByTitle('Refresh')).toBeNull();
    expect(screen.getByText('☾')).toBeTruthy();
  });

  it('AgentNamesTitle 单个直接展示、多个用 / 连接', () => {
    const { container, rerender } = render(<AgentNamesTitle agents={[agent()]} />);
    expect(container.textContent).toBe('Cursor');

    const a1 = agent({ key: 'cline', name: 'Cline' });
    rerender(<AgentNamesTitle agents={[agent(), a1]} quiet />);
    expect(container.querySelector('.std-agents')).toBeTruthy();
    expect(container.textContent).toContain('Cursor / Cline');
  });

  it('OpenStandardTitle 的 info 按钮不冒泡', async () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <OpenStandardTitle label="标准目录" tip="说明" />
      </div>,
    );
    expect(screen.getByText('标准目录')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '说明' }));
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('SkillActions', () => {
  it('按动作渲染按钮并回调；无动作返回 null', async () => {
    const onAction = vi.fn();
    const { container, rerender } = render(
      wrap(<SkillActions item={skill({ actions: [
        { kind: 'delete', label: 'Delete' },
        { kind: 'collect', label: 'Collect', disabled: true, title: 'why' },
      ] })} onAction={onAction} />),
    );
    expect(container.querySelector('.entity-row__actions')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'a@repo' }), expect.objectContaining({ kind: 'delete' }));
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();

    rerender(wrap(<SkillActions item={skill()} onAction={onAction} />));
    expect(container.querySelector('.entity-row__actions')).toBeNull();
  });
});

describe('SkillBadges 纯函数', () => {
  it('isOn / isToolManaged 的判定口径', () => {
    expect(isOn(skill({ state: 'on' }))).toBe(true);
    expect(isOn(skill({ state: 'off' }))).toBe(false);
    expect(isOn(skill({ state: undefined }))).toBe(false);
    expect(isToolManaged(skill({ reason: 'preset' }))).toBe(true);
    for (const r of ['own', 'external', 'shared'] as const) {
      expect(isToolManaged(skill({ reason: r }))).toBe(false);
    }
  });

  it('各种徽标在对应条件下出现，否则为空', () => {
    render(
      wrap(
        <Probe>
          {(t) => (
            <div>
              <div data-testid="reason-preset">{reasonBadge(t, skill({ reason: 'preset' }))}</div>
              <div data-testid="reason-manual">{reasonBadge(t, skill({ reason: 'manual' }))}</div>
              <div data-testid="reason-external">{reasonBadge(t, skill({ reason: 'external' }))}</div>
              <div data-testid="reason-shared">{reasonBadge(t, skill({ reason: 'shared' }))}</div>
              <div data-testid="reason-override">{reasonBadge(t, skill({ reasonLabel: '自定义', reasonTitle: '自定义说明' }))}</div>
              <div data-testid="store-symlink">{storeBadge(t, skill({ store: 'symlink' }))}</div>
              <div data-testid="store-copy">{storeBadge(t, skill({ store: 'copy' }))}</div>
              <div data-testid="store-pending">{storeBadge(t, skill({ store: 'pending' }))}</div>
              <div data-testid="store-own">{storeBadge(t, skill({ store: 'own' }))}</div>
              <div data-testid="state-on">{stateBadge(t, skill({ state: 'on' }))}</div>
              <div data-testid="state-off">{stateBadge(t, skill({ state: 'off' }))}</div>
              <div data-testid="state-none">{stateBadge(t, skill({ state: undefined }))}</div>
              <div data-testid="dir">{dirBadge(skill({ dirLabel: '~/x' }))}</div>
              <div data-testid="dir-none">{dirBadge(skill())}</div>
              <div data-testid="taken">{takenOverBadge(t, skill({ takenOver: true }))}</div>
              <div data-testid="taken-none">{takenOverBadge(t, skill())}</div>
              <div data-testid="link">{linkBadge(t, skill({ reason: 'shared', linkTarget: '/t' }))}</div>
              <div data-testid="link-none">{linkBadge(t, skill({ reason: 'shared' }))}</div>
            </div>
          )}
        </Probe>,
      ),
    );
    const text = (id: string) => screen.getByTestId(id).textContent;
    expect(text('reason-manual')).toBe('');
    expect(text('reason-external')).toContain('External link');
    expect(text('reason-shared')).toContain('Read-only');
    expect(text('reason-override')).toBe('自定义');
    expect(text('store-own')).toBe('');
    expect(text('store-pending')).toContain('Pending');
    expect(text('state-on')).toContain('Enabled');
    expect(text('state-off')).toContain('Disabled');
    expect(text('state-none')).toBe('');
    expect(text('dir')).toBe('~/x');
    expect(text('dir-none')).toBe('');
    expect(text('taken')).toBe('Taken over');
    expect(text('taken-none')).toBe('');
    expect(text('link')).toBe('Link');
    expect(text('link-none')).toBe('');
  });

  it('skillBadges 组合：已接管时不再重复「软链」徽标', () => {
    const plain = render(wrap(<Probe>{(t) => <div data-testid="b">{skillBadges(t, skill())}</div>}</Probe>));
    expect(plain.getByTestId('b').textContent).toContain('From preset');
    expect(plain.getByTestId('b').textContent).toContain('Link');
    plain.unmount();

    const taken = render(
      wrap(
        <Probe>
          {(t) => (
            <div data-testid="b">{skillBadges(t, skill({ takenOver: true, store: 'pending', preset: 'demo' }))}</div>
          )}
        </Probe>,
      ),
    );
    const text = taken.getByTestId('b').textContent ?? '';
    expect(text).toContain('Taken over');
    expect(text).toContain('demo');
    expect(text).not.toContain('Pending');
  });

  it('图例覆盖全部徽标类型', () => {
    render(wrap(<Probe>{(t) => <span data-testid="legend">{skillBadgeLegend(t).length}</span>}</Probe>));
    expect(Number(screen.getByTestId('legend').textContent)).toBeGreaterThanOrEqual(10);
  });
});

describe('adapters / SkillList / AddableSkillList', () => {
  it('skillViewToCard 得到资产池语义（无状态、reason=manual）', () => {
    const card = skillViewToCard({ id: 'a@r', name: 'a', source: 'r', dir: '/d', description: 'desc', tags: ['x'] });
    expect(card).toMatchObject({ id: 'a@r', title: 'a', reason: 'manual', store: 'own', tags: ['x'] });
    expect(card.state).toBeUndefined();
  });

  it('skillToEntity 映射标题、副标题、开关与操作', async () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    const onTag = vi.fn();
    render(
      wrap(
        <Probe>
          {(t) => {
            const e = skillToEntity(t, skill({ tags: ['x'], pathLabel: '~/p' }), { onToggle, onOpen, onTag });
            return <EntityList items={[e]} mode="list" />;
          }}
        </Probe>,
      ),
    );
    expect(screen.getByText('~/p')).toBeTruthy();
    await userEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'x' }));
    expect(onTag).toHaveBeenCalled();
  });

  it('非本工具管辖的行不给开关，改用 pathLabel 身份', () => {
    render(
      wrap(
        <Probe>
          {(t) => (
            <EntityList
              items={[skillToEntity(t, skill({ reason: 'own', pathLabel: '~/own' }), { onToggle: vi.fn() })]}
              mode="list"
            />
          )}
        </Probe>,
      ),
    );
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText('~/own')).toBeTruthy();
  });

  it('SkillList 渲染区块并支持折叠', async () => {
    const { container } = render(wrap(<SkillList items={[skill()]} title="技能" collapsible storageKey="k" />));
    expect(screen.getByText('技能')).toBeTruthy();
    expect(container.querySelector('.entity-grid, .entity-list')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse list' }));
    expect(container.querySelector('.entity-grid, .entity-list')).toBeNull();
  });

  it('SkillList 空列表走自定义空状态', () => {
    render(wrap(<SkillList items={[]} empty={<span>空技能</span>} />));
    expect(screen.getByText('空技能')).toBeTruthy();
  });

  it('AddableSkillList：空态与添加回调', async () => {
    const onAdd = vi.fn();
    const { rerender } = render(wrap(<AddableSkillList items={[]} onAdd={onAdd} />));
    expect(screen.getByText('No matching skills')).toBeTruthy();

    rerender(wrap(<AddableSkillList items={[{ id: 'a@r', name: 'a', repo: 'r' }]} onAdd={onAdd} title="可添加" />));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith({ id: 'a@r', name: 'a', repo: 'r' });
  });
});

describe('AddAgentModal', () => {
  it('必填未填时提交禁用；填好后提交、提示并回调 onDone', async () => {
    apiMock.mockReset();
    apiMock.mockResolvedValue([]);
    const onDone = vi.fn();
    render(wrap(<AddAgentModal open onClose={vi.fn()} onDone={onDone} />));
    expect(screen.getByText('Add custom agent')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Key/), 'my-tool');
    await userEvent.type(screen.getByLabelText(/^Name/), 'My Tool');
    // PathField 的标签未与 input 关联：文本框顺序为 key / name / global / project
    await userEvent.type(screen.getAllByRole('textbox')[2], '/tmp/g/skills');
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/agents/custom', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(apiMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ key: 'my-tool', name: 'My Tool', globalDir: '/tmp/g/skills', recursive: false });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.getByText('Agent added')).toBeTruthy();
  });

  it('递归开关会写进请求体；提交失败时提示错误', async () => {
    apiMock.mockReset();
    apiMock.mockRejectedValue(new Error('dup key'));
    render(wrap(<AddAgentModal open onClose={vi.fn()} onDone={vi.fn()} />));
    await userEvent.type(screen.getByLabelText(/Key/), 'my-tool');
    await userEvent.type(screen.getAllByRole('textbox')[2], '/tmp/g');
    // 名称留空 → 回落到 key
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByText('dup key')).toBeTruthy());
    const body = JSON.parse(apiMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ name: 'my-tool', recursive: true });
  });
});
