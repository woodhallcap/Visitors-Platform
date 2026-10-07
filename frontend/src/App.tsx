import { BrowserRouter, Route, Routes } from 'react-router';
import { HomeRedirect, RequireAuth, RequireRole } from './components/guards';
import { AuthProvider } from './lib/auth';
import { ComingSoon } from './pages/ComingSoon';
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
                  <ComingSoon />
                </RequireRole>
              }
            />
            <Route
              path="departments"
              element={
                <RequireRole roles={['admin']}>
                  <ComingSoon />
                </RequireRole>
              }
            />
            <Route path="*" element={<ComingSoon />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
