import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  KeyRound,
  Leaf,
  LogOut,
  MapPin,
  Palette,
  Save,
  ShieldCheck,
  User,
} from "lucide-react-native";
import { api, type AuthProfile, type RewardsSummary } from "@/lib/api";
import {
  Screen,
  Text,
  Button,
  Input,
  Field,
  Surface,
  Switch,
  LoadingState,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { USER_TYPE_LABELS, isUserType } from "@/lib/userTypes";
import { SavedAddresses } from "@/features/SavedAddresses";
import { fetchImpact, ecoLevel, type Impact } from "@/lib/impact";
import { CountUp } from "@/components/motion/CountUp";

/* ---------------- avatar accent personalization ---------------- */
const ACCENTS = [
  { key: "moss", ring: "#34c759", fill: "rgba(52,199,89,.14)" },
  { key: "ocean", ring: "#0a84ff", fill: "rgba(10,132,255,.14)" },
  { key: "amber", ring: "#ff9f0a", fill: "rgba(255,159,10,.16)" },
  { key: "orchid", ring: "#bf5af2", fill: "rgba(191,90,242,.14)" },
  { key: "rose", ring: "#ff375f", fill: "rgba(255,55,95,.13)" },
] as const;
type Accent = (typeof ACCENTS)[number];

type TabKey = "account" | "security" | "addresses" | "notifications";

export function ProfileScreen() {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("account");
  const [accent, setAccent] = useState<Accent>(ACCENTS[0]);

  useEffect(() => {
    api
      .get<AuthProfile>("/auth/profile")
      .then(({ data }) => setProfile(data))
      .catch(() => signOut());
  }, [signOut]);

  const role = profile?.role ?? "user";
  const isCitizen = role === "user";

  const roleLabel =
    role === "recycler"
      ? "Recycler"
      : role === "admin"
        ? "Admin"
        : isUserType(profile?.user_type)
          ? USER_TYPE_LABELS[profile!.user_type as keyof typeof USER_TYPE_LABELS]
          : "Member";

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await signOut();
  };

  const TABS = useMemo(() => {
    const base: { key: TabKey; label: string; icon: typeof User }[] = [
      { key: "account", label: "Account", icon: User },
      { key: "security", label: "Security", icon: ShieldCheck },
    ];
    if (isCitizen) base.push({ key: "addresses", label: "Addresses", icon: MapPin });
    base.push({ key: "notifications", label: "Notifications", icon: Bell });
    return base;
  }, [isCitizen]);

  if (!profile) {
    return (
      <Screen>
        <LoadingState label="Loading your profile…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <IdentityHero profile={profile} roleLabel={roleLabel} accent={accent} />

      {isCitizen ? <ProfileImpact /> : null}

      {/* Segmented tab rail */}
      <View className="mb-4 mt-4 flex-row flex-wrap gap-1 rounded-2xl bg-muted p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className={
                "min-w-[46%] flex-1 flex-row items-center justify-center gap-2 rounded-2xl px-3 py-2.5 " +
                (active ? "bg-primary" : "")
              }
            >
              <Icon size={16} color={active ? "#fff" : "#6c7278"} />
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
      </View>

      {/* Panels */}
      {tab === "account" ? (
        <AccountPanel
          profile={profile}
          accent={accent}
          onAccent={setAccent}
          onSaved={setProfile}
        />
      ) : null}
      {tab === "security" ? <SecurityPanel /> : null}
      {tab === "addresses" && isCitizen ? <SavedAddresses /> : null}
      {tab === "notifications" ? <NotificationsPanel /> : null}

      {/* Sign-out strip */}
      <Surface className="mt-4 flex-row items-center justify-between gap-3 p-5">
        <View className="flex-1">
          <Text className="text-[14px] font-semibold">Sign out</Text>
          <Text className="text-[13px] text-muted-foreground">
            End your session on this device.
          </Text>
        </View>
        <Button
          variant="outline"
          onPress={handleLogout}
          className="flex-row gap-2"
        >
          <LogOut size={16} color="#ff3b30" />
          <Text className="text-[14px] font-semibold text-destructive">
            Log out
          </Text>
        </Button>
      </Surface>
    </Screen>
  );
}

