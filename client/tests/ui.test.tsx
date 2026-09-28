import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import Badge from '../src/components/ui/Badge';
import Button from '../src/components/ui/Button';
import Chip from '../src/components/ui/Chip';
import EmptyState from '../src/components/ui/EmptyState';
import { FieldInput, FieldSelect, FieldTextarea } from '../src/components/ui/Field';
import LoadingBoundary from '../src/components/ui/LoadingBoundary';
import Modal from '../src/components/ui/Modal';
import MultiSelect from '../src/components/ui/MultiSelect';
import PageHeader from '../src/components/ui/PageHeader';
import { PathField, PathListField } from '../src/components/ui/PathField';
import Segment from '../src/components/ui/Segment';
import Spinner from '../src/components/ui/Spinner';
import Switch from '../src/components/ui/Switch';
import SwitchLabel from '../src/components/ui/SwitchLabel';
import Tag from '../src/components/ui/Tag';
import { ToastProvider, useToast } from '../src/components/ui/Toast';
import { I18nProvider } from '../src/i18n';

vi.mock('../src/api/picker', () => ({
  pickDirectory: vi.fn(),
  pickFile: vi.fn(),
}));

const { pickDirectory, pickFile } = await import('../src/api/picker');

/** 包一层 i18n（部分组件依赖文案）；返回元素，便于 render / rerender 复用 */
function wrap(ui: ReactNode) {
  return <I18nProvider>{ui}</I18nProvider>;
}

beforeEach(() => {
  vi.mocked(pickDirectory).mockReset();
  vi.mocked(pickFile).mockReset();
});

