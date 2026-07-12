import React, { useState } from 'react';
import { api } from '../api.js';
import { colors } from '../../../shared/tokens.js';
import { btnStyle, fieldStyle, labelStyle, cardStyle } from './shared.js';

const ERROR_MESSAGES = {
  valid_email_required: 'Enter a valid email address.',
  password_too_short: 'Password must be at least 6 characters.',
  email_already_registered: 'That email is already in use — try logging in instead.',
  already_claimed: 'This access link has already been set up — log in instead.',
  email_and_password_required: 'Enter your email and password.',
  invalid_credentials: 'Incorrect email or password.',
  access_revoked: 'This access has been revoked. Ask the host for a new link.',
  invalid_link: "This access link isn't valid. Ask the host for a new one.",
};

// Shown when a "My Access Team" link resolves to a valid, active team
// member. A not-yet-claimed member sets their own email/password once
// (turning the invite into a real login); a claimed member just logs back
// in with what they set the first time — same link, either way.
export default function TeamAuthPanel({ pending, token, onAuthenticated }) {
  const [email, setEmail] = useState(pending.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const claiming = !pending.claimed;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (claiming && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = claiming
        ? await api.claimTeamAccess(token, email.trim(), password)
        : await api.loginTeamMember(email.trim(), password);
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
        {claiming ? `Set up access for ${pending.name}` : `Log in as ${pending.name}`}
      </div>
      <div style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 22 }}>
        {claiming
          ? 'Choose an email and password — you\'ll use this same link to log back in from any device.'
          : 'Enter the password you set the first time you opened this link.'}
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={labelStyle()}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" style={fieldStyle()} />

        <label style={labelStyle()}>Password</label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ ...fieldStyle(), paddingRight: 56 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              color: colors.textMid,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '6px 8px',
              fontFamily: "'Space Grotesk',sans-serif",
            }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {claiming && (
          <>
            <label style={labelStyle()}>Confirm password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={fieldStyle()}
            />
          </>
        )}

        {error && <div style={{ fontSize: 13, color: colors.redLight }}>{error}</div>}
        <button type="submit" disabled={submitting} style={btnStyle(colors.lime, '#0B0C0E')}>
          {submitting ? 'Please wait…' : claiming ? 'Set up access' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
