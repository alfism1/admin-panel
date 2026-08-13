import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/core/auth/useAuth';
import { normalizeError } from '@/core/data/errors';
import { Button } from '@/core/ui/button';
import { Input } from '@/core/ui/input';
import { Label } from '@/core/ui/label';
import { USE_MOCK } from '@/core/data/apiClient';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = React.useState(USE_MOCK ? 'admin@example.com' : '');
  const [password, setPassword] = React.useState(USE_MOCK ? 'password' : '');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      navigate(params.get('redirect') ?? '/', { replace: true });
    } catch (caught) {
      setError(normalizeError(caught).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your account to continue.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            aria-invalid={Boolean(error)}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'login-error' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? (
          <p id="login-error" role="alert" className="text-destructive text-sm font-medium">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      {USE_MOCK ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
          <p className="text-foreground mb-1 font-medium">Demo accounts (password: password)</p>
          <ul className="space-y-0.5">
            <li>admin@example.com — full access</li>
            <li>editor@example.com — posts only</li>
            <li>viewer@example.com — read-only (disabled account)</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
