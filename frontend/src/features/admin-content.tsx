import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";
import Toast from "react-native-toast-message";
import {
  Film,
  ImageIcon,
  Images,
  Plus,
  Save,
  Trash2,
  Type,
  HelpCircle,
} from "lucide-react-native";
import {
  getSiteContent,
  putSiteSetting,
  getSiteItemsAdmin,
  createSiteItem,
  updateSiteItem,
  deleteSiteItem,
  siteItemMediaUrl,
  absoluteMediaUrl,
  type SiteCollection,
  type SiteContent,
  type SiteMediaItem,
} from "@/lib/api";
import { Text, Button, Input, Textarea, Switch, Surface, LoadingState } from "@/components/ui";
import { useColors } from "@/lib/theme";
import { pickImages, pickVideo } from "@/lib/imagePicker";

/**
 * Admin CMS: manage the public home/marketing surface — hero copy, hero video,
 * impact image, plus the carousel and FAQ-gallery collections. All media is
 * uploaded as base64 and stored in MySQL by the backend.
 */
export function ContentSection() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setContent(await getSiteContent());
    } catch {
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState label="Loading content…" />;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 }}
      showsVerticalScrollIndicator={false}
    >
      <HeroCopyCard content={content} />
      <ImpactImageCard content={content} onSaved={load} />
      <HeroVideoCard content={content} onSaved={load} />
      <CollectionCard
        collection="carousel"
        title="Home carousel"
        subtitle="Rotating banner images with captions on the landing page."
        icon={Images}
        withBody={false}
      />
      <CollectionCard
        collection="faq_gallery"
        title="FAQ gallery"
        subtitle="Illustrated help cards — image, question, and answer."
        icon={HelpCircle}
        withBody
      />
    </ScrollView>
  );
}

/* ------------------------------ Hero copy ------------------------------ */