describe('基础原子组件', () => {
  it('Badge 支持色调、圆点与标题', () => {
    const { container } = render(<Badge tone="warn" dot="warn" title="ti" className="extra">W</Badge>);
    const el = container.querySelector('.badge')!;
    expect(el.className).toContain('badge--warn');
    expect(el.className).toContain('extra');
    expect(el.getAttribute('title')).toBe('ti');
    expect(container.querySelector('.dot--warn')).toBeTruthy();
  });

  it('Button 组合变体 / 尺寸 / 块级 / loading', async () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button variant="danger" size="sm" block loading onClick={onClick}>删除</Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('btn--danger');
    expect(btn.className).toContain('btn--sm');
    expect(btn.className).toContain('btn--block');
    expect(btn).toBeDisabled();
    expect(container.querySelector('.spinner--sm')).toBeTruthy();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Spinner 渲染', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.spinner')).toBeTruthy();
  });

  it('Tag 纯展示不带交互，可点击时阻止冒泡并显示选中态', async () => {
    const { container, rerender } = render(<Tag>plain</Tag>);
    expect(container.querySelector('button')).toBeNull();

    const onClick = vi.fn();
    const outer = vi.fn();
    rerender(
      <div onClick={outer}>
        <Tag selected muted onClick={onClick}>tag</Tag>
      </div>,
    );
    const btn = screen.getByRole('button');
    expect(btn.textContent).toContain('✓');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('Switch / SwitchLabel 受控开关', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} aria-label="sw" />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);

    const labelChange = vi.fn();
    render(<SwitchLabel checked disabled onChange={labelChange}>开关文字</SwitchLabel>);
    const sw = screen.getAllByRole('switch')[1];
    expect(sw).toBeDisabled();
    expect(sw).toHaveAttribute('aria-label', '开关文字');
  });

  it('Chip 单选反选、多选增删与计数', async () => {
    const options = [{ label: 'A', value: 'a', count: 2 }, { label: 'B', value: 'b' }];
    const single = vi.fn();
    const { rerender } = render(<Chip options={options} selected={[]} onChange={single} />);
    await userEvent.click(screen.getByRole('button', { name: /A/ }));
    expect(single).toHaveBeenCalledWith(['a']);
    expect(screen.getByRole('button', { name: /A/ }).textContent).toContain('2');

    // 再次点击已选项 → 清空
    rerender(<Chip options={options} selected={['a']} onChange={single} />);
    expect(screen.getByRole('button', { name: /A/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /A/ }));
    expect(single).toHaveBeenLastCalledWith([]);

    // 多选：加入 / 移除
    const multi = vi.fn();
    rerender(<Chip multiple options={options} selected={['a']} onChange={multi} size="lg" />);
    await userEvent.click(screen.getByRole('button', { name: /B/ }));
    expect(multi).toHaveBeenLastCalledWith(['a', 'b']);
    await userEvent.click(screen.getByRole('button', { name: /A/ }));
    expect(multi).toHaveBeenLastCalledWith([]);
  });

  it('Segment 切换标签页', async () => {
    const onChange = vi.fn();
    render(<Segment options={[{ label: '卡片', value: 'card' }, { label: '列表', value: 'list' }]} value="card" onChange={onChange} />);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: '列表' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('EmptyState 与 PageHeader 按需渲染各区块', () => {
    const { container } = render(
      <EmptyState title="空" hint="提示" action={<button type="button">动作</button>} icon="◎" />,
    );
    expect(container.querySelector('.empty__title')?.textContent).toBe('空');
    expect(screen.getByRole('button', { name: '动作' })).toBeTruthy();

    const { container: c2 } = render(<PageHeader title="标题" sub="副标题" actions={<span>act</span>} />);
    expect(c2.querySelector('.page-head__title')?.textContent).toBe('标题');
    expect(c2.querySelector('.page-head__sub')?.textContent).toBe('副标题');
    expect(c2.querySelector('.page-head__actions')?.textContent).toBe('act');
  });

  it('Field 三种输入形态带标签与提示', () => {
    render(
      <>
        <FieldInput label="名字" hint="hint" value="v" readOnly onChange={() => {}} />
        <FieldSelect label="选择" value="a" onChange={() => {}}><option value="a">A</option></FieldSelect>
        <FieldTextarea label="多行" value="t" readOnly onChange={() => {}} />
      </>,
    );
    // label 元素同时包住输入与提示，故用正则匹配
    expect(screen.getByLabelText(/名字/)).toHaveValue('v');
    expect(screen.getByLabelText(/选择/)).toHaveValue('a');
    expect(screen.getByLabelText(/多行/)).toHaveValue('t');
    expect(screen.getAllByText('hint')).toHaveLength(1);
  });
});

describe('LoadingBoundary', () => {
  it('加载中显示 spinner，出错显示告警，空数组走空状态，有数据渲染 children', async () => {
    const { container, rerender } = render(
      wrap(<LoadingBoundary state={{ loading: true }}>{() => <i data-testid="body" />}</LoadingBoundary>),
    );

    expect(container.querySelector('.spinner')).toBeTruthy();

    rerender(wrap(<LoadingBoundary state={{ loading: false, error: '炸了' }}>{() => null}</LoadingBoundary>));
    expect(screen.getByRole('alert').textContent).toContain('炸了');

    rerender(
      wrap(
        <LoadingBoundary state={{ loading: false, data: [] }} empty={{ title: '没有数据' }}>
          {() => null}
        </LoadingBoundary>,
      ),
    );
    await waitFor(() => expect(screen.getByText('没有数据')).toBeTruthy());

    rerender(
      wrap(
        <LoadingBoundary state={{ loading: false, data: ['x'] }}>
          {(d) => <span data-testid="body">{d.join(',')}</span>}
        </LoadingBoundary>,
      ),
    );
    expect(screen.getByTestId('body').textContent).toBe('x');
  });

  it('数据为 null 且未加载完时保持 spinner', () => {
    const { container } = render(wrap(<LoadingBoundary state={{ loading: false, data: null }}>{() => null}</LoadingBoundary>));
    expect(container.querySelector('.spinner')).toBeTruthy();
  });
});

