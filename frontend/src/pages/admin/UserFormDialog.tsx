import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { SelectInput } from '../../components/SelectInput';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { ROLE_LABELS } from '../../lib/roles';
import { validateUserForm, type FieldErrors, type UserFormValues } from '../../lib/validation';
import type { Department, Role, SetPasswordLink, User } from '../../types';

interface UserFormDialogProps {
  user?: User;
  departments: Department[];
  /** The roles the signed-in person may assign (IT: all; admin: staff, reception, security). */
  roles: Role[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (user: User, link?: SetPasswordLink) => void;
}

export function UserFormDialog({ user, departments, roles, isSelf, onClose, onSaved }: UserFormDialogProps) {
  const [values, setValues] = useState<UserFormValues>({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    role: user?.role ?? '',
    department_id: user?.department_id ? String(user.department_id) : '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (field: keyof UserFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));
  // A user may keep a department that was deactivated after they joined it.
  const options = departments.filter((d) => d.active || d.id === user?.department_id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next = validateUserForm(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    const payload = {
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      role: values.role,
      department_id: values.department_id === '' ? null : Number(values.department_id),
    };
    setBusy(true);
    try {
      if (user) {
        const r = await api<{ user: User }>('PATCH', `/users/${user.id}`, payload);
        onSaved(r.user);
      } else {
        const r = await api<{ user: User; link: SetPasswordLink }>('POST', '/users', payload);
        onSaved(r.user, r.link);
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={user ? `Edit ${user.full_name}` : 'Invite a user'} onClose={onClose}>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate>
        <TextInput label="Full name" name="full_name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} autoFocus />
        <TextInput label="Email" name="email" type="email" value={values.email} onChange={set('email')} error={errors.email} hint="They sign in with this." />
        <TextInput label="Phone (optional)" name="phone" type="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <SelectInput label="Role" name="role" value={values.role} onChange={set('role')} error={errors.role} disabled={isSelf} hint={isSelf ? "You can't change your own role." : undefined}>
          <option value="">Choose a role</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectInput>
        <SelectInput label="Department" name="department_id" value={values.department_id} onChange={set('department_id')} error={errors.department_id} hint="Required for staff.">
          <option value="">No department</option>
          {options.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </SelectInput>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
