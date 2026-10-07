import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AuthLayout } from '../../components/AuthLayout';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/TextInput';
import { messageOf } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { homeFor } from '../../lib/roles';
import type { FieldErrors } from '../../lib/validation';

export function LoginPage() {
  const { status, user, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in' && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : homeFor(user.role)} replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: FieldErrors = {};
    if (!email.trim()) errors.email = 'Enter your email.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome" text="Book visitors, check them in and see who's on site. Sign in with the account your administrator set up for you.">
      <h2>Sign in</h2>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate className="max-w-md">
        <TextInput label="Email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} autoFocus />
        <TextInput label="Password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <Button type="submit" arrow disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 mb-0 text-sm text-ink/70">Forgot your password? Ask an administrator to reset it.</p>
    </AuthLayout>
  );
}
