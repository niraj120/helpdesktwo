import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getFirstAvailableRoute } from '../utils/loginRedirect';

interface RedirectToFirstRouteProps {
  permissions?: string[];
}

const RedirectToFirstRoute: React.FC<RedirectToFirstRouteProps> = ({ permissions = [] }) => {
  const navigate = useNavigate();
  const { customUrlPath } = useParams<{ customUrlPath: string }>();

  useEffect(() => {
    console.log('RedirectToFirstRoute - Permissions received:', permissions);
    
    const firstRoute = getFirstAvailableRoute(permissions);
    const cleanRoute = firstRoute.startsWith('/') ? firstRoute.substring(1) : firstRoute;
    const fullPath = `/${customUrlPath}/portal/${cleanRoute}`;
    
    console.log('RedirectToFirstRoute - Calculated route:', firstRoute);
    console.log('RedirectToFirstRoute - Full path:', fullPath);
    console.log('RedirectToFirstRoute - Navigating...');
    
    navigate(fullPath, { replace: true });
  }, [permissions, navigate, customUrlPath]);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '200px',
      fontSize: '16px',
      color: '#6B7280'
    }}>
      Redirecting to your default page...
    </div>
  );
};

export default RedirectToFirstRoute;