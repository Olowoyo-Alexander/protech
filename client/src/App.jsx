import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useLive } from './context/SocketContext.jsx';
import { ROLE_GATEWAYS } from './utils.js';
import AuthGateway from './pages/AuthGateway.jsx';
import AccessNotice from './pages/AccessNotice.jsx';
import Layout from './components/Layout.jsx';
import Feed from './pages/Feed.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Approvals from './pages/Approvals.jsx';
import MyProjects from './pages/MyProjects.jsx';
import Bookmarks from './pages/Bookmarks.jsx';
import Groups from './pages/Groups.jsx';
import Messages from './pages/Messages.jsx';
import Analytics from './pages/Analytics.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import SupervisorDashboard from './pages/SupervisorDashboard.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import AdminModeration from './pages/AdminModeration.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import Profile from './pages/Profile.jsx';
import WelcomeSplash from './components/WelcomeSplash.jsx';

function Toasts() {
  const { toasts } = useLive();
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

// The landing page depends on the role: admins/supervisors get a dashboard.
function Home() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'supervisor') return <SupervisorDashboard />;
  return <Feed />;
}

// Wraps the logged-in app pages in the shared Layout (topbar/sidebar) + toasts.
function AppLayout() {
  return (
    <>
      <Layout>
        <Outlet />
      </Layout>
      <Toasts />
    </>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="spinner" />;

  const isAdmin = user?.role === 'admin';
  const isSupervisor = user?.role === 'supervisor';
  // After logout, return to the unique gateway of the role just signed out. A
  // fresh visitor with no remembered gateway gets the neutral notice — we never
  // auto-reveal a role's private URL.
  const lastGateway = localStorage.getItem('prostech_last_gateway');

  return (
    <>
    <WelcomeSplash />
    <Routes>
      {/* Each role's unique login/registration URL is ALWAYS its own page —
          independent of any active session, so one link never resolves to
          another role's page (e.g. an admin session won't hijack it). */}
      {Object.values(ROLE_GATEWAYS).map((gw) => (
        <Route key={gw.slug} path={`/${gw.slug}`} element={<AuthGateway gateway={gw} />} />
      ))}
      <Route path="/access-denied" element={<AccessNotice />} />

      {user ? (
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/analytics" element={<Analytics />} />
          {(isSupervisor || isAdmin) && <Route path="/approvals" element={<Approvals />} />}
          {isAdmin && <Route path="/admin/users" element={<AdminUsers />} />}
          {isAdmin && <Route path="/admin/moderation" element={<AdminModeration />} />}
          {isAdmin && <Route path="/admin/settings" element={<AdminSettings />} />}
          <Route path="/profile" element={<Profile />} />
          <Route path="/my-projects" element={<MyProjects />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/saved" element={<Bookmarks />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to={lastGateway ? `/${lastGateway}` : '/access-denied'} replace />} />
      )}
    </Routes>
    </>
  );
}
