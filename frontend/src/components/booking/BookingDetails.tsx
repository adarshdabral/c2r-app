import { useCallback, useEffect, useState } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Toast from "react-native-toast-message";
import { format } from "date-fns";
import {
  Boxes,
  Camera,
  Download,
  FileCheck2,
  ImagePlus,
  Scale,
  ShieldCheck,
} from "lucide-react-native";
import { Text, Surface, Button, Input, Field } from "@/components/ui";
import { PressableScale } from "@/components/motion/PressableScale";
import { Shimmer } from "@/components/motion/Shimmer";
import { useColors } from "@/lib/theme";
import {
  getRequestImages,
  uploadRequestImages,
  getCertificate,
  generateCertificate,
  certificateDownloadPath,
  type RequestImages,
  type RequestItemGroup,
  type Certificate,
  type RequestKind,
} from "@/lib/api";
import { pickImages, takePhoto } from "@/lib/imagePicker";
import { getToken } from "@/lib/auth";

type Role = "user" | "recycler" | "admin";

/**
 * The extra booking record introduced by the multi-category / certificate /
 * image / quantity features. Reused on the user's and the recycler's screens;
 * behaviour adapts to `role`.
 */
export function BookingDetails({
  type,
  id,
  role,
  declaredQty,
  verifiedQty,
  items,
  sanitizationRequested,
  onChange,
}: {
  type: RequestKind;
  id: number;
  role: Role;
  declaredQty: number;
  verifiedQty?: number | null;
  items?: RequestItemGroup[];
  sanitizationRequested?: boolean;
  onChange?: () => void;
}) {
  const c = useColors();
  const [images, setImages] = useState<RequestImages | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [imgs, c] = await Promise.all([
        getRequestImages(type, id),
        sanitizationRequested ? getCertificate(type, id) : Promise.resolve(null),
      ]);
      setImages(imgs);
      setCert(c);
    } catch {
      setImages({ user: [], recycler: [] });
    }
  }, [type, id, sanitizationRequested]);

  useEffect(() => {
    load();
  }, [load]);

  const canUpload = role === "user" || role === "recycler";
  const mySide: "user" | "recycler" = role === "recycler" ? "recycler" : "user";

  const addImages = async (mode: "library" | "camera") => {
    if (imgBusy) return;
    setImgBusy(true);
    try {
      const picked =
        mode === "camera"
          ? ([await takePhoto()].filter(Boolean) as string[])
          : await pickImages(8);
      if (picked.length) {
        const updated = await uploadRequestImages(type, id, picked);
        setImages(updated);
      }
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Upload failed", text2: e?.response?.data?.message });
    } finally {
      setImgBusy(false);
    }
  };

  const downloadCert = async () => {
    try {
      const base = process.env.EXPO_PUBLIC_API_URL || "";
      const url = `${base}${certificateDownloadPath(type, id)}`;
      const target = `${FileSystem.cacheDirectory}${cert?.certificateNo || "certificate"}.pdf`;
      const res = await FileSystem.downloadAsync(url, target, {
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      } else {
        Toast.show({ type: "success", text1: "Certificate saved", text2: res.uri });
      }
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Couldn't open the certificate" });
    }
  };

  const mismatch = verifiedQty != null && Number(verifiedQty) !== Number(declaredQty);

  return (
    <View className="mt-3 gap-3">
      {/* Itemised categories → appliances */}
      {items && items.length > 0 ? (
        <Surface variant="inset" className="gap-2 p-3.5">
          <View className="flex-row items-center gap-1.5">
            <Boxes size={13} color={c.accentForeground} />
            <Text className="text-[11px] font-bold tracking-wide text-accent-foreground">ITEMS</Text>
          </View>
          {items.map((cat) => (
            <Text key={cat.categoryId} className="text-[12.5px]">
              <Text className="font-semibold">{cat.categoryName}</Text>
              {cat.items.length ? `: ${cat.items.map((i) => i.name).join(", ")}` : ""}
            </Text>
          ))}
        </Surface>
      ) : null}

      {/* Quantity: declared vs verified (informational) */}
      {verifiedQty != null ? (
        <Surface variant="inset" className="flex-row items-center gap-3 p-3.5">
          <Scale size={16} color={c.mutedForeground} />
          <View className="flex-1 flex-row gap-5">
            <View>
              <Text className="text-[10.5px] text-muted-foreground">Declared</Text>
              <Text className="text-[14px] font-bold">{declaredQty} kg</Text>
            </View>
            <View>
              <Text className="text-[10.5px] text-muted-foreground">Verified</Text>
              <Text className="text-[14px] font-bold">{verifiedQty} kg</Text>
            </View>
          </View>
          {mismatch ? (
            <View className="rounded-full bg-chart-3/15 px-2.5 py-1">
              <Text className="text-[10px] font-semibold text-chart-3">Quantity mismatch</Text>
            </View>
          ) : null}
        </Surface>
      ) : null}

      {/* Images — user + recycler sets in separate sections */}
      <Surface variant="inset" className="gap-3 p-3.5">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <ImagePlus size={13} color={c.accentForeground} />
            <Text className="text-[11px] font-bold tracking-wide text-accent-foreground">PHOTOS</Text>
          </View>
          {canUpload ? (
            <View className="flex-row gap-2">
              <PressableScale
                onPress={() => addImages("library")}
                disabled={imgBusy}
                accessibilityLabel="Add photos from library"
              >
                <View className="flex-row items-center gap-1 rounded-full bg-primary/[0.1] px-2.5 py-1.5">
                  <ImagePlus size={13} color={c.accentForeground} />
                  <Text className="text-[11.5px] font-semibold text-primary">Add</Text>
                </View>
              </PressableScale>
              <PressableScale
                onPress={() => addImages("camera")}
                disabled={imgBusy}
                accessibilityLabel="Take photo"
              >
                <View className="h-7 w-7 items-center justify-center rounded-full bg-card">
                  <Camera size={14} color={c.foreground} />
                </View>
              </PressableScale>
            </View>
          ) : null}
        </View>

        {images == null ? (
          <View className="flex-row gap-2">
            {[0, 1, 2].map((k) => (
              <Shimmer key={k} style={{ height: 60, width: 60 }} radius={10} />
            ))}
          </View>
        ) : (
          <>
            <ImageRow label="Your photos" images={role === "recycler" ? images.recycler : images.user} />
            <ImageRow
              label={role === "recycler" ? "Customer photos" : "Recycler photos"}
              images={role === "recycler" ? images.user : images.recycler}
            />
          </>
        )}
      </Surface>

      {/* Data sanitization certificate */}
      {sanitizationRequested ? (
        <Surface variant="inset" className="gap-3 p-3.5">
          <View className="flex-row items-center gap-1.5">
            <ShieldCheck size={13} color={c.accentForeground} />
            <Text className="text-[11px] font-bold tracking-wide text-accent-foreground">
              DATA SANITIZATION CERTIFICATE
            </Text>
          </View>

          {cert ? (
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <FileCheck2 size={16} color={c.accentForeground} />
                <View className="flex-1">
                  <Text className="text-[13px] font-semibold">{cert.certificateNo}</Text>
                  <Text className="text-[11px] text-muted-foreground">
                    {cert.sanitizationMethod} · {cert.sanitizedOn}
                  </Text>
                </View>
              </View>
              <Button size="sm" onPress={downloadCert} className="flex-row gap-1.5">
                <Download size={15} color="#fff" />
                <Text className="text-[13px] font-semibold text-primary-foreground">View certificate</Text>
              </Button>
            </View>
          ) : role === "recycler" ? (
            showCertForm ? (
              <CertificateForm
                onCancel={() => setShowCertForm(false)}
                onDone={async () => {
                  setShowCertForm(false);
                  await load();
                  onChange?.();
                }}
                type={type}
                id={id}
              />
            ) : (
              <Button size="sm" onPress={() => setShowCertForm(true)} className="flex-row gap-1.5">
                <ShieldCheck size={15} color="#fff" />
                <Text className="text-[13px] font-semibold text-primary-foreground">
                  Generate certificate
                </Text>
              </Button>
            )
          ) : (
            <Text className="text-[12.5px] text-muted-foreground">
              Requested — the recycler will issue your certificate after sanitization.
            </Text>
          )}
        </Surface>
      ) : null}
    </View>
  );
}

