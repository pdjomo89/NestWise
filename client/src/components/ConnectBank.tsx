import { useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useAction, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useLang } from '../prefs';

// Where Plaid sends the browser back after an OAuth bank login. Must match an
// "Allowed redirect URI" registered in the Plaid dashboard (production/Trial).
// Same-origin so it works on localhost and through remote port-forwarding.
const REDIRECT_URI = window.location.origin + '/';

// Plaid Link reloads the whole page during an OAuth redirect, so the in-memory
// link token is lost. We stash it here to resume the flow on the way back.
const TOKEN_KEY = 'plaid_link_token';

// True when the current page load is Plaid returning from an OAuth bank login.
const oauthStateId = () =>
  new URLSearchParams(window.location.search).get('oauth_state_id');

function errorMessage(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e);
  // Convex wraps server errors like "[CONVEX ...] Server Error Uncaught
  // Error: <real message> at <stack>". Pull out just the real message.
  const u = msg.lastIndexOf('Uncaught ');
  if (u >= 0) msg = msg.slice(u + 'Uncaught '.length);
  msg = msg.replace(/^(?:Convex)?Error:\s*/i, '');
  // Strip any inlined stack frames ("... at handler (file:line)").
  msg = msg.split(/\s+at\s+\S/)[0];
  return msg.trim();
}

export default function ConnectBank() {
  const { t } = useLang();
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const sync = useAction(api.plaid.sync);
  const disconnect = useAction(api.plaid.disconnect);
  const connections = useQuery(api.plaid.listConnections);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when we're resuming an OAuth flow after the bank redirected back.
  const [oauthReturn, setOauthReturn] = useState(false);

  // Drop the saved token and strip the oauth_state_id from the URL (without a
  // reload) so a refresh doesn't try to re-resume a finished flow.
  function clearOAuth() {
    localStorage.removeItem(TOKEN_KEY);
    setOauthReturn(false);
    if (oauthStateId()) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // On load, if Plaid redirected us back from an OAuth bank, restore the link
  // token it was using so Link can pick the flow back up.
  useEffect(() => {
    if (oauthStateId()) {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) {
        setOauthReturn(true);
        setLinkToken(saved);
      } else {
        // Nothing to resume (e.g. token expired) — clean the stray param.
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    // Tells Link to resume the in-progress OAuth flow instead of starting over.
    receivedRedirectUri: oauthReturn ? window.location.href : undefined,
    onSuccess: async (publicToken, metadata) => {
      setBusy(true);
      setStatus(t('Importing your accounts and transactions…'));
      try {
        const r = await exchange({
          publicToken,
          institutionName: metadata.institution?.name,
        });
        setStatus(
          `${t('Imported')} ${r.imported} ${t('transactions from')} ${r.items} ${t('bank(s).')}`
        );
      } catch (e) {
        setStatus(errorMessage(e));
      } finally {
        setBusy(false);
        setLinkToken(null);
        clearOAuth();
      }
    },
    onExit: () => {
      setLinkToken(null);
      clearOAuth();
    },
  });

  // Once we have a token and Link is initialized, pop the bank-login flow.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function startConnect() {
    setStatus(null);
    setBusy(true);
    try {
      const { linkToken } = await createLinkToken({ redirectUri: REDIRECT_URI });
      // Persist before opening so an OAuth redirect can resume after reload.
      localStorage.setItem(TOKEN_KEY, linkToken);
      setOauthReturn(false);
      setLinkToken(linkToken);
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setStatus(t('Syncing…'));
    try {
      const r = await sync();
      setStatus(`${t('Synced')} ${r.imported} ${t('transactions.')}`);
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: string) {
    setBusy(true);
    try {
      await disconnect({ itemId });
      setStatus(t('Disconnected. Imported data was kept.'));
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const hasConnections = (connections?.length ?? 0) > 0;

  return (
    <section className="panel">
      <h2>{t('Connect a bank')}</h2>
      <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>
        {t(
          'Securely link a bank via Plaid to pull your accounts and spending automatically. Your bank login is handled by Plaid — NestWise never sees your credentials.'
        )}
      </p>

      <div className="row-form" style={{ alignItems: 'center' }}>
        <button type="button" onClick={startConnect} disabled={busy}>
          {busy ? t('Working…') : t('+ Connect bank')}
        </button>
        {hasConnections && (
          <button type="button" className="btn-save" onClick={syncNow} disabled={busy}>
            {t('Sync now')}
          </button>
        )}
      </div>

      {status && (
        <p className="muted small" style={{ marginTop: 12 }}>
          {status}
        </p>
      )}

      {hasConnections && (
        <ul className="srclist" style={{ marginTop: 12 }}>
          {connections!.map((c) => (
            <li key={c.itemId}>
              <span className="pill checking">{t('Bank')}</span>
              <span className="src-label">{c.institutionName}</span>
              <span className="src-detail muted">
                {c.accountCount} {t('accounts')}
              </span>
              <span className="src-monthly" />
              <button
                className="link-btn"
                title={t('Disconnect')}
                onClick={() => remove(c.itemId)}
                disabled={busy}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
