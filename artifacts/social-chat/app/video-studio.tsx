import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGetVideosQueryKey, useCreatePost, useGetVideoCapabilities, useRenderVideo, useTranscribeVideo, type CaptionCue, type MediaAttachment } from "@workspace/api-client-react";
import { VideoView, useVideoPlayer } from "expo-video";
import { useRouter } from "expo-router";
import { useAuthedMedia } from "@/components/videoKit";
import { uploadDeviceMedia } from "@/components/Media";
import { useColors } from "@/hooks/useColors";

type Capture = { uri: string; name: string; mime: string; duration: number };
const effects = ["none", "warm", "soft", "mono"] as const;
const speeds = [0.5, 1, 1.5, 2] as const;
const aspects = ["original", "portrait", "square"] as const;
function message(e: unknown) { return e instanceof Error ? e.message : "Please try again."; }

export default function VideoStudioScreen() {
  const colors = useColors();
  const router = useRouter();
  const cache = useQueryClient();
  const insets = useSafeAreaInsets();
  const caps = useGetVideoCapabilities();
  const render = useRenderVideo();
  const transcribe = useTranscribeVideo();
  const create = useCreatePost();
  const [clip, setClip] = useState<Capture | null>(null);
  const [uploaded, setUploaded] = useState<MediaAttachment | null>(null);
  const [edited, setEdited] = useState<MediaAttachment | null>(null);
  const [duration, setDuration] = useState(60);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("30");
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(1);
  const [aspect, setAspect] = useState<(typeof aspects)[number]>("original");
  const [effect, setEffect] = useState<(typeof effects)[number]>("none");
  const [mirror, setMirror] = useState(false);
  const [audio, setAudio] = useState<MediaAttachment | null>(null);
  const [rights, setRights] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [originalVolume, setOriginalVolume] = useState("1");
  const [musicVolume, setMusicVolume] = useState("0.5");
  const [captions, setCaptions] = useState<CaptionCue[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const preview = useAuthedMedia(edited);
  const player = useVideoPlayer(preview.source, p => { p.loop = true; });
  const canRender = !!caps.data?.rendering;
  const canTranscribe = !!caps.data?.transcription;
  const range = useMemo(() => ({ start: Number(start), end: Number(end) }), [start, end]);
  const invalidate = () => void cache.invalidateQueries({ queryKey: getGetVideosQueryKey() });

  async function capture(camera: boolean) {
    setError("");
    try {
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 90, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoMaxDuration: 90, quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const mime = asset.mimeType?.split(";")[0] || "video/mp4";
      if (!["video/mp4", "video/quicktime", "video/webm"].includes(mime)) { setError("Choose an MP4, MOV or WebM video."); return; }
      if (asset.fileSize && asset.fileSize > 25 * 1024 * 1024) { setError("Choose a video under 25 MB."); return; }
      const seconds = asset.duration && asset.duration > 0 ? Math.min(asset.duration / 1000, 90) : 60;
      setClip({ uri: asset.uri, name: asset.fileName || "vastmind-clip.mp4", mime, duration: seconds });
      setDuration(seconds);
      setStart("0");
      setEnd(String(Math.floor(seconds * 10) / 10));
      setUploaded(null); setEdited(null); setCaptions([]); setAudio(null); setRights(false); setNotice("");
    } catch (e) { setError(message(e)); }
  }

  async function pickMusic() {
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 25 * 1024 * 1024) { setError("Choose an audio file under 25 MB."); return; }
      const media = await uploadDeviceMedia(asset.uri, asset.name, (asset.mimeType || "audio/mpeg").split(";")[0], "post");
      setAudio(media); setEdited(null); setRights(false);
    } catch (e) { setError(message(e)); }
  }

  async function prepare() {
    if (!clip || busy) return null;
    if (audio && !rights) { setError("Confirm you own this music or have permission to use it."); return null; }
    if (Number(end) - Number(start) > 0 && (Number(end) - Number(start)) / speed > 90) { setError("Keep your final clip under 90 seconds."); return null; }
    setError("");
    try {
      setBusy("Uploading original video");
      const source = await uploadDeviceMedia(clip.uri, clip.name, clip.mime, "post");
      setUploaded(source);
      return source;
    } catch (e) { setError(message(e)); return null; }
    finally { setBusy(""); }
  }

  async function makePreview() {
    if (!clip || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start || range.end > 90 || range.end > clip.duration) {
      setError(`Choose a trim range from 0 to ${Math.floor(clip?.duration ?? 90)} seconds.`); return;
    }
    const source = uploaded || await prepare();
    if (!source) return;
    try {
      setError(""); setCaptions([]); setBusy("Rendering your edited preview");
      const result = await render.mutateAsync({ data: { mediaId: source.id, start: range.start, end: range.end, speed, aspect, effect, mirror,
        originalVolume: Number(originalVolume), musicVolume: Number(musicVolume), ...(audio && rights ? { audioMediaId: audio.id } : {}) } });
      setEdited(result.media);
      setNotice(`Preview rendered · ${Math.round(result.durationSeconds)} seconds. Check it before publishing.`);
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); }
  }

  async function draftCaptions() {
    if (!aiConsent) { setError("Allow AI transcription first."); return; }
    const source = edited || uploaded || await prepare();
    if (!source) return;
    try {
      setError(""); setBusy("Drafting captions");
      const result = await transcribe.mutateAsync({ data: { mediaId: source.id } });
      setCaptions(result.captions);
      if (!result.captions.length) setNotice("No clear speech was detected. Add captions yourself if needed.");
      else setNotice(`${result.captions.length} timed caption windows drafted. Review and edit them before publishing.`);
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); }
  }

  async function publish() {
    if (audio && !rights) { setEdited(null); setError("This edited version uses an audio track. Confirm your permission and render it again before publishing."); return; }
    if (!edited || !caption.trim() || busy) { if (!caption.trim()) setError("Add a caption to your post."); return; }
    try {
      setError(""); setBusy("Publishing clip");
      await create.mutateAsync({ data: { content: caption.trim(), surface: "feed", mediaId: edited.id, effect: "none", ...(captions.length ? { captions } : {}) } });
      invalidate();
      Alert.alert("Clip shared", "Your edited video is on your VastMind feed.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (e) { setError(message(e)); }
    finally { setBusy(""); }
  }

  const control = (label: string, active: boolean, onPress: () => void, key: string) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={{ borderWidth: 1, borderColor: active ? colors.primary : colors.border, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: active ? colors.secondary : colors.card }}>
      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </Pressable>;
  const field = (label: string, value: string, setter: (value: string) => void) => <View style={{ flex: 1 }} key={label}>
    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{label}</Text>
    <TextInput accessibilityLabel={label} keyboardType="decimal-pad" value={value} onChangeText={setter} style={{ color: colors.foreground, backgroundColor: colors.card, borderRadius: 12, padding: 11, marginTop: 6 }} />
  </View>;

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 18, paddingTop: insets.top + 18, backgroundColor: colors.background }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Pressable accessibilityLabel="Go back" onPress={() => router.back()}><Feather name="arrow-left" size={22} color={colors.foreground} /></Pressable>
      <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800" }}>Clip studio</Text><Text style={{ color: colors.mutedForeground }}>Record or edit up to 90 seconds.</Text></View>
    </View>
    <View style={{ flexDirection: "row", gap: 10 }}>
      {["Record with camera", "Choose video"].map((label, index) => <Pressable key={label} accessibilityRole="button" disabled={!!busy} onPress={() => void capture(index === 0)} style={{ flex: 1, alignItems: "center", gap: 7, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.card }}>
        <Feather name={index === 0 ? "camera" : "upload"} size={22} color={colors.primary} /><Text style={{ color: colors.foreground, fontWeight: "700", textAlign: "center" }}>{label}</Text>
      </Pressable>)}
    </View>
    {!canRender && !caps.isLoading ? <Text style={{ color: colors.mutedForeground }}>Video editing is temporarily unavailable on this server. You can still upload clips from the web editor.</Text> : null}
    {!clip ? <View style={{ padding: 30, alignItems: "center", borderRadius: 20, backgroundColor: colors.card }}><Feather name="film" size={30} color={colors.mutedForeground} /><Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 12 }}>Choose a video from your camera or library to get started.</Text></View> : <>
      <View style={{ padding: 15, backgroundColor: colors.card, borderRadius: 18 }}>
        <Text style={{ color: colors.foreground, fontWeight: "700" }}>{clip.name}</Text><Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>Up to {Math.round(duration)} sec · maximum 25 MB</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>{field("Trim from (sec)", start, value => { setStart(value); setEdited(null); setCaptions([]); })}{field("Trim to (sec)", end, value => { setEnd(value); setEdited(null); setCaptions([]); })}</View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.foreground, fontWeight: "800" }}>Edit your clip</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{speeds.map(value => control(`${value}×`, speed === value, () => { setSpeed(value); setEdited(null); setCaptions([]); }, `speed${value}`))}</ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{aspects.map(value => control(value === "original" ? "As shot" : value, aspect === value, () => { setAspect(value); setEdited(null); setCaptions([]); }, value))}</ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{effects.map(value => control(value === "none" ? "Original" : value, effect === value, () => { setEffect(value); setEdited(null); setCaptions([]); }, `effect${value}`))}</ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
          <Text style={{ color: colors.foreground }}>Mirror image</Text><Switch value={mirror} onValueChange={value => { setMirror(value); setEdited(null); setCaptions([]); }} accessibilityLabel="Mirror image" />
        </View>
      </View>
      <View style={{ padding: 15, borderRadius: 18, backgroundColor: colors.card, gap: 12 }}>
        <Text style={{ color: colors.foreground, fontWeight: "800" }}>Sound</Text>
        <Pressable accessibilityRole="button" onPress={() => void pickMusic()} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
          <Feather name="music" size={18} color={colors.primary} /><Text style={{ color: colors.foreground, flex: 1 }}>{audio ? "Choose another audio track" : "Add your own audio track"}</Text>
        </Pressable>
        {audio ? <View style={{ flexDirection: "row", gap: 10 }}>{field("Original audio 0–1", originalVolume, value => { setOriginalVolume(value); setEdited(null); setCaptions([]); })}{field("Music volume 0–1", musicVolume, value => { setMusicVolume(value); setEdited(null); setCaptions([]); })}</View> : null}
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>VastMind does not include a licensed music catalogue.</Text>
        {audio ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Switch accessibilityLabel="I have rights to use this music" value={rights} onValueChange={setRights} /><Text style={{ flex: 1, color: colors.foreground, fontSize: 12 }}>I own this music or have permission to publish it.</Text></View> : null}
      </View>
      <TextInput accessibilityLabel="Clip caption" multiline maxLength={5000} value={caption} onChangeText={setCaption} placeholder="Add a caption for your clip…" placeholderTextColor={colors.mutedForeground} style={{ minHeight: 82, padding: 14, borderRadius: 16, backgroundColor: colors.card, color: colors.foreground, textAlignVertical: "top" }} />
      {edited ? <View style={{ height: 300, borderRadius: 18, overflow: "hidden", backgroundColor: "#10262b" }}><VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls /></View> : null}
      {edited && captions.length ? <View style={{ gap: 8 }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>Review captions · approximate five-second timings</Text>{captions.map((cue, index) =>
        <View key={`${cue.start}-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ width: 48, fontSize: 11, color: colors.mutedForeground }}>{Math.floor(cue.start)}s</Text>
          <TextInput accessibilityLabel={`Edit caption ${index + 1}`} value={cue.text} onChangeText={text => setCaptions(items => items.map((x, i) => i === index ? { ...x, text } : x))}
            style={{ flex: 1, backgroundColor: colors.card, color: colors.foreground, padding: 10, borderRadius: 12 }} />
        </View>)}</View> : null}
      <View style={{ padding: 15, backgroundColor: colors.card, borderRadius: 18, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ flex: 1, color: colors.foreground, fontWeight: "700" }}>Allow AI to draft captions from this clip's audio</Text><Switch accessibilityLabel="Allow AI transcription" value={aiConsent} onValueChange={setAiConsent} /></View>
        {aiConsent ? <Pressable accessibilityRole="button" disabled={!!busy || !canTranscribe} onPress={() => void draftCaptions()} style={{ padding: 12, borderRadius: 16, backgroundColor: colors.secondary }}>
          <Text style={{ color: colors.foreground, textAlign: "center", fontWeight: "700" }}>{canTranscribe ? "Draft captions with AI" : "AI captions unavailable"}</Text>
        </Pressable> : null}
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>AI captions use five-second timing windows, not word-level alignment. Review before sharing. You can also add your own captions on the web editor.</Text>
      </View>
      {notice ? <Text style={{ color: colors.mutedForeground }}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!canRender || !!busy} onPress={() => void makePreview()} style={{ alignItems: "center", padding: 15, borderRadius: 18, borderWidth: 1, borderColor: colors.primary }}>
        {busy.includes("Rendering") ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: "800" }}>{edited ? "Render edited preview again" : "Render edited preview"}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={!edited || !caption.trim() || !!busy || (!!audio && !rights)} onPress={() => void publish()} style={{ alignItems: "center", padding: 15, borderRadius: 18, backgroundColor: colors.primary, opacity: !edited || !caption.trim() || !!busy || (!!audio && !rights) ? 0.45 : 1 }}>
        <Text style={{ color: colors.primaryForeground, fontWeight: "800" }}>{busy || "Share clip"}</Text>
      </Pressable>
    </>}
    {busy ? <View accessibilityRole="progressbar" accessibilityLabel={busy}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>{busy}</Text></View> : null}
    {!caps.isLoading && caps.isError ? <Text style={{ color: colors.mutedForeground }}>Could not check editing or caption service availability. You can retry here later.</Text> : null}
  </ScrollView>;
}
