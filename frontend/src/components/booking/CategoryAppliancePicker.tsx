import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { Text, Surface, LoadingState } from "@/components/ui";
import { useColors } from "@/lib/theme";
import {
  getEwasteCategories,
  type EwasteCategory,
  type RequestItemSelection,
} from "@/lib/api";

/**
 * CPCB category → appliance selector. Categories are an accordion; expanding one
 * reveals its appliances as toggle chips. Emits `[{ categoryId, itemIds }]` for
 * every category with at least one appliance chosen. Data-driven — the list
 * comes from `/api/ewaste/categories`.
 */
export function CategoryAppliancePicker({
  value,
  onChange,
}: {
  value: RequestItemSelection[];
  onChange: (next: RequestItemSelection[]) => void;
}) {
  const c = useColors();
  const [categories, setCategories] = useState<EwasteCategory[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getEwasteCategories()
      .then(setCategories)
      .catch(() => setError(true));
  }, []);

  const selected = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const s of value) m.set(s.categoryId, new Set(s.itemIds));
    return m;
  }, [value]);

  const toggleItem = (categoryId: number, itemId: number) => {
    const next = new Map([...selected].map(([k, v]) => [k, new Set(v)]));
    const set = next.get(categoryId) ?? new Set<number>();
    if (set.has(itemId)) set.delete(itemId);
    else set.add(itemId);
    next.set(categoryId, set);
    const out: RequestItemSelection[] = [];
    for (const [cid, ids] of next) if (ids.size) out.push({ categoryId: cid, itemIds: [...ids] });
    onChange(out);
  };

  if (error) {
    return <Text className="text-[13px] text-muted-foreground">Couldn&apos;t load categories.</Text>;
  }
  if (!categories) return <LoadingState label="Loading categories…" />;

  return (
    <View className="gap-2.5">
      {categories.map((cat) => {
        const set = selected.get(cat.id);
        const count = set?.size ?? 0;
        const open = expanded === cat.id;
        return (
          <Surface key={cat.id} variant="inset" className="overflow-hidden p-0">
            <Pressable
              onPress={() => setExpanded(open ? null : cat.id)}
              className="flex-row items-center gap-3 p-3.5"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[13.5px] font-semibold" numberOfLines={1}>
                  {cat.name}
                </Text>
                <Text className={count > 0 ? "text-[11.5px] text-primary" : "text-[11.5px] text-muted-foreground"}>
                  {count > 0 ? `${count} selected` : `${cat.items.length} items`}
                </Text>
              </View>
              {count > 0 ? (
                <View className="h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5">
                  <Text className="text-[10px] font-bold text-white">{count}</Text>
                </View>
              ) : null}
              <ChevronDown
                size={18}
                color={c.mutedForeground}
                style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            {open ? (
              <View className="flex-row flex-wrap gap-2 border-t border-border px-3.5 pb-3.5 pt-3">
                {cat.items.map((it) => {
                  const on = set?.has(it.id) ?? false;
                  return (
                    <Pressable
                      key={it.id}
                      onPress={() => toggleItem(cat.id, it.id)}
                      className={
                        "flex-row items-center gap-1.5 rounded-full border px-3 py-2 " +
                        (on ? "border-primary bg-primary/[0.12]" : "border-input bg-card")
                      }
                    >
                      {on ? <Check size={13} color={c.accentForeground} /> : null}
                      <Text className={"text-[12.5px] font-medium " + (on ? "text-primary" : "text-muted-foreground")}>
                        {it.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </Surface>
        );
      })}
    </View>
  );
}
