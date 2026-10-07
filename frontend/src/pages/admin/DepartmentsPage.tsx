import { useEffect, useState, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { validateDepartmentName } from '../../lib/validation';
import type { Department } from '../../types';

type Notice = { tone: 'error' | 'success'; text: string } | null;

const byName = (a: Department, b: Department) => a.name.localeCompare(b.name);
const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<{ id: number; name: string; error?: string } | null>(null);

  useEffect(() => {
    api<{ departments: Department[] }>('GET', '/departments')
      .then((r) => setDepartments(r.departments))
      .catch((err) => setLoadError(messageOf(err)));
  }, []);

  const replace = (department: Department) =>
    setDepartments((list) => (list ?? []).map((d) => (d.id === department.id ? department : d)).sort(byName));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const error = validateDepartmentName(name);
    setNameError(error ?? undefined);
    if (error) return;
    try {
      const r = await api<{ department: Department }>('POST', '/departments', { name });
      setDepartments((list) => [...(list ?? []), r.department].sort(byName));
      setName('');
      setNotice({ tone: 'success', text: `Added ${r.department.name}.` });
    } catch (err) {
      if (err instanceof ApiError && err.fields.name) setNameError(err.fields.name);
      else setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const saveRename = async () => {
    if (!editing) return;
    const error = validateDepartmentName(editing.name);
    if (error) {
      setEditing({ ...editing, error });
      return;
    }
    try {
      const r = await api<{ department: Department }>('PATCH', `/departments/${editing.id}`, { name: editing.name });
      replace(r.department);
      setEditing(null);
    } catch (err) {
      setEditing({ ...editing, error: err instanceof ApiError && err.fields.name ? err.fields.name : messageOf(err) });
    }
  };

  const toggle = async (department: Department) => {
    try {
      const r = await api<{ department: Department }>('PATCH', `/departments/${department.id}`, { active: !department.active });
      replace(r.department);
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  return (
    <>
      <PageHeader title="Departments" description="Staff accounts belong to a department, and visit reports are grouped by it." />
      {notice && (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}
      <Card className="mb-6">
        <form onSubmit={add} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <TextInput label="New department" name="new-department" value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          </div>
          <Button type="submit" className="sm:mt-8">
            Add department
          </Button>
        </form>
      </Card>
      <Card>
        {loadError && <Banner tone="error">{loadError}</Banner>}
        {departments === null && !loadError && <p role="status" className="mb-0">Loading…</p>}
        {departments?.length === 0 && <p className="mb-0">No departments yet. Add the first one above.</p>}
        {departments && departments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Users</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b border-bg-alt last:border-0">
                    <td className="py-3 pr-4">
                      {editing?.id === d.id ? (
                        <div>
                          <input aria-label="Department name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClass(!!editing.error)} autoFocus />
                          {editing.error && <p role="alert" className="mt-1 mb-0 text-[13px] text-error">{editing.error}</p>}
                        </div>
                      ) : (
                        d.name
                      )}
                    </td>
                    <td className="py-3 pr-4">{d.user_count}</td>
                    <td className="py-3 pr-4">{d.active ? <Pill>Active</Pill> : <Pill tone="muted">Inactive</Pill>}</td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {editing?.id === d.id ? (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={saveRename}>Save</button>
                          <button type="button" className={linkButton} onClick={() => setEditing(null)}>Cancel</button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={() => setEditing({ id: d.id, name: d.name })}>Rename</button>
                          <button type="button" className={linkButton} onClick={() => toggle(d)}>{d.active ? 'Deactivate' : 'Activate'}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
