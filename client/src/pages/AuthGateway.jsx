import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { STUDENT_DEPTS, SETS, isValidEmail, suggestEmail, isValidMatric, passwordStrength } from '../utils.js';

// A dedicated, role-locked sign-in / registration page. The gateway config is
// passed in by the router (one static route per unique URL). Every form here is
// pinned to a single account type — a user of another role cannot register here
// (role is forced) and cannot sign in here (the backend rejects mismatched
// roles via `expectedRole`).
export default function AuthGateway({ gateway }) {
  // No gateway (shouldn't happen via the configured routes) → neutral page.
  if (!gateway) return <Navigate to="/access-denied" replace />;

  return <Gateway key={gateway.slug} gw={gateway} />;
}

function Gateway({ gw }) {
  const { login, register, verify, resend } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'register' ? 'register' : 'login');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  // supervisor verification step
  const [stage, setStage] = useState('form'); // 'form' | 'verify'
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');

  const [login_, setLogin] = useState({ email: '', password: '' });
  const [reg, setReg] = useState({
    name: '',
    email: '',
    password: '',
    dept: 'Computer Science',
    set: '2022/2023',
    matric: '',
    title: 'Dr.',
  });

  // Track which email fields have been blurred so we only flag a bad format
  // after the user has finished typing, not on the first keystroke.
  const [touched, setTouched] = useState({ loginEmail: false, regEmail: false });

  const isStudent = gw.role === 'student';

  // Inline validation. Only show the error once the field has content and has
  // been touched; show the ✓ as soon as the format is valid.
  // Students may sign in with their email OR their matric number.
  const loginEmailValid = isValidEmail(login_.email); // pure email (drives the typo suggestion)
  const loginIdValid = isStudent ? loginEmailValid || isValidMatric(login_.email) : loginEmailValid;
  const loginIdError =
    touched.loginEmail && login_.email && !loginIdValid
      ? isStudent
        ? 'Enter your email or matric number (e.g. ETC/22/001)'
        : 'Enter a valid email address'
      : '';
  const regEmailValid = isValidEmail(reg.email);
  const regEmailError = touched.regEmail && reg.email && !regEmailValid ? 'Enter a valid email address' : '';

  // "Did you mean …?" typo suggestions, only once an email is otherwise valid.
  const loginSuggestion = loginEmailValid ? suggestEmail(login_.email) : null;
  const regSuggestion = regEmailValid ? suggestEmail(reg.email) : null;

  // Matric number (students only).
  const matricValid = isValidMatric(reg.matric);
  const matricError = touched.matric && reg.matric && !matricValid ? 'Use the format ETC/22/001' : '';

  const reset = () => {
    setError('');
    setInfo('');
  };

  const doLogin = async () => {
    reset();
    if (!loginIdValid) {
      setTouched((t) => ({ ...t, loginEmail: true }));
      setError(isStudent ? 'Please enter your email or matric number' : 'Please enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      // Pin the login to this gateway's role so other roles are rejected here.
      // For students the identifier may be an email or a matric number.
      await login(login_.email, login_.password, gw.role);
      // Success → leave the login form and enter the app.
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    reset();
    if (!regEmailValid) {
      setTouched((t) => ({ ...t, regEmail: true }));
      setError('Please enter a valid email address');
      return;
    }
    if (gw.role === 'student' && !matricValid) {
      setTouched((t) => ({ ...t, matric: true }));
      setError('Please enter your matric number in the format ETC/22/001');
      return;
    }
    setBusy(true);
    try {
      // Role is forced by the gateway — never taken from user input. Department
      // and matric number only apply to students, so don't send them otherwise.
      const res = await register({
        ...reg,
        role: gw.role,
        dept: gw.role === 'student' ? reg.dept : '',
        matric: gw.role === 'student' ? reg.matric.trim().toUpperCase() : '',
        // Supervisors include their title in their full name (e.g. "Dr. Sarah
        // Okonkwo"), so we don't store a separate title — that would double it.
        title: '',
      });
      if (res.needsVerification) {
        setPendingEmail(res.email);
        setStage('verify');
        setInfo(res.devCode ? `Dev mode — your code is ${res.devCode}` : res.message);
      } else {
        // Registered and logged in straight away → enter the app.
        navigate('/', { replace: true });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async () => {
    reset();
    setBusy(true);
    try {
      await verify(pendingEmail, code);
      // Verified → enter the app.
      navigate('/', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doResend = async () => {
    reset();
    try {
      const res = await resend(pendingEmail);
      setInfo(res.devCode ? `New dev code: ${res.devCode}` : res.message);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div id="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">PROTECH</div>
        <div className="role-heading">
          <span className="role-card-icon">{gw.icon}</span>
          <span>{gw.label} Portal</span>
        </div>

        {stage === 'verify' ? (
          <>
            <label>Enter the 6-digit code sent to {pendingEmail}</label>
            <input
              className="code-input"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              onKeyDown={(e) => e.key === 'Enter' && doVerify()}
            />
            {info && <div className="auth-ok">{info}</div>}
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} onClick={doVerify} disabled={busy}>
              {busy ? 'Verifying...' : 'Verify & Continue'}
            </button>
            <div className="demo-hint">
              Didn't get it? <b style={{ cursor: 'pointer' }} onClick={doResend}>Resend code</b>
            </div>
          </>
        ) : (
          <>
            <div className="auth-tabs">
              <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => { setTab('login'); reset(); }}>
                Sign In
              </button>
              <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => { setTab('register'); reset(); }}>
                Register
              </button>
            </div>

            {tab === 'login' ? (
              <>
                <Field
                  label={isStudent ? 'Email or Matric No' : 'Email'}
                  type={isStudent ? 'text' : 'email'}
                  value={login_.email}
                  onChange={(e) => setLogin({ ...login_, email: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, loginEmail: true }))}
                  autoComplete={isStudent ? 'username' : 'email'}
                  error={loginIdError}
                  valid={loginIdValid}
                />
                {loginSuggestion && (
                  <div className="email-suggest">
                    Did you mean{' '}
                    <button type="button" onClick={() => setLogin({ ...login_, email: loginSuggestion })}>
                      {loginSuggestion}
                    </button>
                    ?
                  </div>
                )}
                <Field label="Password" type="password" value={login_.password} onChange={(e) => setLogin({ ...login_, password: e.target.value })} autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && doLogin()} />
                {error && <div className="auth-error">{error}</div>}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} onClick={doLogin} disabled={busy}>
                  {busy ? 'Signing in...' : `Sign In as ${gw.label}`}
                </button>
              </>
            ) : (
              <>
                <Field
                  label="Full Name"
                  value={reg.name}
                  onChange={(e) => setReg({ ...reg, name: e.target.value })}
                  autoComplete="name"
                />

                <Field
                  label="Email"
                  type="email"
                  value={reg.email}
                  onChange={(e) => setReg({ ...reg, email: e.target.value })}
                  onBlur={() => setTouched((t) => ({ ...t, regEmail: true }))}
                  autoComplete="email"
                  error={regEmailError}
                  valid={regEmailValid}
                />
                {regSuggestion && (
                  <div className="email-suggest">
                    Did you mean{' '}
                    <button type="button" onClick={() => setReg({ ...reg, email: regSuggestion })}>
                      {regSuggestion}
                    </button>
                    ?
                  </div>
                )}

                <Field label="Password" type="password" value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} autoComplete="new-password" help="At least 6 characters" />

                {reg.password && (() => {
                  const st = passwordStrength(reg.password);
                  return (
                    <div className={`pw-strength lvl-${st.level}`}>
                      <div className="pw-bars">
                        {[1, 2, 3, 4].map((i) => <span key={i} className={i <= st.level ? 'on' : ''} />)}
                      </div>
                      <span className="pw-strength-label">{st.label}</span>
                    </div>
                  );
                })()}

                {gw.role === 'student' && (
                  <SelectField label="Department" value={reg.dept} onChange={(e) => setReg({ ...reg, dept: e.target.value })}>
                    {STUDENT_DEPTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </SelectField>
                )}

                {gw.role === 'student' && (
                  <SelectField label="Academic Set" value={reg.set} onChange={(e) => setReg({ ...reg, set: e.target.value })}>
                    {SETS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </SelectField>
                )}

                {gw.role === 'student' && (
                  <Field
                    label="Matric Number"
                    value={reg.matric}
                    onChange={(e) => setReg({ ...reg, matric: e.target.value.toUpperCase() })}
                    onBlur={() => setTouched((t) => ({ ...t, matric: true }))}
                    error={matricError}
                    valid={matricValid}
                    help="e.g. ETC/22/001"
                  />
                )}


                {gw.role === 'observer' && (
                  <div className="role-info">👀 Guests can view and comment on projects. You can upgrade later by contacting an admin.</div>
                )}

                {error && <div className="auth-error">{error}</div>}
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} onClick={doRegister} disabled={busy}>
                  {busy ? 'Creating...' : `Create ${gw.label} Account`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Floating-label text input (notched outlined style). The placeholder=" " is
// required so the CSS :placeholder-shown check knows when the field is empty.
function Field({ label, type = 'text', value, onChange, onKeyDown, onBlur, autoComplete, help, error, valid }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && show ? 'text' : type;
  const showCheck = valid && !isPassword && !error;
  const cls = `float-field${isPassword ? ' float-field--password' : ''}${error ? ' float-field--error' : ''}${showCheck ? ' float-field--valid' : ''}`;
  return (
    <>
      <div className={cls}>
        <input
          type={inputType}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder=" "
          aria-invalid={error ? 'true' : undefined}
        />
        <label>{label}</label>
        {isPassword && (
          <button
            type="button"
            className="pw-toggle"
            tabIndex={-1}
            // Keep focus on the input so the floating label doesn't flicker.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
        {showCheck && <span className="field-valid" aria-hidden="true">✓</span>}
      </div>
      {error ? <div className="field-error">{error}</div> : help ? <div className="field-help">{help}</div> : null}
    </>
  );
}

// Floating-label select. A <select> always has a value, so its label stays in
// the raised position permanently.
function SelectField({ label, value, onChange, children }) {
  return (
    <div className="float-field float-field--select">
      <select value={value} onChange={onChange}>
        {children}
      </select>
      <label>{label}</label>
    </div>
  );
}
