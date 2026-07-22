import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Recycle,
  RotateCcw,
  Award,
  Scale,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldOff,
  Store as StoreIcon,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import {
  api,
  type AdminSettings,
  type AdminStats,
  type AdminStore,
  type AdminUser,
  type Dispute,
  type DisputeStatus,
  type DropOffRequest,
  type PickupRequest,
  type ThresholdAlert,
} from "@/lib/api";
import {
  Text,
  Button,
  Input,
  Select,
  Dialog,
  Card,
  Surface,
  Switch,
  LoadingState,
  ErrorState,
  EmptyState,
  type SelectOption,
} from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import {
  ADMIN_COLORS,
  Kpi,
  StatBar,
  VerifBadge,
  SuspendedPill,
} from "@/features/admin-helpers";

/* MySQL tinyint/bool coercion — matches the web page's `bool()` helper. */
const bool = (v: unknown) => v === true || v === 1;

type Tab = "overview" | "stores" | "users" | "requests" | "disputes" | "settings";

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "stores", label: "Stores", icon: StoreIcon },
  { key: "users", label: "Users", icon: Users },
  { key: "requests", label: "Requests", icon: Truck },
  { key: "disputes", label: "Disputes", icon: Scale },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

export default function AdminDashboardScreen() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4">
        <View className="flex-1 pr-3">
          <Text className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
            Control center
          </Text>
          <Text className="text-[24px] font-extrabold tracking-tight">
            Admin
          </Text>
        </View>
        <Button
          size="sm"
          variant="outline"
          onPress={() => signOut()}
          className="flex-row gap-1.5"
        >
          <LogOut size={16} color="#14181a" />
          <Text className="text-[13px] font-semibold">Sign out</Text>
        </Button>
      </View>

      {/* Segmented tab bar */}
      <View className="mt-3 mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                className={
                  "flex-row items-center gap-1.5 rounded-full px-4 py-2 " +
                  (active ? "bg-primary" : "bg-muted")
                }
              >
                <Icon
                  size={15}
                  color={active ? "#ffffff" : ADMIN_COLORS.muted}
                />
                <Text
                  className={
                    "text-[13px] font-semibold " +
                    (active ? "text-primary-foreground" : "text-muted-foreground")
                  }
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Active section */}
      <View className="flex-1">
        {tab === "overview" && <OverviewSection onNavigate={setTab} />}
        {tab === "stores" && <StoresSection />}
        {tab === "users" && <UsersSection />}
        {tab === "requests" && <RequestsSection />}
        {tab === "disputes" && <DisputesSection />}
        {tab === "settings" && <SettingsSection />}
      </View>
    </SafeAreaView>
  );
}

