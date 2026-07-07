import { Link } from 'react-router-dom';
import { ROLE_GATEWAYS } from '../utils.js';

// Public landing for logged-out visitors (and unknown/old paths). It offers the
// Student, Supervisor and Guest portals so people can actually get in. Admin is
// intentionally NOT listed — administrators use their own private access link.
const PUBLIC_ROLES = ['student', 'supervisor', 'guest'];

export default function AccessNotice() {
  return (
    <div id="auth-screen">
      <div className="auth-box" style={{ textAlign: 'center' }}>
        <div className="auth-logo">PROTECH</div>
        <div className="auth-sub">Collaborative Student Innovation Hub</div>
        <div className="role-heading" style={{ justifyContent: 'center' }}>
          <span>Choose how you’d like to continue</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '1.25rem' }}>
          {PUBLIC_ROLES.map((key) => {
            const gw = ROLE_GATEWAYS[key];
            return (
              <Link
                key={gw.slug}
                to={`/${gw.slug}`}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span>{gw.icon}</span> Continue as {gw.label}
              </Link>
            );
          })}
        </div>

        <p style={{ color: 'var(--slate)', fontSize: 12, lineHeight: 1.6, marginTop: '1.25rem' }}>
          Administrators sign in via a dedicated private link — contact your administrator if you need it.
        </p>
      </div>
    </div>
  );
}
