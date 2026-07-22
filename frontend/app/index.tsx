import { View } from "react-native";
import { Link } from "expo-router";
import { Recycle, MapPin, Truck, ShieldCheck } from "lucide-react-native";
import { Screen, Text, Button, Surface } from "@/components/ui";

const FEATURES = [
  { icon: Truck, title: "Doorstep pickups", body: "Raise a request and the nearest verified recycler collects your e-waste." },
  { icon: MapPin, title: "Find drop-off stores", body: "Locate recycling stores near you and schedule a drop-off slot." },
  { icon: ShieldCheck, title: "Verified & secure", body: "OTP-verified handovers and rated recyclers you can trust." },
];

export default function LandingScreen() {
  return (
    <Screen contentClassName="py-8">
      {/* Brand */}
      <View className="mb-8 flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-primary">
          <Recycle size={24} color="#fff" strokeWidth={2.2} />
        </View>
        <Text className="text-[19px] font-extrabold tracking-tight">
          Connect2Recycle
        </Text>
      </View>

      {/* Hero */}
      <Text className="text-[34px] font-extrabold leading-[40px] tracking-tight">
        Recycle your e-waste, the easy way.
      </Text>
      <Text className="mt-3 text-[15px] leading-6 text-muted-foreground">
        Book a pickup or find a nearby drop-off store. Responsible recycling,
        verified end to end.
      </Text>

      <View className="mt-6 gap-3">
        <Link href="/register" asChild>
          <Button>Get started</Button>
        </Link>
        <Link href="/login" asChild>
          <Button variant="outline">I already have an account</Button>
        </Link>
      </View>

      {/* Features */}
      <View className="mt-10 gap-3">
        {FEATURES.map((f) => (
          <Surface key={f.title} className="flex-row items-start gap-3 p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <f.icon size={20} color="#1f6b38" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-bold">{f.title}</Text>
              <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                {f.body}
              </Text>
            </View>
          </Surface>
        ))}
      </View>
    </Screen>
  );
}
