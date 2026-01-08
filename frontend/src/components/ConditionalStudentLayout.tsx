import { ReactNode } from 'react';
import StudentLayout from './StudentLayout';

interface ConditionalStudentLayoutProps {
  children: ReactNode;
  hideHeaderWhenAuth?: boolean;
}

/**
 * Wrapper that conditionally wraps content with StudentLayout based on authentication
 * If user is logged in: wraps with StudentLayout
 * If user is logged out: renders children directly
 */
export const ConditionalStudentLayout = ({ 
  children, 
  hideHeaderWhenAuth = true 
}: ConditionalStudentLayoutProps) => {
  const isAuthenticated = !!localStorage.getItem('authToken');

  if (isAuthenticated) {
    return <StudentLayout>{children}</StudentLayout>;
  }

  return <>{children}</>;
};

export default ConditionalStudentLayout;
