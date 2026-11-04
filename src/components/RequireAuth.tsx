import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import type { ReactElement } from 'react';
import { useAuth } from '../context/AuthContext';

export function RequireAuth({ children }: { children: ReactElement }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
