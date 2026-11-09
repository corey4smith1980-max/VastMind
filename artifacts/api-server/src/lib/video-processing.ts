import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { openAsBlob, createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, HttpError, query, transaction, uuid } from "./social";
import { storage, MEDIA_LIMIT } from "./media";
import { logger } from "./logger";

const exec = promisify(execFile);
type RenderSettings = {
  start: number; end: number; speed?: number; aspect?: string; effect?: string;
  mirror?: boolean; originalVolume?: number; musicVolume?: number;
};
const formats = "mov,matroska,webm,wav,mp3,ogg";

async function command(binary: string, args: string[], timeout = 60_000) {
  try {
    // No shell, user-generated command fragments, network protocols, or inherited
    // app secrets. Only bounded local files are passed to the media decoders.
    return await exec(binary, args, {
      timeout, maxBuffer: 128 * 1024,
      env: { PATH: process.env.PATH, HOME: tmpdir(), LANG: "C.UTF-8" },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(503, "Video processing is unavailable on this server");
    throw new HttpError(400, "This media could not be processed. Try a supported MP4, MOV or WebM file");
  }
}

export async function videoCapabilities() {
  let rendering = false;
  try {
    await command("ffmpeg", ["-version"], 5_000);
    await command("ffprobe", ["-version"], 5_000);
    rendering = true;
  } catch { /* Capability is explicitly false, never pretend a render succeeded. */ }
  return { rendering, transcription: rendering && !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
    !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL, musicCatalog: "upload-only" as const };
}

export function renderFilters(settings: RenderSettings) {
  const speed = settings.speed ?? 1;
  assert(Number.isFinite(settings.start) && Number.isFinite(settings.end) &&
    settings.start >= 0 && settings.end > settings.start && settings.end <= 90 &&
    [0.5, 1, 1.5, 2].includes(speed) && (settings.end - settings.start) / speed <= 90,
  400, "Choose a valid trim range; the edited clip must be at most 90 seconds");
  assert(["none", "warm", "mono", "soft"].includes(settings.effect ?? "none") &&
    ["original", "portrait", "square"].includes(settings.aspect ?? "original"), 400, "Unsupported video effect");
  for (const volume of [settings.originalVolume ?? 1, settings.musicVolume ?? 0.5]) {
    assert(Number.isFinite(volume) && volume >= 0 && volume <= 1, 400, "Invalid sound volume");
  }
  const filters = [`setpts=(PTS-STARTPTS)/${speed}`];
  if (settings.aspect === "portrait") filters.push("crop='trunc(min(iw,ih*9/16)/2)*2':'trunc(min(ih,iw*16/9)/2)*2'");
  if (settings.aspect === "square") filters.push("crop='trunc(min(iw,ih)/2)*2':'trunc(min(iw,ih)/2)*2'");
  if (settings.mirror) filters.push("hflip");
  if (settings.effect === "warm") filters.push("colorbalance=rs=.09:bs=-.06,eq=saturation=1.12");
  if (settings.effect === "mono") filters.push("hue=s=0");
  if (settings.effect === "soft") filters.push("eq=contrast=.94:brightness=.03:saturation=.85");
  filters.push("scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2", "setsar=1", "fps=30");
  return filters.join(",");
}

async function probe(file: string) {
  const { stdout } = await command("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe",
    "-format_whitelist", formats, "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], 20_000);
  const data = JSON.parse(stdout);
  let duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    // Browser MediaRecorder WebM blobs commonly omit container duration.
    // Bounded packet timestamps handle these without guessing from file size.
    const packets = await command("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe",
      "-format_whitelist", formats, "-select_streams", "v:0", "-read_intervals", "%+#6000",
      "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", file], 20_000);
    const rows = packets.stdout.trim().split("\n").filter(Boolean);
    assert(rows.length < 6000, 400, "Choose a video at 60 frames per second or lower");
    const times = rows.map(row => row.split(",").map(Number)).filter(row => Number.isFinite(row[0]));
    duration = times.length ? Math.max(...times.map(row => row[0] + (Number.isFinite(row[1]) ? row[1] : 0))) -
      Math.min(...times.map(row => row[0])) : NaN;
  }
  assert(Number.isFinite(duration) && duration > 0 && duration <= 90.25, 400, "Choose a video no longer than 90 seconds");
  assert(data.streams?.some((s: { codec_type: string }) => s.codec_type === "video"), 400, "The file has no video stream");
  return { duration, audio: data.streams.some((s: { codec_type: string }) => s.codec_type === "audio") };
}

async function downloadOwned(id: string, user: string, dest: string, kind: "video" | "audio") {
  const [media] = await query(`SELECT * FROM media_uploads WHERE id=$1 AND owner_id=$2
    AND purpose='post' AND ready=true AND attached=false`, [id, user]);
  assert(media && media.content_type.startsWith(`${kind}/`), 403, "Choose your own verified, unpublished upload");
  const object = await storage.getObjectEntityFile(media.object_path);
  const [metadata] = await object.getMetadata();
  assert(Number(metadata.size) > 0 && Number(metadata.size) <= MEDIA_LIMIT, 400, "Media exceeds the 25 MB limit");
  let bytes = 0;
  const bound = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length;
    done(bytes > MEDIA_LIMIT ? new HttpError(400, "Media exceeds the 25 MB limit") : null, chunk);
  } });
  const pinned = object.bucket.file(object.name, { generation: metadata.generation });
  await pipeline(pinned.createReadStream(), bound, createWriteStream(dest, { flags: "wx", mode: 0o600 }),
    { signal: AbortSignal.timeout(45_000) });
}