function HeroCopyCard({ content }: { content: SiteContent | null }) {
  const [heading, setHeading] = useState(content?.settings.hero_heading?.text ?? "");
  const [subheading, setSubheading] = useState(content?.settings.hero_subheading?.text ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all([
        putSiteSetting("hero_heading", { text: heading }),
        putSiteSetting("hero_subheading", { text: subheading }),
      ]);
      Toast.show({ type: "success", text1: "Hero copy saved" });
    } catch {
      Toast.show({ type: "error", text1: "Couldn't save hero copy" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="mb-4 gap-3 p-5">
      <CardHeader icon={Type} title="Hero copy" subtitle="Headline and supporting line on the landing page." />
      <View className="gap-1.5">
        <Text className="text-[12px] font-semibold text-muted-foreground">Heading</Text>
        <Input value={heading} onChangeText={setHeading} placeholder="Recycle e-waste the right way" />
      </View>
      <View className="gap-1.5">
        <Text className="text-[12px] font-semibold text-muted-foreground">Subheading</Text>
        <Textarea
          value={subheading}
          onChangeText={setSubheading}
          placeholder="Doorstep pickup, verified recyclers, measurable impact."
          multiline
          numberOfLines={2}
          className="min-h-[64px]"
        />
      </View>
      <Button size="sm" onPress={save} loading={saving} className="flex-row gap-1.5 self-start px-4">
        <Save size={15} color="#fff" />
        <Text className="text-[13px] font-semibold text-primary-foreground">Save copy</Text>
      </Button>
    </Surface>
  );
}

/* ------------------------------ Impact image ------------------------------ */

function ImpactImageCard({ content, onSaved }: { content: SiteContent | null; onSaved: () => void }) {
  const current = absoluteMediaUrl(content?.settings.impact_image?.mediaUrl);
  const [preview, setPreview] = useState<string | null>(current);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const choose = async () => {
    const [img] = await pickImages(1);
    if (img) {
      setPreview(img);
      setDirty(true);
    }
  };

  const save = async () => {
    if (!dirty || !preview) return;
    setSaving(true);
    try {
      await putSiteSetting("impact_image", { media: preview });
      Toast.show({ type: "success", text1: "Impact image updated" });
      setDirty(false);
      onSaved();
    } catch {
      Toast.show({ type: "error", text1: "Couldn't upload image" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="mb-4 gap-3 p-5">
      <CardHeader icon={ImageIcon} title="Impact image" subtitle="Featured photo in the impact section." />
      <MediaPreview uri={preview} kind="image" />
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={choose} className="flex-1">
          {preview ? "Replace image" : "Choose image"}
        </Button>
        {dirty ? (
          <Button size="sm" onPress={save} loading={saving} className="flex-1">
            Save
          </Button>
        ) : null}
      </View>
    </Surface>
  );
}

/* ------------------------------ Hero video ------------------------------ */

function HeroVideoCard({ content, onSaved }: { content: SiteContent | null; onSaved: () => void }) {
  const hasVideo = !!content?.settings.hero_video?.hasMedia;
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const choose = async () => {
    const vid = await pickVideo();
    if (vid) setPending(vid);
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await putSiteSetting("hero_video", { media: pending });
      Toast.show({ type: "success", text1: "Hero video updated" });
      setPending(null);
      onSaved();
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: e?.response?.data?.message || "Couldn't upload video",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Surface className="mb-4 gap-3 p-5">
      <CardHeader icon={Film} title="Hero video" subtitle="Background clip on the landing hero. Keep it short (≤15MB)." />
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${hasVideo || pending ? "bg-primary" : "bg-muted-foreground/40"}`} />
        <Text className="text-[12.5px] text-muted-foreground">
          {pending ? "New clip ready to save" : hasVideo ? "A hero video is published" : "No hero video yet"}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button size="sm" variant="outline" onPress={choose} className="flex-1">
          {hasVideo ? "Replace video" : "Choose video"}
        </Button>
        {pending ? (
          <Button size="sm" onPress={save} loading={saving} className="flex-1">
            Save
          </Button>
        ) : null}
      </View>
    </Surface>
  );
}

/* ------------------------------ Collections ------------------------------ */

function CollectionCard({
  collection,
  title,
  subtitle,
  icon,
  withBody,
}: {
  collection: SiteCollection;
  title: string;
  subtitle: string;
  icon: typeof Images;
  withBody: boolean;
}) {
  const c = useColors();
  const [items, setItems] = useState<SiteMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await getSiteItemsAdmin(collection));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const [img] = await pickImages(1);
    if (!img) return;
    setAdding(true);
    try {
      const item = await createSiteItem(collection, {
        media: img,
        sortOrder: items.length,
        isActive: true,
      });
      setItems((prev) => [...prev, item]);
      Toast.show({ type: "success", text1: "Item added" });
    } catch {
      Toast.show({ type: "error", text1: "Couldn't add item" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Surface className="mb-4 gap-3 p-5">
      <CardHeader icon={icon} title={title} subtitle={subtitle} />
      {loading ? (
        <LoadingState label="Loading…" />
      ) : items.length === 0 ? (
        <Text className="py-2 text-[12.5px] text-muted-foreground">No items yet. Add one below.</Text>
      ) : (
        <View className="gap-3">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              withBody={withBody}
              onChange={(next) => setItems((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
              onRemove={() => setItems((prev) => prev.filter((p) => p.id !== it.id))}
            />
          ))}
        </View>
      )}
      <Button size="sm" variant="outline" onPress={add} loading={adding} className="flex-row gap-1.5 self-start px-4">
        <Plus size={15} color={c.accentForeground} />
        <Text className="text-[13px] font-semibold text-primary">Add item</Text>
      </Button>
    </Surface>
  );
}

function ItemRow({
  item,
  withBody,
  onChange,
  onRemove,
}: {
  item: SiteMediaItem;
  withBody: boolean;
  onChange: (next: SiteMediaItem) => void;
  onRemove: () => void;
}) {
  const c = useColors();
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body ?? "");
  const [saving, setSaving] = useState(false);
  const [ver, setVer] = useState(0); // cache-buster for the image after replace

  const persist = async (patch: Parameters<typeof updateSiteItem>[1]) => {
    setSaving(true);
    try {
      onChange(await updateSiteItem(item.id, patch));
    } catch {
      Toast.show({ type: "error", text1: "Couldn't save changes" });
    } finally {
      setSaving(false);
    }
  };

  const replaceImage = async () => {
    const [img] = await pickImages(1);
    if (!img) return;
    await persist({ media: img });
    setVer((v) => v + 1);
  };

  const toggleActive = (value: boolean) => {
    onChange({ ...item, isActive: value });
    persist({ isActive: value });
  };

  const remove = async () => {
    try {
      await deleteSiteItem(item.id);
      onRemove();
    } catch {
      Toast.show({ type: "error", text1: "Couldn't delete item" });
    }
  };

  return (
    <Surface variant="inset" className="gap-2.5 p-3">
      <View className="flex-row gap-3">
        <Image
          source={{ uri: siteItemMediaUrl(item.id, ver) || undefined }}
          className="h-16 w-16 rounded-xl bg-muted"
          resizeMode="cover"
        />
        <View className="flex-1 gap-1.5">
          <Input value={title} onChangeText={setTitle} placeholder={withBody ? "Question" : "Caption"} className="text-[13px]" />
          {withBody ? (
            <Textarea value={body} onChangeText={setBody} placeholder="Answer" multiline className="min-h-[44px] text-[13px]" />
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Switch value={item.isActive} onValueChange={toggleActive} />
          <Text className="text-[12px] text-muted-foreground">{item.isActive ? "Published" : "Hidden"}</Text>
        </View>
        <View className="flex-row gap-2">
          <Button size="sm" variant="ghost" onPress={replaceImage} className="px-2">
            <Text className="text-[12px] font-semibold text-primary">Image</Text>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onPress={() => persist({ title, body: withBody ? body : undefined })}
            loading={saving}
            className="px-3"
          >
            <Text className="text-[12px] font-semibold">Save</Text>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onPress={remove}
            className="px-2"
            accessibilityLabel="Delete item"
          >
            <Trash2 size={15} color={c.destructive} />
          </Button>
        </View>
      </View>
    </Surface>
  );
}

/* ------------------------------ Shared bits ------------------------------ */

function CardHeader({ icon: Icon, title, subtitle }: { icon: typeof Images; title: string; subtitle: string }) {
  const c = useColors();
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.12]">
        <Icon size={18} color={c.accentForeground} />
      </View>
      <View className="flex-1">
        <Text className="font-display text-[15px]">{title}</Text>
        <Text className="mt-0.5 text-[11.5px] text-muted-foreground">{subtitle}</Text>
      </View>
    </View>
  );
}

function MediaPreview({ uri, kind }: { uri: string | null; kind: "image" | "video" }) {
  const c = useColors();
  if (!uri) {
    return (
      <View className="h-40 items-center justify-center rounded-2xl bg-muted">
        <ImageIcon size={26} color={c.mutedForeground} />
        <Text className="mt-1.5 text-[12px] text-muted-foreground">No {kind} yet</Text>
      </View>
    );
  }
  return <Image source={{ uri }} className="h-40 w-full rounded-2xl bg-muted" resizeMode="cover" />;
}
