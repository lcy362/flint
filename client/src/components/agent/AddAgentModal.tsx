import { useState } from 'react';
import { api } from '../../api/types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import { FieldInput } from '../ui/Field';
import { PathField } from '../ui/PathField';
import { useToast } from '../ui/Toast';
import { useI18n } from '../../i18n';

/** 新增自定义 Agent（AG-03）：内置清单之外由用户新增的任意工具 */
export function AddAgentModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [globalDir, setGlobalDir] = useState('');
  const [projectDir, setProjectDir] = useState('');
  const [recursive, setRecursive] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/agents/custom', {
        method: 'POST',
        body: JSON.stringify({ key: key.trim(), name: name.trim() || key.trim(), globalDir: globalDir.trim(), projectDir: projectDir.trim() || undefined, recursive }),
      });
      toast.push(t('addAgent.added'), 'good');
      setKey(''); setName(''); setGlobalDir(''); setProjectDir(''); setRecursive(false);
      onDone();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally { setBusy(false); }
  };

  return (
    <Modal
      open={open}
      title={t('addAgent.title')}
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={!key.trim() || !globalDir.trim()} onClick={submit}>{t('common.add')}</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
          <FieldInput label={t('addAgent.key')} placeholder="my-tool" value={key} onChange={(e) => setKey(e.target.value)} />
          <FieldInput label={t('common.name')} placeholder="My Tool" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <PathField label={t('addAgent.global')} placeholder="/Users/me/.my-tool/skills" value={globalDir} onChange={setGlobalDir} />
        <FieldInput
          label={t('addAgent.project')}
          hint={t('addAgent.projectHint')}
          placeholder=".my-tool/skills"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <Switch checked={recursive} onChange={setRecursive} />
          <span style={{ color: 'var(--c-ink-2)', fontSize: 'var(--fs-13)' }}>{t('addAgent.recursive')}</span>
        </label>
      </div>
    </Modal>
  );
}
