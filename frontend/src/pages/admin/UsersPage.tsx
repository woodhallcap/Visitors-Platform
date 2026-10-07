import { useEffect, useState } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { inputClass } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Pill } from '../../components/Pill';
import { api, messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { ROLE_LABELS, canManage } from '../../lib/roles';
import { ROLES, type Department, type SetPasswordLink, type User } from '../../types';
import { LinkDialog } from './LinkDialog';
import { UserFormDialog } from './UserFormDialog';

type Notice = { tone: 'error' | 'success'; text: string } | null;
type FormState = { mode: 'invite' } | { mode: 'edit'; user: User } | null;

const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-primary underline underline-offset-2';

function matches(user: User, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.full_name, user.email, ROLE_LABELS[user.role], user.department_name ?? ''].some((v) => v.toLowerCase().includes(q));
}

function StatusPill({ user }: { user: User }) {
  if (!user.active) return <Pill tone="muted">Disabled</Pill>;
  if (!user.has_password) return <Pill tone="accent">Invited</Pill>;
  return <Pill>Active</Pill>;
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(null);
  const [shownLink, setShownLink] = useState<{ user: User; link: SetPasswordLink } | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    Promise.all([api<{ users: User[] }>('GET', '/users'), api<{ departments: Department[] }>('GET', '/departments')])
      .then(([u, d]) => {
        setUsers(u.users);
        setDepartments(d.departments);
      })
      .catch((err) => setLoadError(messageOf(err)));
  }, []);

  const upsert = (user: User) =>
    setUsers((list) => [...(list ?? []).filter((u) => u.id !== user.id), user].sort((a, b) => a.full_name.localeCompare(b.full_name)));

  const onSaved = (user: User, link?: SetPasswordLink) => {
    upsert(user);
    setForm(null);
    if (link) setShownLink({ user, link });
    else setNotice({ tone: 'success', text: `Saved ${user.full_name}.` });
  };

  const newLink = async (user: User) => {
    try {
      const r = await api<{ link: SetPasswordLink }>('POST', `/users/${user.id}/reset-link`);
      setShownLink({ user, link: r.link });
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const toggleActive = async (user: User) => {
    try {
      const r = await api<{ user: User }>('PATCH', `/users/${user.id}`, { active: !user.active });
      upsert(r.user);
      setNotice({ tone: 'success', text: `${r.user.full_name} is now ${r.user.active ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      setNotice({ tone: 'error', text: messageOf(err) });
    }
  };

  const visible = (users ?? []).filter((u) => matches(u, query));
  const assignableRoles = me ? ROLES.filter((role) => canManage(me, role)) : [];

  return (
    <>
      <PageHeader title="Users" description={me?.role === 'it' ? 'Invite people, set their role and department, and reset passwords. Only IT can manage admin and IT accounts.' : 'Invite people, set their role and department, and reset passwords. Admin and IT accounts are managed by IT.'} actions={<Button onClick={() => setForm({ mode: 'invite' })}>Invite user</Button>} />
      {notice && (
        <Banner tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      )}
      <Card>
        <div className="mb-5 max-w-sm">
          <input aria-label="Search users" placeholder="Search by name, email, role or department" value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass(false)} />
        </div>
        {loadError && <Banner tone="error">{loadError}</Banner>}
        {users === null && !loadError && <p role="status" className="mb-0">Loading…</p>}
        {users && visible.length === 0 && <p className="mb-0">No users match.</p>}
        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b border-bg-alt text-sm text-ink/60">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Last sign-in</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const isSelf = u.id === me?.id;
                  const manageable = !!me && canManage(me, u.role);
                  return (
                    <tr key={u.id} className="border-b border-bg-alt align-top last:border-0">
                      <td className="py-3 pr-4">
                        <span className="block font-medium">{u.full_name}</span>
                        <span className="block text-sm text-ink/60">{u.email}</span>
                      </td>
                      <td className="py-3 pr-4">{ROLE_LABELS[u.role]}</td>
                      <td className="py-3 pr-4">{u.department_name ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <StatusPill user={u} />
                      </td>
                      <td className="py-3 pr-4 text-sm whitespace-nowrap">{formatDateTime(u.last_login_at)}</td>
                      <td className="py-3 text-right whitespace-nowrap">
                        {!manageable ? (
                          <span className="text-sm text-ink/50">Managed by IT</span>
                        ) : (
                        <span className="inline-flex gap-4">
                          <button type="button" className={linkButton} onClick={() => setForm({ mode: 'edit', user: u })}>Edit</button>
                          {u.active && (
                            <button type="button" className={linkButton} onClick={() => newLink(u)}>
                              {u.has_password ? 'Reset password' : 'New invite link'}
                            </button>
                          )}
                          {!isSelf && (
                            <button type="button" className={linkButton} onClick={() => toggleActive(u)}>
                              {u.active ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && (
        <UserFormDialog
          user={form.mode === 'edit' ? form.user : undefined}
          departments={departments}
          roles={assignableRoles}
          isSelf={form.mode === 'edit' && form.user.id === me?.id}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}
      {shownLink && <LinkDialog user={shownLink.user} link={shownLink.link} onClose={() => setShownLink(null)} />}
    </>
  );
}
