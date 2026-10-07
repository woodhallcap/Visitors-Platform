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
    // Only same-site paths: '//host' would be a protocol-relative redirect off site.
    const safe = from && /^\/(?![/\\])/.test(from) && from !== '/login';
    return <Navigate to={safe ? from : homeFor(user.role)} replace />;
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
      <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-copper-dark uppercase">Staff portal</p>
      <h2 className="mb-2 text-[2rem]">Sign in</h2>
      <p className="mb-6 text-ink/70">Use the email and password your administrator set up for you.</p>
      {error && <Banner tone="error">{error}</Banner>}
      <form onSubmit={submit} noValidate>
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
