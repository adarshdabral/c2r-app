import { useState } from "react";
import { View } from "react-native";
import Toast from "react-native-toast-message";
import { Megaphone } from "lucide-react-native";
import { Text, Surface, Button, Input, Textarea, Select, type SelectOption } from "@/components/ui";
import { broadcastNotification } from "@/lib/api";
import { useColors } from "@/lib/theme";

const AUDIENCE: SelectOption[] = [
  { value: "", label: "Everyone" },
  { value: "user", label: "Consumers" },
  { value: "recycler", label: "Recyclers" },
  { value: "admin", label: "Admins" },
];

/**
 * Admin announcement composer — sends an in-app broadcast notification to all
 * users or a specific role (uses the notifications broadcast API). Gated behind
 * the notifications feature at the API layer.
 */
export function AdminBroadcast() {
  const c = useColors();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [role, setRole] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim()) {
      Toast.show({ type: "error", text1: "A title is required" });
      return;
    }
    setSending(true);
    try {
      const { delivered } = await broadcastNotification({
        title: title.trim(),
        body: body.trim() || undefined,
        role: role || undefined,
      });
      Toast.show({ type: "success", text1: "Broadcast sent", text2: `Delivered to ${delivered} user(s)` });
      setTitle("");
      setBody("");
      setRole("");
    } catch (e: any) {
      Toast.show({ type: "error", text1: e?.response?.data?.message || "Couldn't send broadcast" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Surface className="gap-3 p-5">
      <View className="flex-row items-center gap-2">
        <Megaphone size={18} color={c.accentForeground} />
        <Text className="text-[15px] font-bold">Send an announcement</Text>
      </View>
      <Text variant="caption" className="-mt-1">
        Sends an in-app notification to the selected audience immediately.
      </Text>

      <View className="gap-1.5">
        <Text variant="caption">Audience</Text>
        <Select value={role} onValueChange={setRole} options={AUDIENCE} placeholder="Everyone" />
      </View>
      <View className="gap-1.5">
        <Text variant="caption">Title</Text>
        <Input value={title} onChangeText={setTitle} placeholder="e.g. New rewards are live!" maxLength={160} />
      </View>
      <View className="gap-1.5">
        <Text variant="caption">Message (optional)</Text>
        <Textarea value={body} onChangeText={setBody} placeholder="Add more detail…" maxLength={500} className="min-h-[80px]" />
      </View>

      <Button onPress={send} loading={sending} disabled={!title.trim()} className="self-start px-5">
        Send broadcast
      </Button>
    </Surface>
  );
}