/* ============================ Identity hero ============================ */
/* ---------------- impact strip (citizens) ---------------- */
function ProfileImpact() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    fetchImpact().then(setImpact).catch(() => {});
    api
      .get<RewardsSummary>("/rewards/me")
      .then(({ data }) => setPoints(data.enabled ? data.points ?? 0 : null))
      .catch(() => {});
  }, []);

  const kg = impact?.kg ?? 0;
  const level = ecoLevel(points ?? Math.round(kg * 10));
  const stats: { label: string; value: number; decimals?: number }[] = [
    { label: "kg recycled", value: kg, decimals: Number.isInteger(kg) ? 0 : 1 },
    { label: "recycles", value: impact?.completed ?? 0 },
    points != null
      ? { label: "points", value: points }
      : { label: "eco level", value: level.level },
  ];

  return (
    <Surface className="mt-4 gap-3.5 p-5">
      <View className="flex-row items-center gap-1.5">
        <Leaf size={12} color="#1f6b38" />
        <Text className="text-[10.5px] font-bold tracking-[1.5px] text-accent-foreground">
          YOUR IMPACT
        </Text>
      </View>
      <View className="flex-row">
        {stats.map((s, i) => (
          <View
            key={s.label}
            className={"flex-1 " + (i > 0 ? "border-l border-border pl-4" : "")}
          >
            <CountUp
              value={s.value}
              decimals={s.decimals ?? 0}
              style={{ fontSize: 24, color: "#14181a" }}
            />
            <Text className="mt-0.5 text-[11.5px] text-muted-foreground">
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </Surface>
  );
}

function IdentityHero({
  profile,
  roleLabel,
  accent,
}: {
  profile: AuthProfile;
  roleLabel: string;
  accent: Accent;
}) {
  const initials =
    (profile.name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "C2";

  return (
    <Surface className="gap-5 p-6">
      <View className="flex-row items-center gap-4">
        <View
          className="h-20 w-20 items-center justify-center rounded-3xl"
          style={{
            backgroundColor: accent.fill,
            borderWidth: 2,
            borderColor: accent.ring,
          }}
        >
          <Text
            className="font-display-black text-[26px] tracking-tight"
            style={{ color: accent.ring }}
          >
            {initials}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-display text-[23px] tracking-tight">
              {profile.name || "Your profile"}
            </Text>
          </View>
          <Text
            className="mt-1 text-[14px] text-muted-foreground"
            numberOfLines={1}
          >
            {profile.email || "—"}
          </Text>
          <View className="mt-3 self-start rounded-full bg-secondary px-3 py-1">
            <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {roleLabel}
            </Text>
          </View>
        </View>
      </View>
    </Surface>
  );
}

/* ============================ Account panel ============================ */
function AccountPanel({
  profile,
  accent,
  onAccent,
  onSaved,
}: {
  profile: AuthProfile;
  accent: Accent;
  onAccent: (a: Accent) => void;
  onSaved: (p: AuthProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = name !== profile.name || email !== profile.email;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { data } = await api.put<AuthProfile>("/auth/profile", { name, email });
      onSaved(data);
      setMsg({ ok: true, text: "Profile updated." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.message || "Update failed." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-4">
      <Surface className="gap-4 p-5">
        <View>
          <Text className="text-[16px] font-bold tracking-tight">
            Personal details
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            This is how recyclers and stores see you.
          </Text>
        </View>
        <Field label="Full name">
          <Input value={name} onChangeText={setName} placeholder="Your name" />
        </Field>
        <Field label="Email">
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>
        {msg ? <Banner ok={msg.ok}>{msg.text}</Banner> : null}
        <Button
          onPress={save}
          loading={saving}
          disabled={saving || !dirty}
          className="flex-row gap-2 self-end"
        >
          <Save size={16} color="#fff" />
          <Text className="text-[15px] font-semibold text-primary-foreground">
            Save changes
          </Text>
        </Button>
      </Surface>

      <Surface className="gap-4 p-5">
        <View>
          <View className="flex-row items-center gap-2">
            <Palette size={16} color="#34c759" />
            <Text className="text-[16px] font-bold tracking-tight">
              Avatar accent
            </Text>
          </View>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            Personalize the colour of your avatar.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          {ACCENTS.map((a) => {
            const active = a.key === accent.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => onAccent(a)}
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: a.fill,
                  borderWidth: active ? 2 : 1,
                  borderColor: a.ring,
                }}
              >
                <View
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: a.ring }}
                />
              </Pressable>
            );
          })}
        </View>
      </Surface>
    </View>
  );
}