async function inWorkSlot<T>(user: string, kind: string, run: (dir: string) => Promise<T>) {
  const id = uuid();
  await transaction(async q => {
    // Hold this global lock only while claiming the lease, never while decoding,
    // waiting on storage, or calling the AI service.
    await q("SELECT pg_advisory_xact_lock(821409)");
    await q("UPDATE video_processing_jobs SET state='expired' WHERE state='active' AND expires_at<=now()");
    await q("DELETE FROM video_processing_jobs WHERE created_at<now()-interval '24 hours'");
    const [counts] = await q(`SELECT
      count(*) FILTER(WHERE state='active')::int AS active,
      count(*) FILTER(WHERE state='active' AND user_id=$1)::int AS mine,
      count(*) FILTER(WHERE user_id=$1 AND created_at>now()-interval '1 hour')::int AS hourly,
      count(*) FILTER(WHERE user_id=$1 AND kind='captions' AND created_at>now()-interval '1 hour')::int AS captions
      FROM video_processing_jobs`, [user]);
    assert(counts.active < 2 && counts.mine === 0, 429, "Video processing is busy. Try again shortly");
    assert(counts.hourly < 24 && (kind !== "captions" || counts.captions < 6), 429, "Hourly video processing limit reached. Try again later");
    await q(`INSERT INTO video_processing_jobs(id,user_id,kind,state,expires_at)
      VALUES($1,$2,$3,'active',now()+interval '5 minutes')`, [id, user, kind]);
  });
  const dir = await mkdtemp(join(tmpdir(), "vastmind-video-"));
  let state = "failed";
  try { const result = await run(dir); state = "done"; return result; }
  finally {
    await rm(dir, { recursive: true, force: true }).catch(() => logger.warn("Video temporary cleanup failed"));
    await query("UPDATE video_processing_jobs SET state=$2 WHERE id=$1", [id, state]).catch(() => logger.warn("Video lease finalization failed"));
  }
}

