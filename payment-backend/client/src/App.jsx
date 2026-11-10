import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiRequest } from './api.js';

function formatUnits(value) {
  return `${BigInt(value).toLocaleString()} units`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  };

  if (name === 'arrow') {
    return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  }
  if (name === 'send') {
    return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>;
  }
  if (name === 'wallet') {
    return <svg {...common}><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 14h.01" /><path d="M7 5V3h10v2" /></svg>;
  }
  if (name === 'clock') {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }
  if (name === 'logout') {
    return <svg {...common}><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" /></svg>;
  }
  if (name === 'spark') {
    return <svg {...common}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></svg>;
  }
  return null;
}

function Brand({ compact = false }) {
  return (
    <div className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark"><Icon name="spark" size={19} /></span>
      <span>northstar<span className="brand-light"> wallet</span></span>
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await apiRequest(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      onAuthenticated(user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <div className="demo-banner">DEVELOPER PORTFOLIO DEMO • SIMULATED CURRENCY ONLY</div>
      <header className="auth-header"><Brand /></header>
      <section className="auth-layout">
        <div className="auth-intro">
          <div className="eyebrow"><span className="status-dot" /> Full-Stack Portfolio Project • ACID Ledger Engine</div>
          <h1>High-Concurrency<br /><em>Payment Ledger</em><br />Architecture</h1>
          <p>Explore a portfolio project built to test concurrent transfers and balance integrity.</p>
          <div className="auth-note">
            <span className="note-icon"><Icon name="wallet" size={19} /></span>
            <span><strong>Simulated ledger</strong><small>Test balances only; no real currency.</small></span>
          </div>
        </div>
        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="card-kicker">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</span>
            <h2>{mode === 'login' ? 'Sign in to Demo Wallet' : 'Create your Demo Wallet account'}</h2>
            <p>{mode === 'login' ? 'Sign in to explore the portfolio demo.' : 'Create a demo account to explore the ledger.'}</p>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
          </div>
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="username">Email or username</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              minLength={3}
              maxLength={254}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="you@example.com or username"
            />
            <div className="label-row">
              <label htmlFor="password">Password</label>
              {mode === 'register' && <span>12 characters minimum</span>}
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'register' ? 12 : undefined}
              maxLength={72}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in (Demo)' : 'Create demo account'}
              {!busy && <Icon name="arrow" size={18} />}
            </button>
          </form>
          <p className="auth-footnote">Demo authentication for portfolio evaluation.</p>
        </div>
      </section>
      <footer className="auth-footer">
        <span>This is a demonstration project built for educational &amp; recruitment portfolio purposes. No real monetary transactions are processed; use demo-only credentials.</span>
      </footer>
    </main>
  );
}

function TransactionRow({ transaction, userId }) {
  const sent = transaction.sender_id === userId;
  const otherPerson = sent ? transaction.receiver_username : transaction.sender_username;

  return (
    <li className="transaction-row">
      <span className={`transaction-icon ${sent ? 'sent' : 'received'}`}>
        <Icon name={sent ? 'arrow' : 'arrow'} size={17} />
      </span>
      <span className="transaction-info">
        <strong>{sent ? `Sent to ${otherPerson}` : `Received from ${otherPerson}`}</strong>
        <small>{formatDate(transaction.created_at)}</small>
      </span>
      <span className={`transaction-amount ${sent ? 'negative' : 'positive'}`}>
        {sent ? '−' : '+'}{formatUnits(transaction.amount)}
      </span>
    </li>
  );
}

function Dashboard({ user, onLogout, onUserUpdated }) {
  const [recipients, setRecipients] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dashboardRequestController = useRef(null);

  const refreshDashboard = useCallback(async (signal) => {
    if (signal.aborted) return;
    setLoading(true);
    setError('');
    try {
      const [usersResult, transfersResult] = await Promise.all([
        apiRequest('/api/users', { signal }),
        apiRequest('/api/transfers', { signal })
      ]);
      if (signal.aborted) return;
      setRecipients(usersResult.users);
      setTransfers(transfersResult.transfers);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    dashboardRequestController.current = controller;
    refreshDashboard(controller.signal);
    return () => {
      controller.abort();
      dashboardRequestController.current = null;
    };
  }, [refreshDashboard]);

  async function handleTransfer(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    const parsedAmount = Number(amount);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a whole number of wallet units greater than zero.');
      return;
    }
    if (!recipientId) {
      setError('Choose a recipient before sending.');
      return;
    }

    const signal = dashboardRequestController.current?.signal;
    if (!signal || signal.aborted) return;
    setSending(true);
    try {
      await apiRequest('/api/transfers', {
        method: 'POST',
        body: JSON.stringify({ receiverId: Number(recipientId), amount: parsedAmount }),
        signal
      });
      if (signal.aborted) return;
      const { user: updatedUser } = await apiRequest('/api/users/me', { signal });
      if (signal.aborted) return;
      onUserUpdated(updatedUser);
      setAmount('');
      setNotice('Your transfer was sent successfully.');
      await refreshDashboard(signal);
    } catch (requestError) {
      if (!signal.aborted) setError(requestError.message);
    } finally {
      if (!signal.aborted) setSending(false);
    }
  }

  const latestTransfer = transfers[0];

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-label">YOUR SPACE</div>
        <div className="side-link active"><Icon name="wallet" size={18} /> Overview</div>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon"><Icon name="spark" size={17} /></span>
            <strong>Here for the little things.</strong>
            <p>Your wallet, ready when you are.</p>
          </div>
          <div className="profile-row">
            <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
            <span className="profile-name"><strong>{user.username}</strong><small>Personal wallet</small></span>
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="breadcrumb">My wallet <span>/</span> Overview</div>
          <div className="topbar-right">
            <span className="secure-label"><span className="secure-dot" /> Secure account</span>
            <button className="mobile-logout" type="button" onClick={onLogout} aria-label="Sign out"><Icon name="logout" size={19} /></button>
            <span className="top-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <p className="date-label">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p>
              <h1>Good to see you, {user.username} <span className="wave">✳</span></h1>
              <p className="welcome-subtitle">Here’s what’s happening with your wallet.</p>
            </div>
            <span className="account-pill"><span /> Account active</span>
          </section>

          <section className="overview-grid" aria-label="Wallet summary">
            <article className="balance-card">
              <div className="balance-topline">
                <span>AVAILABLE BALANCE</span>
                <span className="balance-icon"><Icon name="wallet" size={19} /></span>
              </div>
              <div className="balance-value">{formatUnits(user.balance)}</div>
              <div className="balance-bottom">
                <span><span className="balance-indicator" /> Ready to use</span>
                <span>All amounts in units</span>
              </div>
              <div className="balance-orbit orbit-one" />
              <div className="balance-orbit orbit-two" />
            </article>
            <article className="stat-card">
              <span className="stat-icon mint"><Icon name="send" size={18} /></span>
              <span className="stat-label">LAST TRANSFER</span>
              <strong>{latestTransfer ? formatDate(latestTransfer.created_at) : 'No transfers yet'}</strong>
              <small>{latestTransfer ? `${latestTransfer.sender_id === user.id ? 'Sent to' : 'Received from'} ${latestTransfer.sender_id === user.id ? latestTransfer.receiver_username : latestTransfer.sender_username}` : 'Your activity will show up here.'}</small>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel transfer-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">SEND MONEY</span>
                  <h2>Make a transfer</h2>
                </div>
                <span className="panel-heading-icon"><Icon name="send" size={18} /></span>
              </div>
              <p className="panel-description">Move wallet units to another Northstar member.</p>
              <form className="transfer-form" onSubmit={handleTransfer}>
                <label htmlFor="recipient">Send to</label>
                <div className="select-wrap">
                  <select
                    id="recipient"
                    value={recipientId}
                    onChange={(event) => setRecipientId(event.target.value)}
                    disabled={loading || recipients.length === 0}
                    required
                  >
                    <option value="">{loading ? 'Loading people…' : recipients.length ? 'Choose a recipient' : 'No other accounts yet'}</option>
                    {recipients.map((recipient) => (
                      <option key={recipient.id} value={recipient.id}>{recipient.username}</option>
                    ))}
                  </select>
                  <span className="select-chevron">⌄</span>
                </div>
                <label htmlFor="amount">Amount</label>
                <div className="amount-input-wrap">
                  <input
                    id="amount"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                  <span>UNITS</span>
                </div>
                <p className="form-hint">Transfers are processed securely and cannot be reversed.</p>
                {error && <p className="form-error" role="alert">{error}</p>}
                {notice && <p className="form-success" role="status">{notice}</p>}
                <button className="button button-primary transfer-submit" type="submit" disabled={sending || loading || recipients.length === 0}>
                  {sending ? 'Sending…' : 'Send transfer'} {!sending && <Icon name="arrow" size={18} />}
                </button>
              </form>
            </article>

            <article className="panel activity-panel">
              <div className="panel-heading activity-heading">
                <div>
                  <span className="panel-kicker">YOUR WALLET</span>
                  <h2>Recent activity</h2>
                </div>
                <span className="panel-heading-icon"><Icon name="clock" size={18} /></span>
              </div>
              {loading ? (
                <div className="empty-state"><span className="loader" /> Loading activity…</div>
              ) : transfers.length > 0 ? (
                <ul className="transaction-list">
                  {transfers.map((transfer) => <TransactionRow key={transfer.id} transaction={transfer} userId={user.id} />)}
                </ul>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><Icon name="clock" size={20} /></span>
                  <strong>It’s quiet here for now</strong>
                  <span>Your sent and received transfers will appear here.</span>
                </div>
              )}
              {transfers.length > 0 && <p className="activity-footnote">Showing your 20 most recent transfers.</p>}
            </article>
          </section>
          <footer className="dashboard-footer"><span>© {new Date().getFullYear()} Northstar Wallet</span><span>Simple, secure, and yours.</span></footer>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/api/users/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((requestError) => {
        if (active && !(requestError instanceof ApiError && requestError.status === 401)) {
          setSessionError(requestError.message);
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    setSessionError('');
    setUser(null);
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (requestError) {
      setSessionError(`You have been signed out, but the server could not confirm logout: ${requestError.message}`);
    }
  }

  if (checkingSession) {
    return <main className="loading-screen"><Brand /><span className="loader" /><p>Opening your wallet…</p></main>;
  }

  if (user) {
    return (
      <>
        {sessionError && <div className="session-alert" role="alert">{sessionError}</div>}
        <Dashboard user={user} onLogout={handleLogout} onUserUpdated={setUser} />
      </>
    );
  }

  return (
    <>
      {sessionError && <div className="session-alert" role="alert">{sessionError}</div>}
      <AuthScreen onAuthenticated={(authenticatedUser) => { setSessionError(''); setUser(authenticatedUser); }} />
    </>
  );
}