describe('Modal', () => {
  it('关闭时不渲染；打开时渲染标题、正文与底部，并能通过按钮 / Esc / 点遮罩关闭', async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      wrap(<Modal open={false} onClose={onClose}>内容</Modal>),
    );
    expect(container.querySelector('.modal')).toBeNull();

    rerender(
      wrap(
        <Modal open title="标题" onClose={onClose} width={420} footer={<span>底部</span>}>
          内容
        </Modal>,
      ),
    );
    expect(screen.getByText('标题')).toBeTruthy();
    expect(container.querySelector('.modal')).toBeTruthy();
    expect(screen.getByText('底部')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Esc 关闭
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    // 其它按键不触发
    fireEvent.keyDown(document, { key: 'a' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // 点遮罩空白处关闭
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    // 点内容区不关闭
    fireEvent.mouseDown(screen.getByText('内容'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('未提供 onClose 时不渲染关闭按钮，也不响应 Esc', () => {
    const { container } = render(wrap(<Modal open title="t">c</Modal>));
    expect(screen.queryByRole('button', { name: '✕' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.modal')).toBeTruthy();
  });
});

describe('MultiSelect', () => {
  const options = [
    { label: 'Alpha', value: 'a', count: 1 },
    { label: 'Beta', value: 'b' },
  ];

  it('触发按钮摘要随选中数量变化，可勾选 / 取消 / 一键清空', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      wrap(<MultiSelect label="来源" options={options} selected={[]} onChange={onChange} />),
    );
    const trigger = screen.getByRole('button', { name: /来源/ });
    expect(trigger.textContent).toContain('来源');

    await userEvent.click(trigger);
    const optionA = screen.getByRole('option', { name: /Alpha/ });
    expect(optionA).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(optionA);
    expect(onChange).toHaveBeenCalledWith(['a']);

    // 单项选中显示名字
    rerender(wrap(<MultiSelect label="来源" options={options} selected={['a']} onChange={onChange} />));
    expect(screen.getByRole('button', { name: /来源/ }).textContent).toContain('Alpha');
    expect(screen.getByRole('button', { name: /来源/ }).getAttribute('title')).toBe('a');

    // 多项显示计数 + 清空按钮
    rerender(wrap(<MultiSelect label="来源" options={options} selected={['a', 'b']} onChange={onChange} />));
    expect(screen.getByRole('button', { name: /来源/ }).textContent).toContain('2');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('已选项再次点击即取消', async () => {
    const onChange = vi.fn();
    render(wrap(<MultiSelect label="来源" options={options} selected={['a']} onChange={onChange} />));
    await userEvent.click(screen.getByRole('button', { name: /来源/ }));
    await userEvent.click(screen.getByRole('option', { name: /Alpha/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('选项过多时提供面板内搜索，无匹配 / 无可选项给出说明', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ label: `opt-${i}`, value: `v${i}` }));
    render(wrap(<MultiSelect label="标签" options={many} selected={[]} onChange={vi.fn()} emptyHint="没有标签" />));
    await userEvent.click(screen.getByRole('button', { name: /标签/ }));
    const search = screen.getByRole('searchbox', { name: '标签' });
    await userEvent.type(search, 'opt-1');
    expect(screen.getAllByRole('option')).toHaveLength(1);

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no match|无匹配/i)).toBeTruthy();
  });

  it('可选项为空时显示 emptyHint', async () => {
    render(wrap(<MultiSelect label="空维度" options={[]} selected={[]} onChange={vi.fn()} emptyHint="空空如也" />));
    await userEvent.click(screen.getByRole('button', { name: /空维度/ }));
    expect(screen.getByText('空空如也')).toBeTruthy();
  });

  it('Esc 与点击外部都会关闭面板', async () => {
    render(
      wrap(
        <div>
          <MultiSelect label="来源" options={options} selected={[]} onChange={vi.fn()} />
          <button type="button">外部</button>
        </div>,
      ),
    );
    const trigger = screen.getByRole('button', { name: /来源/ });
    await userEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await userEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: '外部' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});

describe('PathField / PathListField', () => {
  it('PathField 可手动输入，选择成功回填，取消不变', async () => {
    const onChange = vi.fn();
    vi.mocked(pickDirectory).mockResolvedValueOnce('/picked');
    render(wrap(<ToastProvider><PathField mode="dir" value="/old" onChange={onChange} label="目录" /></ToastProvider>));
    // label 只是视觉标签（未与 input 关联），按角色查询输入框
    expect(screen.getByRole('textbox')).toHaveValue('/old');

    await userEvent.click(screen.getByRole('button', { name: /choose/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/picked'));

    vi.mocked(pickDirectory).mockResolvedValueOnce(null);
    await userEvent.click(screen.getByRole('button', { name: /choose/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));

    // 选择器不可用时提示错误
    vi.mocked(pickDirectory).mockRejectedValueOnce(new Error('no picker'));
    await userEvent.click(screen.getByRole('button', { name: /choose/i }));
    await waitFor(() => expect(screen.getByText('no picker')).toBeTruthy());
  });

  it('PathField 的 file 模式走文件选择器', async () => {
    const onChange = vi.fn();
    vi.mocked(pickFile).mockResolvedValueOnce('/f.txt');
    render(wrap(<ToastProvider><PathField mode="file" value="" onChange={onChange} /></ToastProvider>));
    await userEvent.click(screen.getByRole('button', { name: /choose/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/f.txt'));
  });

  it('PathListField 追加目录、忽略重复、可手改', async () => {
    const onChange = vi.fn();
    vi.mocked(pickDirectory).mockResolvedValueOnce('/a');
    const { rerender } = render(
      wrap(<ToastProvider><PathListField value={'/a\n/b'} onChange={onChange} label="多个目录" /></ToastProvider>),
    );
    expect(screen.getByRole('textbox')).toHaveValue('/a\n/b');

    // 已存在的目录：提示重复，不回写
    await userEvent.click(screen.getByRole('button', { name: /add folder/i }));
    await waitFor(() => expect(screen.getByText(/already|重复/i)).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();

    vi.mocked(pickFile).mockResolvedValueOnce('/c');
    rerender(wrap(<ToastProvider><PathListField mode="file" value="/a" onChange={onChange} label="多个目录" /></ToastProvider>));
    await userEvent.click(screen.getByRole('button', { name: /add file/i }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/a\n/c'));

    // 手动编辑
    await userEvent.type(screen.getByRole('textbox'), 'X');
    expect(onChange).toHaveBeenCalled();
  });

  it('PathListField 选择器报错时提示', async () => {
    vi.mocked(pickDirectory).mockRejectedValueOnce(new Error('nope'));
    render(wrap(<ToastProvider><PathListField value="" onChange={vi.fn()} /></ToastProvider>));
    await userEvent.click(screen.getByRole('button', { name: /add folder/i }));
    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
  });
});

describe('Toast', () => {
  it('push 后展示并在超时后自动消失', async () => {
    vi.useFakeTimers();
    function Trigger() {
      const toast = useToast();
      return <button type="button" onClick={() => toast.push('已保存', 'good')}>推</button>;
    }
    render(wrap(<ToastProvider><Trigger /></ToastProvider>));

    act(() => { fireEvent.click(screen.getByRole('button', { name: '推' })); });
    expect(screen.getByText('已保存')).toBeTruthy();
    expect(document.querySelector('.toast--good')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(3300); });
    expect(screen.queryByText('已保存')).toBeNull();
    vi.useRealTimers();
  });

  it('未包 Provider 时 useToast 给出空实现，不报错', () => {
    const { result } = renderHook(() => useToast());
    expect(() => result.current.push('x')).not.toThrow();
  });
});
