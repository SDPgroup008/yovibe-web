import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Route definition types
export interface RouteParams {
  [key: string]: string | number | boolean;
}

export interface RouteDefinition {
  path: string;
  component: React.ComponentType<any>;
  exact?: boolean;
  middleware?: RouteMiddleware[];
}

export interface RouteMiddleware {
  (params: RouteParams, path: string): boolean | RouteParams;
}

export interface RouterContextType {
  currentPath: string;
  params: RouteParams;
  navigate: (path: string, replace?: boolean) => void;
  goBack: () => void;
  canGoBack: boolean;
}

// Router context
const RouterContext = createContext<RouterContextType | null>(null);

// Custom hook to use router
export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};

// Path matching utility
export class PathMatcher {
  static match(routePath: string, currentPath: string): RouteParams | null {
    // Exact match
    if (routePath === currentPath) {
      return {};
    }

    // Split paths into segments
    const routeSegments = routePath.split('/').filter(Boolean);
    const currentSegments = currentPath.split('/').filter(Boolean);

    // Different lengths can't match unless route has wildcards
    if (routeSegments.length !== currentSegments.length && !routePath.includes('*')) {
      return null;
    }

    const params: RouteParams = {};

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const currentSegment = currentSegments[i];

      // Parameter segment (starts with :)
      if (routeSegment.startsWith(':')) {
        const paramName = routeSegment.slice(1);
        params[paramName] = currentSegment;
        continue;
      }

      // Wildcard segment
      if (routeSegment === '*') {
        continue;
      }

      // Optional segment (ends with ?)
      if (routeSegment.endsWith('?')) {
        const baseSegment = routeSegment.slice(0, -1);
        if (baseSegment !== currentSegment) {
          return null;
        }
        continue;
      }

      // Exact segment match
      if (routeSegment !== currentSegment) {
        return null;
      }
    }

    return params;
  }

  static buildPath(routePath: string, params: RouteParams): string {
    let path = routePath;

    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, String(value));
    });

    return path;
  }
}

// Route renderer component
interface RouteRendererProps {
  routes: RouteDefinition[];
  fallback?: React.ComponentType;
}

export const RouteRenderer: React.FC<RouteRendererProps> = ({ routes, fallback: Fallback = NotFound }) => {
  const { currentPath, params } = useRouter();

  // Find matching route
  for (const route of routes) {
    const matchParams = PathMatcher.match(route.path, currentPath);

    if (matchParams !== null) {
      // Check middleware
      let finalParams = { ...params, ...matchParams };

      if (route.middleware) {
        for (const middleware of route.middleware) {
          const result = middleware(finalParams, currentPath);

          if (result === false) {
            // Middleware blocked the route
            return <Fallback />;
          }

          if (typeof result === 'object') {
            // Middleware modified params
            finalParams = { ...finalParams, ...result };
          }
        }
      }

      const Component = route.component;
      return <Component {...finalParams} />;
    }
  }

  // No route matched
  return <Fallback />;
};

// 404 Not Found component
const NotFound: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>404 - Page Not Found</Text>
    <Text style={styles.subtitle}>
      The page you're looking for doesn't exist.
    </Text>
  </View>
);

// Method Not Allowed component
export const MethodNotAllowed: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>405 - Method Not Allowed</Text>
    <Text style={styles.subtitle}>
      This HTTP method is not supported for this route.
    </Text>
  </View>
);

// Main router provider
interface RouterProviderProps {
  routes: RouteDefinition[];
  fallback?: React.ComponentType;
  children: React.ReactNode;
}

export const RouterProvider: React.FC<RouterProviderProps> = ({
  routes,
  fallback,
  children
}) => {
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [params, setParams] = useState<RouteParams>({});
  const [history, setHistory] = useState<string[]>([
    typeof window !== 'undefined' ? window.location.pathname : '/'
  ]);

  // Handle browser navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const newPath = window.location.pathname;
      setCurrentPath(newPath);
      setHistory(prev => {
        const newHistory = [...prev];
        // Remove current path and add new one
        if (newHistory[newHistory.length - 1] !== newPath) {
          newHistory.push(newPath);
        }
        return newHistory;
      });
    };

    window.addEventListener('popstate', handlePopState);

    // Handle initial deep link
    const initialPath = window.location.pathname;
    if (initialPath !== '/' && initialPath !== '/login' && initialPath !== '/signup') {
      // Find matching route for deep link
      for (const route of routes) {
        const matchParams = PathMatcher.match(route.path, initialPath);
        if (matchParams !== null) {
          setParams(matchParams);
          break;
        }
      }
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [routes]);

  // Navigation functions
  const navigate = (path: string, replace: boolean = false) => {
    if (typeof window === 'undefined') return;

    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }

    setCurrentPath(path);
    setHistory(prev => {
      if (replace) {
        return [...prev.slice(0, -1), path];
      }
      return [...prev, path];
    });

    // Update params for new path
    for (const route of routes) {
      const matchParams = PathMatcher.match(route.path, path);
      if (matchParams !== null) {
        setParams(matchParams);
        break;
      }
    }
  };

  const goBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // Remove current
      const previousPath = newHistory[newHistory.length - 1];

      navigate(previousPath, true); // Replace current with previous
    }
  };

  const canGoBack = history.length > 1;

  const contextValue: RouterContextType = {
    currentPath,
    params,
    navigate,
    goBack,
    canGoBack
  };

  return (
    <RouterContext.Provider value={contextValue}>
      {children || <RouteRenderer routes={routes} fallback={fallback} />}
    </RouterContext.Provider>
  );
};

// Link component for navigation
interface LinkProps {
  to: string;
  replace?: boolean;
  children: React.ReactNode;
  style?: any;
  onPress?: () => void;
}

export const Link: React.FC<LinkProps> = ({
  to,
  replace = false,
  children,
  style,
  onPress
}) => {
  const { navigate } = useRouter();

  const handlePress = () => {
    if (onPress) onPress();
    navigate(to, replace);
  };

  return (
    <Text style={style} onPress={handlePress}>
      {children}
    </Text>
  );
};

// Navigation hook for programmatic navigation
export const useNavigation = () => {
  const { navigate, goBack, canGoBack, currentPath, params } = useRouter();

  return {
    navigate,
    goBack,
    canGoBack,
    currentPath,
    params,
    // Utility functions
    navigateToEvent: (eventId: string) => navigate(`/events/${eventId}`),
    navigateToVenue: (venueId: string) => navigate(`/venues/${venueId}`),
    navigateToEvents: () => navigate('/events'),
    navigateToVenues: () => navigate('/venues'),
    navigateToMap: () => navigate('/map'),
    navigateToCalendar: () => navigate('/calendar'),
    navigateToProfile: () => navigate('/profile')
  };
};

// Route guard HOC
export const withRouteGuard = <P extends object>(
  Component: React.ComponentType<P>,
  guard: (params: RouteParams) => boolean
) => {
  return (props: P) => {
    const { currentPath, params } = useRouter();

    if (!guard(params)) {
      return <NotFound />;
    }

    return <Component {...props} />;
  };
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    padding: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10
  },
  subtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center'
  }
});

export default RouterProvider;