import { BrowserRouter, Route, Routes } from 'react-router';
import { HomeRedirect, RequireAuth, RequireRole } from './components/guards';
import { AuthProvider } from './lib/auth';
import { ComingSoon } from './pages/ComingSoon';
import { OnSitePage } from './pages/security/OnSitePage';
import { TodayLogPage } from './pages/security/TodayLogPage';
import { VisitSearchPage } from './pages/visits/VisitSearchPage';
import { TodayPage } from './pages/reception/TodayPage';
import { WalkInPage } from './pages/reception/WalkInPage';
import { BookVisitorPage } from './pages/staff/BookVisitorPage';
import { MyVisitorsPage } from './pages/staff/MyVisitorsPage';
import { DashboardPage } from './pages/it/DashboardPage';
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SetPasswordPage } from './pages/auth/SetPasswordPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route path="/" element={<RequireAuth />}>
            <Route index element={<HomeRedirect />} />
            <Route
              path="users"
              element={
                <RequireRole roles={['admin', 'it']}>
                  <UsersPage />
                </RequireRole>
              }
            />
            <Route
              path="departments"
              element={
                <RequireRole roles={['admin']}>
                  <DepartmentsPage />
                </RequireRole>
              }
            />
            <Route path="book" element={<RequireRole roles={['staff']}><BookVisitorPage /></RequireRole>} />
            <Route path="my-visitors" element={<RequireRole roles={['staff']}><MyVisitorsPage /></RequireRole>} />
            <Route path="reception/walk-in" element={<RequireRole roles={['reception', 'admin']}><WalkInPage /></RequireRole>} />
            <Route path="reception/today" element={<RequireRole roles={['reception', 'admin', 'it']}><TodayPage /></RequireRole>} />
            <Route path="visits" element={<RequireRole roles={['reception', 'admin', 'it']}><VisitSearchPage title="All visits" description="Search every visit by date, visitor, company or host." /></RequireRole>} />
            <Route path="security/on-site" element={<RequireRole roles={['security']}><OnSitePage /></RequireRole>} />
            <Route path="security/log" element={<RequireRole roles={['security']}><TodayLogPage /></RequireRole>} />
            <Route path="security/history" element={<RequireRole roles={['security']}><VisitSearchPage title="History" description="Look up past and upcoming visits." /></RequireRole>} />
            <Route path="it/dashboard" element={<RequireRole roles={['it', 'admin']}><DashboardPage /></RequireRole>} />
            <Route path="*" element={<ComingSoon />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
