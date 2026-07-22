import { Tabs } from "expo-router";
import { LayoutGrid, MapPin, Recycle, PackageCheck, User } from "lucide-react-native";

const ACTIVE = "#34c759";
const INACTIVE = "#6c7278";

/** User bottom tabs (derived from USER_NAV in the web app's navConfig). */
export default function UserTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e4e8e4",
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: "#eef1ee" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarIcon: ({ color, size }) => <MapPin color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pickups"
        options={{
          title: "Pickups",
          tabBarIcon: ({ color, size }) => <Recycle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dropoff"
        options={{
          title: "Drop-off",
          tabBarIcon: ({ color, size }) => <PackageCheck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