// Shared by the authenticated render pipeline and real encoder regression tests.
export async function encodeClip(source: string, output: string, input: RenderSettings, music?: string) {
  const filter = renderFilters(input);
    const info = await probe(source);
    assert(input.end <= info.duration + 0.1, 400, "Trim end exceeds the source video");
    const duration = (input.end - input.start) / (input.speed ?? 1);
    const args = ["-nostdin", "-v", "error", "-threads", "2", "-filter_threads", "1",
      "-protocol_whitelist", "file,pipe", "-format_whitelist", formats,
      "-ss", String(input.start), "-t", String(input.end - input.start), "-i", source];
    if (music) args.push("-protocol_whitelist", "file,pipe", "-format_whitelist", formats, "-stream_loop", "-1", "-i", music);
    const audio: string[] = [];
    if (info.audio) audio.push(`[0:a]atempo=${input.speed ?? 1},volume=${input.originalVolume ?? 1}[orig]`);
    if (music) audio.push(`[1:a]volume=${input.musicVolume ?? 0.5}[music]`);
    if (info.audio && music) audio.push("[orig][music]amix=inputs=2:duration=first:normalize=0[a]");
    else if (info.audio) audio.push("[orig]anull[a]");
    else if (music) audio.push("[music]anull[a]");
    if (audio.length) args.push("-filter_complex_threads", "1", "-filter_complex", audio.join(";"));
    args.push("-map", "0:v:0", "-vf", filter);
    if (audio.length) args.push("-map", "[a]", "-c:a", "aac", "-b:a", "96k");
    else args.push("-an");
    args.push("-t", String(duration), "-map_metadata", "-1", "-map_chapters", "-1", "-c:v", "libx264",
      "-preset", "veryfast", "-crf", "26", "-maxrate", "1500k", "-bufsize", "3000k", "-threads", "2",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", output);
    await command("ffmpeg", args, 120_000);
    return probe(output);
}

export async function renderClip(user: string, input: RenderSettings & { mediaId: string; audioMediaId?: string }) {
  renderFilters(input);
  return inWorkSlot(user, "render", async dir => {
    const source = join(dir, "source");
    const music = join(dir, "music");
    const output = join(dir, "edited.mp4");
    await downloadOwned(input.mediaId, user, source, "video");
    if (input.audioMediaId) await downloadOwned(input.audioMediaId, user, music, "audio");
    const result = await encodeClip(source, output, input, input.audioMediaId ? music : undefined);
    const size = (await stat(output)).size;
    assert(size > 0 && size <= MEDIA_LIMIT, 400, "Edited video is too large. Try a shorter clip");
    const reserved = await storage.reserveUpload({ contentType: "video/mp4" });
    const uploadUrl = reserved.uploadUrl;
    const objectPath = reserved.objectPath;
    const mediaId = uuid();
    await query(`INSERT INTO media_uploads(id,owner_id,object_path,name,content_type,size,purpose)
      VALUES($1,$2,$3,'VastMind clip.mp4','video/mp4',$4,'post')`, [mediaId, user, objectPath, String(size)]);
    try {
      const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" },
        body: await openAsBlob(output, { type: "video/mp4" }), signal: AbortSignal.timeout(60_000) });
      assert(response.ok, 502, "Edited clip could not be saved. Your original upload is unchanged");
      await query("UPDATE media_uploads SET ready=true WHERE id=$1", [mediaId]);
    } catch (error) {
      await query("DELETE FROM media_uploads WHERE id=$1", [mediaId]);
      try { await (await storage.getObjectEntityFile(objectPath)).delete(); } catch { /* Upload may not exist. */ }
      throw error;
    }
    return { media: { id: mediaId, url: `/api/storage/media/${mediaId}`, name: "VastMind clip.mp4",
      contentType: "video/mp4", size }, durationSeconds: result.duration };
  });
}

export async function transcribeClip(user: string, mediaId: string) {
  const base = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  assert(base && key, 503, "Automatic captions are not configured");
  return inWorkSlot(user, "captions", async dir => {
    const source = join(dir, "source");
    await downloadOwned(mediaId, user, source, "video");
    const info = await probe(source);
    assert(info.audio, 400, "This video has no audio to transcribe");
    await command("ffmpeg", ["-nostdin", "-v", "error", "-threads", "2", "-protocol_whitelist", "file,pipe",
      "-format_whitelist", formats, "-i", source, "-vn", "-t", "90", "-ar", "16000", "-ac", "1",
      "-c:a", "pcm_s16le", "-f", "segment", "-segment_time", "5", join(dir, "cue-%03d.wav")]);
    const files = (await readdir(dir)).filter(f => /^cue-\d{3}\.wav$/.test(f)).sort();
    assert(files.length > 0 && files.length <= 19, 400, "Unable to extract speech");
    const captions: { start: number; end: number; text: string }[] = new Array(files.length);
    let next = 0;
    // Timings are bounded five-second speech windows, not claimed word alignment.
    await Promise.all([0, 1].map(async () => {
      while (next < files.length) {
        const i = next++;
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(await readFile(join(dir, files[i])))], { type: "audio/wav" }), files[i]);
        form.append("model", "gpt-4o-mini-transcribe");
        form.append("response_format", "json");
        const response = await fetch(`${base.replace(/\/$/, "")}/audio/transcriptions`, {
          method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(10_000),
        });
        assert(response.ok, 502, "Automatic captions are temporarily unavailable. Retry or add captions manually");
        const data = await response.json() as { text?: unknown };
        assert(typeof data.text === "string", 502, "Invalid caption service response");
        captions[i] = { start: i * 5, end: Math.min((i + 1) * 5, info.duration, 90), text: data.text.trim().slice(0, 500) };
      }
    }));
    const cues = captions.filter(cue => cue.text && cue.end > cue.start);
    return { captions: cues, text: cues.map(cue => cue.text).join(" ") };
  });
}
