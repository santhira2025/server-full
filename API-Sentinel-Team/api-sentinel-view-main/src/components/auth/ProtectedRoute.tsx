import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import type { UserRole } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole === 'ADMIN' && !isAdmin) {
    return <Navigate to="/access-restricted" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
