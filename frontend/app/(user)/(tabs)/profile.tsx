import { ProfileScreen } from "@/features/ProfileScreen";

// Same profile screen serves both roles; branches on the loaded profile.role
// (addresses tab is user-only).
export default function UserProfileScreen() {
  return <ProfileScreen />;
}