/* ----------------------------- Overview ----------------------------- */
function OverviewSection({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get<{ stats: AdminStats }>("/admin/overview")
      .then(({ data }) => setStats(data.stats))
      .catch(() => setError("Could not load platform metrics."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading metrics…" />;
  if (error) return <ErrorState description={error} onRetry={load} />;
  if (!stats) return <EmptyState title="No data" />;

  // Action queue — what the admin needs to clear, surfaced first.
  const queue = [
    {
      label: "Stores awaiting verification",
      value: stats.storesPending,
      icon: ShieldCheck,
      color: ADMIN_COLORS.amber,
      go: "stores" as Tab,
    },
    {
      label: "Open disputes",
      value: stats.openDisputes,
      icon: Scale,
      color: ADMIN_COLORS.red,
      go: "disputes" as Tab,
    },
    {
      label: "Stores near daily threshold",
      value: stats.storesNearThreshold,
      icon: AlertTriangle,
      color: ADMIN_COLORS.amber,
      go: "stores" as Tab,
    },
  ];
  const needsAttention = queue.reduce((n, q) => n + (q.value > 0 ? 1 : 0), 0);

  const rate = Math.max(0, Math.min(100, stats.completionRate));
  const total = stats.totalStores || 1;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 20 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Needs attention */}
      <View className="gap-3">
        <View className="flex-row items-center gap-2">
          <Text className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
            Needs attention
          </Text>
          {needsAttention === 0 ? (
            <View className="flex-row items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5">
              <CheckCircle size={13} color={ADMIN_COLORS.green} />
              <Text className="text-[11px] font-semibold text-primary">
                All clear
              </Text>
            </View>
          ) : null}
        </View>
        {queue.map((q) => {
          const Icon = q.icon;
          const live = q.value > 0;
          return (
            <Pressable
              key={q.label}
              onPress={() => onNavigate(q.go)}
              className="flex-row items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-clay active:opacity-80"
              style={
                live
                  ? { borderLeftWidth: 4, borderLeftColor: q.color }
                  : undefined
              }
            >
              <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: live ? `${q.color}1f` : "#e9edea",
                }}
              >
                <Icon size={20} color={live ? q.color : ADMIN_COLORS.muted} />
              </View>
              <View className="flex-1">
                <Text className="text-[24px] font-extrabold leading-none text-foreground">
                  {q.value}
                </Text>
                <Text className="mt-1 text-[12.5px] text-muted-foreground">
                  {q.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* KPI band */}
      <View className="gap-3">
        <View className="flex-row gap-3">
          <Kpi
            icon={Users}
            label="Total users"
            value={stats.totalUsers}
            caption={`${stats.totalRecyclers} recyclers`}
            ratio={stats.totalUsers ? stats.totalRecyclers / stats.totalUsers : 0}
          />
          <Kpi
            icon={Recycle}
            label="Recyclers"
            value={stats.totalRecyclers}
            caption="Supply side"
          />
        </View>
        <View className="flex-row gap-3">
          <Kpi
            icon={StoreIcon}
            label="Total stores"
            value={stats.totalStores}
            caption={`${stats.storesVerified} verified`}
            ratio={
              stats.totalStores ? stats.storesVerified / stats.totalStores : 0
            }
          />
          <Kpi
            icon={PackageCheck}
            label="Completed"
            value={stats.totalCompleted}
            caption={`of ${stats.totalRequests} requests`}
            ratio={
              stats.totalRequests
                ? stats.totalCompleted / stats.totalRequests
                : 0
            }
          />
        </View>
      </View>

      {/* Store composition (replaces donut chart) */}
      <Card className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] font-bold text-foreground">
            Store composition
          </Text>
          <StoreIcon size={16} color={ADMIN_COLORS.muted} />
        </View>
        <Text className="-mt-2 text-[12.5px] text-muted-foreground">
          {stats.totalStores} stores · verification & suspension breakdown
        </Text>
        <View className="gap-3">
          <StatBar
            label="Verified"
            value={stats.storesVerified}
            pct={(stats.storesVerified / total) * 100}
            color={ADMIN_COLORS.green}
          />
          <StatBar
            label="Pending"
            value={stats.storesPending}
            pct={(stats.storesPending / total) * 100}
            color={ADMIN_COLORS.amber}
          />
          <StatBar
            label="Suspended"
            value={stats.storesSuspended}
            pct={(stats.storesSuspended / total) * 100}
            color={ADMIN_COLORS.red}
          />
        </View>
      </Card>

      {/* Request throughput (replaces bar chart + completion ring) */}
      <Card className="gap-4 p-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[15px] font-bold text-foreground">
            Request throughput
          </Text>
          <TrendingUp size={16} color={ADMIN_COLORS.muted} />
        </View>
        <View className="flex-row items-center justify-between rounded-2xl bg-secondary/60 p-3">
          <View>
            <Text className="text-[13px] font-semibold text-foreground">
              Overall completion rate
            </Text>
            <Text className="text-[12.5px] text-muted-foreground">
              {stats.totalCompleted} of {stats.totalRequests} requests fulfilled
            </Text>
          </View>
          <Text className="text-[26px] font-extrabold text-primary">
            {rate}%
          </Text>
        </View>
        <View className="gap-3">
          <StatBar
            label="Pickups"
            value={stats.pickupsCompleted}
            suffix={` / ${stats.pickupsTotal}`}
            pct={
              stats.pickupsTotal
                ? (stats.pickupsCompleted / stats.pickupsTotal) * 100
                : 0
            }
            color={ADMIN_COLORS.green}
          />
          <StatBar
            label="Drop-offs"
            value={stats.dropoffsCompleted}
            suffix={` / ${stats.dropoffsTotal}`}
            pct={
              stats.dropoffsTotal
                ? (stats.dropoffsCompleted / stats.dropoffsTotal) * 100
                : 0
            }
            color={ADMIN_COLORS.blue}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

/* ----------------------------- Stores ----------------------------- */
const STORE_FILTERS: SelectOption[] = [
  { value: "all", label: "All stores" },
  { value: "Pending", label: "Pending verification" },
  { value: "Verified", label: "Verified" },
  { value: "Inactive", label: "Suspended (inactive)" },
];

function StoresSection() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "Pending" | "Verified" | "Inactive">(
    "all"
  );
  const [error, setError] = useState("");

  // Threshold controls.
  const [alerts, setAlerts] = useState<ThresholdAlert[]>([]);
  const [bulkThreshold, setBulkThreshold] = useState("");
  const [thresholdTarget, setThresholdTarget] = useState<AdminStore | null>(null);
  const [thresholdValue, setThresholdValue] = useState("");

  const loadAlerts = useCallback(() => {
    api
      .get<ThresholdAlert[]>("/admin/stores/threshold-alerts")
      .then(({ data }) => setAlerts(data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (filter === "Pending" || filter === "Verified")
        params.set("verificationStatus", filter);
      if (filter === "Inactive") params.set("status", "Inactive");
      const { data } = await api.get<AdminStore[]>(
        `/admin/stores?${params.toString()}`
      );
      setStores(data);
    } catch {
      setError("Could not load stores.");
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  // Debounce search; refetch on filter change.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(load, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [load]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
      await loadAlerts();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  // Bulk: apply one threshold to every store (empty input = no limit).
  const applyBulkThreshold = async () => {
    setError("");
    try {
      const thresholdKg = bulkThreshold.trim() === "" ? null : Number(bulkThreshold);
      await api.patch("/admin/stores/threshold", { thresholdKg });
      setBulkThreshold("");
      await load();
      await loadAlerts();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not apply threshold.");
    }
  };

  const openThreshold = (s: AdminStore) => {
    setThresholdTarget(s);
    setThresholdValue(s.dailyThresholdKg != null ? String(s.dailyThresholdKg) : "");
  };

  const saveThreshold = async () => {
    if (!thresholdTarget) return;
    const id = thresholdTarget.id;
    const raw = thresholdValue;
    const thresholdKg = raw.trim() === "" ? null : Number(raw);
    setThresholdTarget(null);
    await act(id, () => api.patch(`/admin/stores/${id}/threshold`, { thresholdKg }));
  };

  const renderStore = ({ item: s }: { item: AdminStore }) => {
    const usagePct = s.thresholdUsagePct ?? 0;
    return (
      <Card className="mb-2 gap-3 p-4">
        <View className="gap-3">
          <View className="min-w-0">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-[14px] font-semibold text-foreground">
                {s.storeName}
              </Text>
              <VerifBadge status={s.verificationStatus} />
              {s.status === "Inactive" ? <SuspendedPill /> : null}
            </View>
            <Text
              className="mt-0.5 text-[12px] text-muted-foreground"
              numberOfLines={1}
            >
              {s.recyclerName} · {s.address}
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {s.verificationStatus !== "Verified" ? (
              <Button
                size="sm"
                disabled={busyId === s.id}
                onPress={() =>
                  act(s.id, () =>
                    api.patch(`/admin/stores/${s.id}/verification`, {
                      verificationStatus: "Verified",
                    })
                  )
                }
                className="flex-row gap-1.5"
              >
                <ShieldCheck size={14} color="#ffffff" />
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  Verify
                </Text>
              </Button>
            ) : null}
            {s.verificationStatus !== "Rejected" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === s.id}
                onPress={() =>
                  act(s.id, () =>
                    api.patch(`/admin/stores/${s.id}/verification`, {
                      verificationStatus: "Rejected",
                    })
                  )
                }
                className="flex-row gap-1.5"
              >
                <ShieldOff size={14} color="#14181a" />
                <Text className="text-[13px] font-semibold">Reject</Text>
              </Button>
            ) : null}
            {s.status === "Active" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === s.id}
                onPress={() =>
                  act(s.id, () =>
                    api.patch(`/admin/stores/${s.id}/status`, {
                      status: "Inactive",
                    })
                  )
                }
                className="flex-row gap-1.5"
              >
                <Ban size={14} color={ADMIN_COLORS.red} />
                <Text className="text-[13px] font-semibold text-destructive">
                  Suspend
                </Text>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === s.id}
                onPress={() =>
                  act(s.id, () =>
                    api.patch(`/admin/stores/${s.id}/status`, {
                      status: "Active",
                    })
                  )
                }
                className="flex-row gap-1.5"
              >
                <RotateCcw size={14} color="#14181a" />
                <Text className="text-[13px] font-semibold">Reinstate</Text>
              </Button>
            )}
          </View>
        </View>

        {/* Daily threshold + today's load */}
        <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <Text className="text-[12px] text-muted-foreground">
            Today:{" "}
            <Text className="font-semibold text-foreground">
              {s.todayLoadKg ?? 0} kg
            </Text>
            {s.dailyThresholdKg != null ? (
              <Text className="text-muted-foreground">
                {" "}
                / {s.dailyThresholdKg} kg
                {s.thresholdUsagePct != null ? (
                  <Text
                    className={usagePct >= 80 ? "text-chart-3" : "text-muted-foreground"}
                  >
                    {" "}
                    ({s.thresholdUsagePct}%)
                  </Text>
                ) : null}
              </Text>
            ) : (
              <Text className="text-muted-foreground"> · no limit</Text>
            )}
            {s.eligible === false ? (
              <Text className="font-semibold text-destructive"> · full</Text>
            ) : null}
          </Text>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === s.id}
            onPress={() => openThreshold(s)}
          >
            Set threshold
          </Button>
        </View>
      </Card>
    );
  };

  return (
    <View className="flex-1">
      {/* Fixed controls */}
      <View className="gap-3 px-5 pb-2">
        {/* Threshold alerts */}
        {alerts.length > 0 ? (
          <Surface className="border-chart-3/30 bg-chart-3/10 p-3">
            <Text className="text-[13px] font-semibold text-chart-3">
              {alerts.length} store{alerts.length === 1 ? "" : "s"} near their
              daily threshold
            </Text>
            <View className="mt-1 gap-0.5">
              {alerts.map((a) => (
                <Text key={a.storeId} className="text-[12px] text-chart-3">
                  {a.storeName} — {a.todayLoadKg}/{a.thresholdKg} kg ({a.usagePct}
                  %){a.breached ? " · limit reached" : ""}
                </Text>
              ))}
            </View>
          </Surface>
        ) : null}

        {/* Bulk threshold action */}
        <View className="flex-row items-center gap-2 rounded-2xl border border-border p-3">
          <Input
            keyboardType="numeric"
            placeholder="kg (blank = no limit)"
            value={bulkThreshold}
            onChangeText={setBulkThreshold}
            className="h-10 flex-1"
          />
          <Button size="sm" onPress={applyBulkThreshold}>
            Apply to all
          </Button>
        </View>

        <Input
          placeholder="Search store / recycler / city"
          value={search}
          onChangeText={setSearch}
        />
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as typeof filter)}
          options={STORE_FILTERS}
          placeholder="All stores"
        />
        {error ? (
          <Text className="text-[12px] text-destructive">{error}</Text>
        ) : null}
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(s) => String(s.id)}
          renderItem={renderStore}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          ListEmptyComponent={<EmptyState title="No stores found." />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Threshold Dialog */}
      <Dialog
        open={thresholdTarget != null}
        onClose={() => setThresholdTarget(null)}
        title="Set daily threshold"
        description={
          thresholdTarget
            ? `${thresholdTarget.storeName} · leave blank for no limit`
            : undefined
        }
      >
        <View className="gap-3">
          <Input
            keyboardType="numeric"
            placeholder="Threshold (kg)"
            value={thresholdValue}
            onChangeText={setThresholdValue}
            autoFocus
          />
          <View className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setThresholdTarget(null)}
            >
              Cancel
            </Button>
            <Button size="sm" onPress={saveThreshold}>
              Save
            </Button>
          </View>
        </View>
      </Dialog>
    </View>
  );
}

