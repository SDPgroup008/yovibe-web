import { NavigationContainer } from "@react-navigation/native"
import { createStackNavigator } from "@react-navigation/stack"
import { AuthProvider } from "./contexts/AuthContext"
import { AuthNavigator, MainTabNavigator } from "./navigation/AppNavigator.web" // Use web-specific navigator

// Create the stack navigator
const Stack = createStackNavigator()

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthNavigator} />
          <Stack.Screen name="Main" component={MainTabNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  )
}
