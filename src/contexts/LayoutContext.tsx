import React, { createContext, useContext, ReactNode, useState } from 'react';
import { View } from 'react-native';
import { useDeviceType } from '../utils/ResponsiveDesign';

// Define the shape of the layout state
interface LayoutState {
  sidebarWidth: number;
  isSidebarVisible: boolean;
  bottomBarHeight: number;
  headerRight: ReactNode | null;
  setHeaderRight: (content: ReactNode | null) => void;
}

// Define the context with a default value
const LayoutContext = createContext<LayoutState | undefined>(undefined);

// Provider component
interface LayoutProviderProps {
  children: ReactNode;
}

export const LayoutProvider: React.FC<LayoutProviderProps> = ({ children }) => {
  const { isLargeScreen } = useDeviceType();
  const [headerRight, setHeaderRight] = useState<ReactNode | null>(null);

  // Define layout dimensions based on screen size
  const sidebarWidth = 80; // Width of the desktop sidebar
  const bottomBarHeight = 80; // Height of the mobile bottom tab bar

  const layoutState: LayoutState = {
    sidebarWidth: isLargeScreen ? sidebarWidth : 0,
    isSidebarVisible: isLargeScreen,
    bottomBarHeight: isLargeScreen ? 0 : bottomBarHeight,
    headerRight,
    setHeaderRight,
  };

  return (
    <LayoutContext.Provider value={layoutState}>
      {children}
    </LayoutContext.Provider>
  );
};

// Custom hook to consume the context
export const useLayout = (): LayoutState => {
  const context = useContext(LayoutContext);
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

// ScreenContainer component to apply dynamic padding
interface ScreenContainerProps {
  children: ReactNode;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({ children }) => {
  const { sidebarWidth, bottomBarHeight } = useLayout();

  const containerStyle = {
    flex: 1,
    paddingLeft: sidebarWidth,
    paddingBottom: bottomBarHeight,
  };

  return <View style={containerStyle}>{children}</View>;
};