function ImageRow({ label, images }: { label: string; images: { id: number; dataUrl: string }[] }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11px] font-medium text-muted-foreground">
        {label} {images.length ? `(${images.length})` : ""}
      </Text>
      {images.length === 0 ? (
        <Text className="text-[11.5px] text-muted-foreground/70">None yet.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {images.map((im) => (
            <Image key={im.id} source={{ uri: im.dataUrl }} style={{ width: 60, height: 60, borderRadius: 10 }} />
          ))}
        </View>
      )}
    </View>
  );
}

function CertificateForm({
  type,
  id,
  onDone,
  onCancel,
}: {
  type: RequestKind;
  id: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState("");
  const [person, setPerson] = useState("");
  const [designation, setDesignation] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!method.trim() || !person.trim()) {
      Toast.show({ type: "error", text1: "Method and authorised person are required" });
      return;
    }
    setBusy(true);
    try {
      await generateCertificate(type, id, {
        sanitizationMethod: method.trim(),
        sanitizedOn: format(date, "yyyy-MM-dd"),
        authorisedPerson: person.trim(),
        designation: designation.trim() || undefined,
      });
      Toast.show({ type: "success", text1: "Certificate issued" });
      onDone();
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Couldn't issue certificate", text2: e?.response?.data?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-3">
      <Field label="Sanitization method">
        <Input placeholder="e.g. NIST 800-88 Purge" value={method} onChangeText={setMethod} />
      </Field>
      <Field label="Date of sanitization">
        <Pressable
          onPress={() => setShowPicker(true)}
          className="h-12 justify-center rounded-full border border-input bg-card px-4"
        >
          <Text className="text-[15px]">{format(date, "EEE, MMM d, yyyy")}</Text>
        </Pressable>
      </Field>
      {showPicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          maximumDate={new Date()}
          onChange={(e, d) => {
            setShowPicker(Platform.OS === "ios");
            if (e.type === "set" && d) setDate(d);
            if (e.type === "dismissed") setShowPicker(false);
          }}
        />
      ) : null}
      <Field label="Authorised person">
        <Input placeholder="Full name" value={person} onChangeText={setPerson} />
      </Field>
      <Field label="Designation (optional)">
        <Input placeholder="e.g. Facility Manager" value={designation} onChangeText={setDesignation} />
      </Field>
      <View className="flex-row gap-2.5">
        <Button variant="outline" className="flex-1" onPress={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onPress={submit} loading={busy}>
          Issue certificate
        </Button>
      </View>
    </View>
  );
}
