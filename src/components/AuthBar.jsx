import { useAuth } from '../firebase/auth.jsx';

export default function AuthBar() {
  const { user, loading, error, configured, mockMode, isSignedIn, signIn, signOut } = useAuth();

  if (loading) {
    return <div className="auth-bar auth-bar-muted">Checking sign-in…</div>;
  }

  if (mockMode) {
    return (
      <div className="auth-bar">
        <span className="badge badge-warn">Mock inventory sync</span>
        {!isSignedIn ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={signIn}>Enable mock session</button>
        ) : (
          <>
            <span className="auth-email">{user.email}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
          </>
        )}
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="auth-bar auth-bar-muted" title="Set VITE_FIREBASE_* in .env or use VITE_FIREBASE_MOCK=true">
        KLFS inventory sync not configured
      </div>
    );
  }

  return (
    <div className="auth-bar">
      {error && <span className="auth-error">{error}</span>}
      {isSignedIn ? (
        <>
          <span className="auth-email" title={user.email}>{user.displayName || user.email}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => signIn().catch(() => {})}>
          Sign in with Google
        </button>
      )}
    </div>
  );
}
