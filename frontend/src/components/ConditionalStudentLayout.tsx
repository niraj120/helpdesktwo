import { ReactNode } from 'react';
import StudentLayout from './StudentLayout';
import { isStudentSession } from '../utils/authToken';

interface ConditionalStudentLayoutProps {
  children: ReactNode;
  hideHeaderWhenAuth?: boolean;
}

/**
 * Wrapper that conditionally wraps content with StudentLayout based on authentication
 * If a STUDENT is logged in: wraps with StudentLayout
 * Otherwise (logged out, or a non-student session such as a counselor/admin whose
 * project-portal token is shared via localStorage): renders children directly so
 * the student login/public view shows instead of the authenticated candidate shell.
 */
export const ConditionalStudentLayout = ({
  children,
  hideHeaderWhenAuth = true
}: ConditionalStudentLayoutProps) => {
  if (isStudentSession()) {
    return <StudentLayout>{children}</StudentLayout>;
  }

  return <>{children}</>;
};

export default ConditionalStudentLayout;