/* ----------------------------- Users ----------------------------- */
function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<AdminUser[]>(
        "/admin/users?role=recycler&limit=100"
      );
      setUsers(data);
    } catch {
      setError("Could not load recyclers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSuspend = async (u: AdminUser) => {
    setBusyId(u.id);
    setError("");
    try {
      await api.patch(`/admin/users/${u.id}/suspend`, {
        suspended: !bool(u.is_suspended),
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const renderUser = ({ item: u }: { item: AdminUser }) => {
    const suspended = bool(u.is_suspended);
    return (
      <Card className="mb-2 flex-row items-center justify-between gap-3 p-4">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[14px] font-semibold text-foreground">
              {u.name}
            </Text>
            {suspended ? <SuspendedPill /> : null}
          </View>
          <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
            {u.email}
          </Text>
        </View>
        <Button
          size="sm"
          variant="outline"
          loading={busyId === u.id}
          disabled={busyId === u.id}
          onPress={() => toggleSuspend(u)}
          className="flex-row gap-1.5"
        >
          {suspended ? (
            <RotateCcw size={14} color="#14181a" />
          ) : (
            <Ban size={14} color={ADMIN_COLORS.red} />
          )}
          <Text
            className={
              "text-[13px] font-semibold " +
              (suspended ? "text-foreground" : "text-destructive")
            }
          >
            {suspended ? "Reinstate" : "Suspend"}
          </Text>
        </Button>
      </Card>
    );
  };

  if (loading) return <LoadingState />;

  return (
    <View className="flex-1 px-5">
      {error ? (
        <Text className="mb-2 text-[12px] text-destructive">{error}</Text>
      ) : null}
      <FlatList
        data={users}
        keyExtractor={(u) => String(u.id)}
        renderItem={renderUser}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState title="No recyclers." />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

/* ----------------------------- Requests ----------------------------- */
function RequestsSection() {
  const [kind, setKind] = useState<"pickup" | "dropoff">("pickup");
  const [pickups, setPickups] = useState<PickupRequest[]>([]);
  const [dropoffs, setDropoffs] = useState<DropOffRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url =
      kind === "pickup"
        ? "/admin/pickup-requests?limit=100"
        : "/admin/dropoff-requests?limit=100";
    api
      .get(url)
      .then(({ data }) =>
        kind === "pickup" ? setPickups(data) : setDropoffs(data)
      )
      .finally(() => setLoading(false));
  }, [kind]);

  const renderPickup = ({ item: p }: { item: PickupRequest }) => (
    <Card className="mb-2 flex-row items-center justify-between gap-3 p-3">
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-foreground">
          #{p.id} · {p.wasteCategory} · {p.wasteQuantity} kg
        </Text>
        <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
          {p.userName ?? `User #${p.userId}`}
          {p.recyclerName ? ` → ${p.recyclerName}` : ""} · {p.pickupAddress}
        </Text>
      </View>
      <StatusBadge status={p.status} />
    </Card>
  );

  const renderDropoff = ({ item: dr }: { item: DropOffRequest }) => (
    <Card className="mb-2 flex-row items-center justify-between gap-3 p-3">
      <View className="flex-1">
        <Text className="text-[14px] font-semibold text-foreground">
          #{dr.id} · {dr.wasteCategory} · {dr.wasteQuantity} kg
        </Text>
        <Text className="text-[12px] text-muted-foreground" numberOfLines={1}>
          {dr.userName ?? `User #${dr.userId}`} · {dr.storeName} ·{" "}
          {String(dr.scheduledDate).slice(0, 10)} {dr.timeSlot}
        </Text>
      </View>
      <StatusBadge status={dr.status} />
    </Card>
  );

  return (
    <View className="flex-1 px-5">
      <View className="mb-3 flex-row gap-2">
        <Button
          size="sm"
          variant={kind === "pickup" ? "default" : "outline"}
          onPress={() => setKind("pickup")}
        >
          Pickup requests
        </Button>
        <Button
          size="sm"
          variant={kind === "dropoff" ? "default" : "outline"}
          onPress={() => setKind("dropoff")}
        >
          Drop-off requests
        </Button>
      </View>

      {loading ? (
        <LoadingState />
      ) : kind === "pickup" ? (
        <FlatList
          data={pickups}
          keyExtractor={(p) => String(p.id)}
          renderItem={renderPickup}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<EmptyState title="No pickup requests." />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={dropoffs}
          keyExtractor={(dr) => String(dr.id)}
          renderItem={renderDropoff}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<EmptyState title="No drop-off requests." />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

/* ----------------------------- Disputes ----------------------------- */
function DisputesSection() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"OPEN" | "all">("OPEN");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Resolve dialog state.
  const [target, setTarget] = useState<Dispute | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filter === "OPEN" ? "?status=OPEN" : "";
      const { data } = await api.get<Dispute[]>(`/admin/disputes${qs}`);
      setDisputes(data);
    } catch {
      setError("Could not load disputes.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const openResolve = (d: Dispute) => {
    setTarget(d);
    setNote("");
  };

  const resolve = async (status: DisputeStatus) => {
    if (!target) return;
    const id = target.id;
    const resolutionNote = note;
    setTarget(null);
    setBusyId(id);
    setError("");
    try {
      await api.patch(`/admin/disputes/${id}/resolve`, {
        status,
        resolutionNote: resolutionNote || "",
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const renderDispute = ({ item: d }: { item: Dispute }) => (
    <Card className="mb-2 gap-3 p-4">
      <View>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-[14px] font-semibold text-foreground">
            {d.requestType} #{d.requestId}
          </Text>
          <StatusBadge status={d.status} />
          <Text className="text-[12px] text-muted-foreground">
            by {d.raiserName} ({d.raisedByRole})
          </Text>
        </View>
        <Text className="mt-1 text-[13px] text-muted-foreground">{d.reason}</Text>
        {d.status !== "OPEN" && d.resolutionNote ? (
          <Text className="mt-1 text-[12px] text-muted-foreground">
            Resolution: {d.resolutionNote}
            {d.resolverName ? ` — ${d.resolverName}` : ""}
          </Text>
        ) : null}
      </View>
      {d.status === "OPEN" ? (
        <Button
          size="sm"
          disabled={busyId === d.id}
          loading={busyId === d.id}
          onPress={() => openResolve(d)}
        >
          Resolve
        </Button>
      ) : null}
    </Card>
  );

  return (
    <View className="flex-1 px-5">
      <View className="mb-3 flex-row gap-2">
        {(["OPEN", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onPress={() => setFilter(f)}
          >
            {f === "OPEN" ? "Open" : "All"}
          </Button>
        ))}
      </View>
      {error ? (
        <Text className="mb-2 text-[12px] text-destructive">{error}</Text>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={(d) => String(d.id)}
          renderItem={renderDispute}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<EmptyState title="No disputes." />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Resolve Dialog */}
      <Dialog
        open={target != null}
        onClose={() => setTarget(null)}
        title="Resolve dispute"
        description={
          target ? `${target.requestType} #${target.requestId}` : undefined
        }
      >
        <View className="gap-3">
          <Input
            placeholder="Resolution note (optional)"
            value={note}
            onChangeText={setNote}
          />
          <View className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => resolve("REJECTED")}
              className="flex-row gap-1.5"
            >
              <Text className="text-[13px] font-semibold text-destructive">
                Reject
              </Text>
            </Button>
            <Button
              size="sm"
              onPress={() => resolve("RESOLVED")}
              className="flex-row gap-1.5"
            >
              <CheckCircle size={14} color="#ffffff" />
              <Text className="text-[13px] font-semibold text-primary-foreground">
                Resolve
              </Text>
            </Button>
          </View>
        </View>
      </Dialog>
    </View>
  );
}

/* ----------------------------- Settings ----------------------------- */

function SettingsSection() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get<AdminSettings>("/admin/settings")
      .then(({ data }) => setSettings(data))
      .catch(() => setError("Could not load settings."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Optimistic toggle: flip the UI immediately, revert on failure.
  const toggleRewards = useCallback(
    async (next: boolean) => {
      if (!settings) return;
      setSaving(true);
      setError("");
      setSettings({ ...settings, rewardsEnabled: next });
      try {
        await api.patch("/admin/settings/rewards", { enabled: next });
      } catch (e: any) {
        setSettings({ ...settings, rewardsEnabled: !next }); // revert
        setError(e?.response?.data?.message || "Could not update the setting.");
      } finally {
        setSaving(false);
      }
    },
    [settings]
  );

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error && !settings) return <ErrorState description={error} onRetry={load} />;
  if (!settings) return <EmptyState title="No settings" />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
      <Card>
        <View className="gap-4 p-5">
          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1 flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
                <Award size={20} color={ADMIN_COLORS.green} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] font-bold">Reward points</Text>
                <Text className="mt-0.5 text-[12.5px] text-muted-foreground">
                  When on, users earn blockchain-backed reward points for every
                  completed pickup and drop-off, and can see their balance and
                  on-chain history. When off, the feature is hidden and no points
                  are awarded.
                </Text>
              </View>
            </View>
            <Switch
              value={settings.rewardsEnabled}
              onValueChange={toggleRewards}
              disabled={saving}
            />
          </View>

          <View className="flex-row items-center gap-2 border-t border-border pt-3">
            <View
              className={
                settings.rewardsEnabled
                  ? "h-2 w-2 rounded-full bg-primary"
                  : "h-2 w-2 rounded-full bg-muted-foreground/40"
              }
            />
            <Text className="text-[12.5px] font-medium text-muted-foreground">
              {settings.rewardsEnabled ? "Enabled" : "Disabled"}
            </Text>
          </View>

          {!settings.rewardsConfigured ? (
            <View className="flex-row items-start gap-2 rounded-xl bg-chart-3/10 px-3.5 py-3">
              <AlertTriangle size={15} color={ADMIN_COLORS.amber} />
              <Text className="flex-1 text-[12px] text-chart-3">
                The rewards ledger isn't configured on the server
                (REWARDS_LEDGER_URL / REWARDS_LEDGER_API_KEY). You can still flip
                this switch, but no points will be awarded until it's set.
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text className="text-[12.5px] font-medium text-destructive">
              {error}
            </Text>
          ) : null}
        </View>
      </Card>
    </ScrollView>
  );
}
