import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/pages/LoginPage';
import { makeUser } from '../helpers/context';
import { renderWithProviders } from '../helpers/render';

function renderLogin(login = vi.fn().mockResolvedValue(makeUser()), route = '/login') {
  const utils = renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<h1>Dashboard</h1>} />
      <Route path="/users" element={<h1>Users page</h1>} />
    </Routes>,
    { route, user: null, auth: { login } },
  );

  return { ...utils, login };
}

const email = () => screen.getByLabelText('Email address');
const password = () => screen.getByLabelText('Password');
const signIn = () => screen.getByRole('button', { name: 'Sign in' });

describe('form', () => {
  it('renders the heading and both fields', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(email()).toHaveAttribute('type', 'email');
    expect(password()).toHaveAttribute('type', 'password');
  });

  it('marks both fields required with the right autocomplete hints', () => {
    renderLogin();

    expect(email()).toBeRequired();
    expect(email()).toHaveAttribute('autocomplete', 'email');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('shows no error before a submission', () => {
    renderLogin();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(email()).not.toHaveAttribute('aria-invalid', 'true');
  });
});

describe('submitting', () => {
  it('calls login with the entered credentials', async () => {
    const login = vi.fn().mockResolvedValue(makeUser());
    renderLogin(login);

    await userEvent.clear(email());
    await userEvent.type(email(), 'ada@example.com');
    await userEvent.clear(password());
    await userEvent.type(password(), 'secret');
    await userEvent.click(signIn());

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' }),
    );
  });

  it('navigates to the dashboard on success', async () => {
    renderLogin();

    await userEvent.click(signIn());

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('honours a redirect parameter', async () => {
    renderLogin(vi.fn().mockResolvedValue(makeUser()), '/login?redirect=%2Fusers');

    await userEvent.click(signIn());

    expect(await screen.findByRole('heading', { name: 'Users page' })).toBeInTheDocument();
  });

  it('shows the server message when the credentials are rejected', async () => {
    const login = vi.fn().mockRejectedValue(new Error('These credentials do not match.'));
    renderLogin(login);

    await userEvent.click(signIn());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('These credentials do not match.');
  });

  it('marks the fields invalid and describes the error', async () => {
    renderLogin(vi.fn().mockRejectedValue(new Error('Nope')));

    await userEvent.click(signIn());
    await screen.findByRole('alert');

    expect(email()).toHaveAttribute('aria-invalid', 'true');
    expect(password()).toHaveAccessibleDescription('Nope');
  });

  it('stays on the login page after a failure', async () => {
    renderLogin(vi.fn().mockRejectedValue(new Error('Nope')));

    await userEvent.click(signIn());
    await screen.findByRole('alert');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('clears a previous error on the next attempt', async () => {
    const login = vi.fn().mockRejectedValueOnce(new Error('Nope')).mockResolvedValue(makeUser());
    renderLogin(login);

    await userEvent.click(signIn());
    await screen.findByRole('alert');

    await userEvent.click(signIn());

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('re-enables the button after a failure', async () => {
    renderLogin(vi.fn().mockRejectedValue(new Error('Nope')));

    await userEvent.click(signIn());
    await screen.findByRole('alert');

    expect(signIn()).toBeEnabled();
  });

  it('disables the button while the request is in flight', async () => {
    let release: (value: unknown) => void = () => undefined;
    const login = vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve)));
    renderLogin(login);

    await userEvent.click(signIn());

    await waitFor(() => expect(signIn()).toBeDisabled());
    release(makeUser());
  });
});