/* ============================ Security panel ============================ */
function scorePassword(pw: string): number {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

function SecurityPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const score = scorePassword(next);
  const canSubmit = !!current && next.length >= 6 && next === confirm && !saving;

  const submit = async () => {
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.put("/auth/password", {
        currentPassword: current,
        newPassword: next,
      });
      setMsg({ ok: true, text: "Password updated." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: any) {
      setMsg({
        ok: false,
        text: err?.response?.data?.message || "Could not change password.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="gap-4 p-5">
      <View>
        <View className="flex-row items-center gap-2">
          <KeyRound size={16} color="#34c759" />
          <Text className="text-[16px] font-bold tracking-tight">
            Change password
          </Text>
        </View>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Use a password you don't reuse anywhere else.
        </Text>
      </View>

      <Field label="Current password">
        <View className="relative justify-center">
          <Input
            secureTextEntry={!show}
            value={current}
            onChangeText={setCurrent}
            className="pr-16"
          />
          <Pressable
            onPress={() => setShow(!show)}
            className="absolute right-3"
            hitSlop={8}
          >
            <Text className="text-[13px] font-semibold text-primary">
              {show ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>
      </Field>

      <Field label="New password">
        <Input secureTextEntry={!show} value={next} onChangeText={setNext} />
      </Field>
      <Field label="Confirm new password">
        <Input
          secureTextEntry={!show}
          value={confirm}
          onChangeText={setConfirm}
        />
      </Field>

      {next ? (
        <View className="gap-1.5">
          <View className="flex-row gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                className={
                  "h-1.5 flex-1 rounded-full " +
                  (i < score
                    ? score <= 1
                      ? "bg-destructive"
                      : score === 2
                        ? "bg-chart-3"
                        : "bg-primary"
                    : "bg-secondary")
                }
              />
            ))}
          </View>
          <Text className="text-[12px] text-muted-foreground">
            Strength:{" "}
            <Text className="font-semibold text-foreground">
              {STRENGTH[score]}
            </Text>
          </Text>
        </View>
      ) : null}

      {msg ? <Banner ok={msg.ok}>{msg.text}</Banner> : null}

      <Button
        onPress={submit}
        loading={saving}
        disabled={!canSubmit}
        className="flex-row gap-2 self-end"
      >
        <ShieldCheck size={16} color="#fff" />
        <Text className="text-[15px] font-semibold text-primary-foreground">
          Update password
        </Text>
      </Button>
    </Surface>
  );
}

/* ============================ Notifications panel ============================ */
const PREFS = [
  {
    key: "pickup",
    label: "Pickup & drop-off updates",
    desc: "Status changes, OTP, and arrival alerts.",
  },
  {
    key: "offers",
    label: "Nearby offers & reminders",
    desc: "Recycling reminders and seasonal drives.",
  },
  {
    key: "digest",
    label: "Monthly impact digest",
    desc: "Your reclaimed-materials summary by email.",
  },
  {
    key: "product",
    label: "Product news",
    desc: "New features and occasional announcements.",
  },
] as const;

function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    pickup: true,
    offers: true,
    digest: true,
    product: false,
  });

  const toggle = (key: string) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  return (
    <Surface className="gap-1 p-5">
      <View className="mb-3">
        <Text className="text-[16px] font-bold tracking-tight">
          Notification preferences
        </Text>
        <Text className="mt-1 text-[13px] text-muted-foreground">
          Choose what CTR can send you.
        </Text>
      </View>
      {PREFS.map((p, i) => (
        <View
          key={p.key}
          className={
            "flex-row items-center justify-between gap-4 py-4 " +
            (i > 0 ? "border-t border-border" : "")
          }
        >
          <View className="min-w-0 flex-1">
            <Text className="text-[14px] font-semibold">{p.label}</Text>
            <Text className="text-[13px] text-muted-foreground">{p.desc}</Text>
          </View>
          <Switch value={!!prefs[p.key]} onValueChange={() => toggle(p.key)} />
        </View>
      ))}
    </Surface>
  );
}

/* ============================ shared bits ============================ */
function Banner({ ok, children }: { ok: boolean; children: string }) {
  return (
    <View
      className={
        "flex-row items-center gap-2 rounded-xl px-4 py-3 " +
        (ok ? "bg-primary/10" : "bg-destructive/10")
      }
    >
      {ok ? (
        <CheckCircle2 size={16} color="#34c759" />
      ) : (
        <AlertCircle size={16} color="#ff3b30" />
      )}
      <Text
        className={
          "flex-1 text-[13.5px] font-medium " +
          (ok ? "text-primary" : "text-destructive")
        }
      >
        {children}
      </Text>
    </View>
  );
}
