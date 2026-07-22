import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeCheck,
  CalendarClock,
  Clock,
  Mail,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  PowerOff,
  Recycle,
  SearchX,
  ShieldAlert,
  Star,
  Truck,
} from "lucide-react-native";
import { api, type StoreDetails } from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Progress,
  Skeleton,
  EmptyState,
} from "@/components/ui";
import { StoreReviews } from "@/components/store/StoreReviews";
import { useLocation } from "@/hooks/useLocation";

type FetchState = "loading" | "ready" | "not_found" | "error";

/* ---------------- sections ---------------- */

function StoreHeader({ store }: { store: StoreDetails }) {
  const verified = store.verificationStatus === "Verified";
  const active = store.status === "Active";
  return (
    <Card className="p-5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="font-display text-[23px] tracking-tight">
          {store.storeName}
        </Text>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <Badge variant={verified ? "success" : "warning"}>
          <View className="flex-row items-center gap-1">
            {verified ? (
              <BadgeCheck size={12} color="#1f7a3d" />
            ) : (
              <ShieldAlert size={12} color="#9a5b00" />
            )}
            <Text
              className={
                "text-[11px] font-semibold " +
                (verified ? "text-primary" : "text-chart-3")
              }
            >
              {store.verificationStatus}
            </Text>
          </View>
        </Badge>
        <Badge variant={active ? "success" : "destructive"}>{store.status}</Badge>
      </View>
      <View className="mt-3 gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <MapPin size={14} color="#6c7278" />
          <Text className="text-[13px] text-muted-foreground">
            {[store.city, store.state].filter(Boolean).join(", ") || store.address}
          </Text>
        </View>
        <View className="flex-row items-center gap-4">
          {store.distanceKm != null ? (
            <View className="flex-row items-center gap-1.5">
              <Navigation size={14} color="#6c7278" />
              <Text className="text-[13px] text-muted-foreground">
                {store.distanceKm} km away
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            <Star size={14} color="#ffb800" fill="#ffb800" />
            <Text className="text-[13px] font-medium">
              {store.rating.toFixed(1)}
            </Text>
            <Text className="text-[13px] text-muted-foreground">
              ({store.totalReviews})
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function StoreInfoSection({ store }: { store: StoreDetails }) {
  const fullAddress = [store.address, store.city, store.state, store.pincode]
    .filter(Boolean)
    .join(", ");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">About</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        {store.description ? (
          <Text className="text-[13px] leading-5 text-muted-foreground">
            {store.description}
          </Text>
        ) : (
          <Text className="text-[13px] italic text-muted-foreground">
            No description provided.
          </Text>
        )}
        <View className="flex-row items-start gap-2">
          <MapPin size={16} color="#6c7278" />
          <View className="flex-1">
            <Text className="text-[13px] font-medium">Address</Text>
            <Text className="text-[13px] text-muted-foreground">{fullAddress}</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

function WasteTypesSection({ store }: { store: StoreDetails }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Operations</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="flex-row gap-4">
          <View className="flex-1 flex-row items-center gap-2">
            <Clock size={16} color="#6c7278" />
            <View>
              <Text className="text-[12px] text-muted-foreground">Hours</Text>
              <Text className="text-[13px] font-medium">
                {store.operatingHours || "Not specified"}
              </Text>
            </View>
          </View>
          <View className="flex-1 flex-row items-center gap-2">
            <Truck size={16} color="#6c7278" />
            <View>
              <Text className="text-[12px] text-muted-foreground">Pickup</Text>
              <Text
                className={
                  "text-[13px] font-medium " +
                  (store.pickupAvailability ? "text-primary" : "text-muted-foreground")
                }
              >
                {store.pickupAvailability ? "Available" : "Unavailable"}
              </Text>
            </View>
          </View>
        </View>
        <View>
          <View className="mb-2 flex-row items-center gap-1.5">
            <Recycle size={14} color="#6c7278" />
            <Text className="text-[12px] text-muted-foreground">
              Accepted waste types
            </Text>
          </View>
          {store.acceptedWasteTypes.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {store.acceptedWasteTypes.map((type) => (
                <View
                  key={type}
                  className="rounded-md border border-primary/10 bg-primary/5 px-2 py-0.5"
                >
                  <Text className="text-[12px] font-medium text-primary">
                    {type}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-[13px] italic text-muted-foreground">
              None listed.
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

function CapacitySection({ store }: { store: StoreDetails }) {
  const daily = store.dailyCapacityKg;
  const current = store.currentCapacityKg;
  const usedPct =
    daily > 0 ? Math.min(100, Math.round((current / daily) * 100)) : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Today's Capacity</CardTitle>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="flex-row">
          {[
            { v: daily, l: "Daily (kg)", c: "text-foreground" },
            { v: current, l: "Used (kg)", c: "text-foreground" },
            { v: store.remainingCapacityKg, l: "Remaining", c: "text-primary" },
          ].map((x) => (
            <View key={x.l} className="flex-1 items-center">
              <Text className={"text-[18px] font-semibold " + x.c}>{x.v}</Text>
              <Text className="text-[12px] text-muted-foreground">{x.l}</Text>
            </View>
          ))}
        </View>
        <View className="gap-1.5">
          <Progress value={usedPct} />
          <Text className="text-right text-[12px] text-muted-foreground">
            {usedPct}% used
          </Text>
        </View>
      </CardContent>
    </Card>
  );
}

function ContactSection({ store }: { store: StoreDetails }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Contact</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row items-center gap-2">
          <Phone size={16} color="#6c7278" />
          {store.contactNumber ? (
            <Text
              className="text-[13px] font-medium text-primary"
              onPress={() => Linking.openURL(`tel:${store.contactNumber}`)}
            >
              {store.contactNumber}
            </Text>
          ) : (
            <Text className="text-[13px] text-muted-foreground">Not provided</Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <Mail size={16} color="#6c7278" />
          {store.email ? (
            <Text
              className="text-[13px] font-medium text-primary"
              onPress={() => Linking.openURL(`mailto:${store.email}`)}
            >
              {store.email}
            </Text>
          ) : (
            <Text className="text-[13px] text-muted-foreground">Not provided</Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

/* ---------------- screen ---------------- */

function StateNotice({
  icon: Icon,
  title,
  message,
}: {
  icon: typeof SearchX;
  title: string;
  message: string;
}) {
  return <EmptyState icon={Icon} title={title} description={message} />;
}

export default function StoreDetailScreen() {
  const router = useRouter();
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const { request: requestLocation } = useLocation();

  const [state, setState] = useState<FetchState>("loading");
  const [store, setStore] = useState<StoreDetails | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;

    const load = async (coords: { lat: number; lng: number } | null) => {
      try {
        const qs = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : "";
        const { data } = await api.get<StoreDetails>(`/stores/${storeId}${qs}`);
        if (cancelled) return;
        setStore(data);
        setState("ready");
      } catch (err: any) {
        if (cancelled) return;
        setState(err?.response?.status === 404 ? "not_found" : "error");
      }
    };

    // Best-effort geolocation for distanceKm; denial just omits distance.
    requestLocation()
      .then((loc) => {
        if (!cancelled) load(loc);
      })
      .catch(() => {
        if (!cancelled) load(null);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, requestLocation]);

  if (state === "loading") {
    return (
      <Screen>
        <View className="gap-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </View>
      </Screen>
    );
  }

  if (state === "not_found") {
    return (
      <Screen>
        <StateNotice
          icon={SearchX}
          title="Store not found"
          message="We couldn't find this store. It may have been removed or the link is incorrect."
        />
      </Screen>
    );
  }

  if (state === "error" || !store) {
    return (
      <Screen>
        <StateNotice
          icon={SearchX}
          title="Something went wrong"
          message="We couldn't load this store right now. Please try again later."
        />
      </Screen>
    );
  }

  if (store.status === "Inactive") {
    return (
      <Screen>
        <StateNotice
          icon={PowerOff}
          title="Store inactive"
          message={`${store.storeName} is not currently accepting recycling requests.`}
        />
      </Screen>
    );
  }

  if (store.verificationStatus !== "Verified") {
    return (
      <Screen>
        <StateNotice
          icon={ShieldAlert}
          title="Store pending verification"
          message={`${store.storeName} hasn't been verified yet and isn't available for scheduling.`}
        />
      </Screen>
    );
  }

  return (
    <Screen contentClassName="gap-4 pb-8">
      <StoreHeader store={store} />
      <StoreInfoSection store={store} />
      <WasteTypesSection store={store} />
      <CapacitySection store={store} />
      <ContactSection store={store} />

      {/* Actions */}
      <Card className="border-primary/20 p-5">
        <View className="gap-3">
          <Button
            onPress={() => router.push("/pickup/new")}
            disabled={!store.pickupAvailability}
            className="flex-row gap-2"
          >
            <CalendarClock size={16} color="#fff" />
            <Text className="text-[15px] font-semibold text-primary-foreground">
              Schedule Pickup
            </Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => router.push(`/dropoff?storeId=${store.id}` as any)}
            className="flex-row gap-2"
          >
            <PackageCheck size={16} color="#14181a" />
            <Text className="text-[15px] font-semibold">Schedule Drop-off</Text>
          </Button>
        </View>
      </Card>

      <StoreReviews storeId={store.id} />
    </Screen>
  );
}
