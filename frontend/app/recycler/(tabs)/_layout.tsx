import { Tabs } from "expo-router";
import { LayoutGrid, Inbox, PackageCheck, Store, User } from "lucide-react-native";

const ACTIVE = "#34c759";
const INACTIVE = "#6c7278";

/** Recycler bottom tabs (derived from recyclerNav in the web navConfig). */
export default function RecyclerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: { backgroundColor: "#ffffff", borderTopColor: "#e4e8e4" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: "#eef1ee" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pickups"
        options={{
          title: "Pickups",
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dropoffs"
        options={{
          title: "Drop-offs",
          tabBarIcon: ({ color, size }) => <PackageCheck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stores"
        options={{
          title: "Stores",
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
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
