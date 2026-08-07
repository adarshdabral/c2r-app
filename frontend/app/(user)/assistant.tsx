import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ArrowLeft, ArrowRight, Send, Sparkles } from "lucide-react-native";
import { Text } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { DOMAIN } from "@/lib/domains";
import { assistantQuery, getAssistantIntro, type AssistantAction } from "@/lib/api";

type Msg = {
  id: string;
  from: "bot" | "user";
  text: string;
  suggestions?: string[];
  action?: AssistantAction;
};

let seq = 0;
const nextId = () => `m${seq++}`;

export default function AssistantScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Greeting + starter chips.
  useEffect(() => {
    getAssistantIntro()
      .then((intro) =>
        setMessages([{ id: nextId(), from: "bot", text: intro.greeting, suggestions: intro.suggestions }])
      )
      .catch(() =>
        setMessages([
          {
            id: nextId(),
            from: "bot",
            text: "Hi! I'm the Connect2Recycle assistant. Ask me about pickups, drop-offs, accepted e-waste, OTPs, rewards, drives, or reports.",
            suggestions: ["How do I schedule a pickup?", "What e-waste do you accept?"],
          },
        ])
      );
  }, []);

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((prev) => [...prev, { id: nextId(), from: "user", text }]);
    setSending(true);
    scrollDown();
    try {
      const res = await assistantQuery(text);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), from: "bot", text: res.reply, suggestions: res.suggestions, action: res.action },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          from: "bot",
          text: "I couldn't reach the server just now. Please check your connection and try again.",
        },
      ]);
    } finally {
      setSending(false);
      scrollDown();
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      {/* Header */}
      <View className="overflow-hidden">
        <LinearGradient colors={DOMAIN.assistant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
          <View className="flex-row items-center gap-3">
            <Pressable onPress={() => router.back()} hitSlop={10} className="h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <ArrowLeft size={19} color="#fff" />
            </Pressable>
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
              <Sparkles size={20} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-[18px] text-white">Assistant</Text>
              <Text className="text-[11.5px] text-white/85">Answers about pickups, drop-offs & more</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
          onContentSizeChange={scrollDown}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} onChip={send} onAction={(href) => router.push(href as any)} />
          ))}
          {sending ? (
            <View className="flex-row items-center gap-2 self-start rounded-2xl rounded-bl-md bg-card px-4 py-3 shadow-clay-sm">
              <ActivityIndicator size="small" color="#0d9488" />
              <Text className="text-[12.5px] text-muted-foreground">Thinking…</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Composer */}
        <View className="flex-row items-end gap-2 border-t border-border/60 bg-background px-3 py-2.5">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor="#6c7278"
            multiline
            className="max-h-28 flex-1 rounded-2xl bg-muted px-4 py-2.5 text-[14px] text-foreground"
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <PressableScale onPress={() => send(input)} disabled={!input.trim() || sending}>
            <View
              className={`h-11 w-11 items-center justify-center rounded-full ${
                input.trim() && !sending ? "bg-primary" : "bg-muted"
              }`}
            >
              <Send size={18} color={input.trim() && !sending ? "#fff" : "#9aa0a6"} />
            </View>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({
  msg,
  onChip,
  onAction,
}: {
  msg: Msg;
  onChip: (text: string) => void;
  onAction: (href: string) => void;
}) {
  const isBot = msg.from === "bot";
  return (
    <Animated.View entering={FadeInUp.duration(280)} className={isBot ? "items-start" : "items-end"}>
      <View
        className={
          "max-w-[85%] px-4 py-3 " +
          (isBot
            ? "rounded-2xl rounded-bl-md bg-card shadow-clay-sm"
            : "rounded-2xl rounded-br-md bg-primary")
        }
      >
        <Text className={isBot ? "text-[14px] leading-[20px] text-foreground" : "text-[14px] leading-[20px] text-primary-foreground"}>
          {msg.text}
        </Text>
      </View>

      {/* CTA deep link */}
      {isBot && msg.action ? (
        <PressableScale onPress={() => onAction(msg.action!.href)}>
          <View className="mt-2 flex-row items-center gap-1.5 rounded-full bg-primary/[0.12] px-3.5 py-2">
            <Text className="text-[12.5px] font-bold text-primary">{msg.action.label}</Text>
            <ArrowRight size={14} color="#1f6b38" />
          </View>
        </PressableScale>
      ) : null}

      {/* Follow-up suggestion chips */}
      {isBot && msg.suggestions && msg.suggestions.length > 0 ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {msg.suggestions.map((s) => (
            <PressableScale key={s} onPress={() => onChip(s)}>
              <View className="rounded-full border border-border bg-background px-3 py-1.5">
                <Text className="text-[12px] font-medium text-foreground">{s}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}
