import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

const ERROR_MESSAGES = {
  name_required: 'Enter your name.',
  valid_email_required: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 6 characters.',
  invalid_invite_code: 'Incorrect invite code.',
  email_already_registered: 'That email is already registered — log in instead.',
  email_and_password_required: 'Enter your email and password.',
  invalid_credentials: 'Incorrect email or password.',
};

export default function HostAuthPanel({ onAuthenticated }) {
  const [mode, setMode] = useState('signup'); // signup | login
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === 'signup'
          ? await api.createHost(name.trim(), email.trim(), password, inviteCode.trim())
          : await api.loginHost(email.trim(), password);
      if (result.error) {
        setError(ERROR_MESSAGES[result.error] || 'Something went wrong. Try again.');
        return;
      }
      onAuthenticated(result);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={cardStyle(400)}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 20, color: colors.textPrimary, marginBottom: 6 }}>
        {mode === 'signup' ? 'Create your host account' : 'Log in'}
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        {mode === 'signup'
          ? 'Register as an event host to manage events, the gate reader, and cash payouts.'
          : 'Log in to your host account to continue.'}
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <>
            <label style={labelStyle()}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Dlamini" style={fieldStyle()} />
          </>
        )}

        <label style={labelStyle()}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" style={fieldStyle()} />

        <label style={labelStyle()}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={fieldStyle()}
        />

        {mode === 'signup' && (
          <>
            <label style={labelStyle()}>Invite code</label>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Ask the site admin for this"
              style={fieldStyle()}
            />
          </>
        )}

        {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
        <button type="submit" disabled={submitting} style={btnStyle(colors.lime, '#0B0C0E')}>
          {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(null); }}
        style={{ ...btnStyle('transparent', colors.textMid, true), marginTop: 12, width: '100%' }}
      >
        {mode === 'signup' ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
      </button>
    </div>
  );
}
