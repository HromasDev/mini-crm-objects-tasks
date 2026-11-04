import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import ObjectsPage from './pages/ObjectsPage';
import ObjectCardPage from './pages/ObjectCardPage';
import TaskCardPage from './pages/TaskCardPage';
import MyTasksPage from './pages/MyTasksPage';

export default function App() {
  return (
    <AuthProvider>
      {/* basename из BASE_URL: приложение работает и из корня домена, и из подкаталога */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/objects" replace />} />
            <Route path="/objects" element={<ObjectsPage />} />
            <Route path="/objects/:id" element={<ObjectCardPage />} />
            <Route path="/tasks/:id" element={<TaskCardPage />} />
            <Route path="/my-tasks" element={<MyTasksPage />} />
            <Route path="*" element={<Navigate to="/objects" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
