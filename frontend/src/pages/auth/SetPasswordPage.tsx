import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { ApiError, api, messageOf } from '../../lib/api';
import { validatePassword, type FieldErrors } from '../../lib/validation';

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: FieldErrors = {};
    const passwordError = validatePassword(password);
    if (passwordError) next.password = passwordError;
    else if (confirm !== password) next.confirm = "The passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api('POST', '/auth/set-password', { token, password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') setErrors(err.fields);
      else setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Set your password" text="Choose a password for your Visitor Management account. Use at least 10 characters.">
      {done ? (
        <>
          <h2>Password set</h2>
          <p>You can now sign in with your email and new password.</p>
          <Link to="/login" className="font-semibold text-primary underline underline-offset-2">
            Go to sign in
          </Link>
        </>
      ) : !token ? (
        <>
          <h2>Link incomplete</h2>
          <p className="mb-0">This link is missing its code. Open the full link you were sent, or ask an administrator for a new one.</p>
        </>
      ) : (
        <>
          <h2>Set your password</h2>
          {error && <Banner tone="error">{error}</Banner>}
          <form onSubmit={submit} noValidate className="max-w-md">
            <TextInput label="New password" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 10 characters." autoFocus />
            <TextInput label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
            <Button type="submit" arrow disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
