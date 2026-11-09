"use client";

import { type DragEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Library,
  Magnet,
  Mic,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Scissors,
  Search,
  SkipBack,
  Square,
  Timer,
  Trash2,
  Undo2,
  Upload,
  UserCheck,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { UserAvatar } from "@/components/profile/user-avatar";
import { Button } from "@/components/ui/button";
import { pick, type Role } from "@/data/catalog";
import {
  mutateCommunity,
  openChatWindow,
  uploadAudioFile,
  useCommunityStore,
  useCurrentUser,
} from "@/lib/community-store";
import type { DbUser } from "@/lib/db-types";
import type { SemanticMusicianHit } from "@/lib/vector-search";
import { audioBufferToWav } from "@/lib/wav";
import {
  AudioEngine,
  type Clip,
  clipEndTime,
  clipLength,
  computePeaks,
  type Project,
  projectEnd,
  renderMix,
  type Track,
  TRACK_COLORS,
  uid,
} from "./daw-engine";
import {
  type ClipDragKind,
  ClipView,
  formatBars,
  formatTime,
  HEADER_W,
  LANE_H,
  Ruler,
  RULER_H,
  TrackHeader,
} from "./daw-parts";

type Selection = { trackId: string; clipId: string } | null;
type Loop = { start: number; end: number; on: boolean };
type Drag =
  | { kind: ClipDragKind; trackId: string; clipId: string; startX: number; orig: Clip; changed: boolean }
  | { kind: "ruler"; startX: number; startTime: number; moved: boolean };

const MIN_PPS = 10;
const MAX_PPS = 400;

function safeSampleSrc(value: string | null) {
  if (!value || value.includes("..")) return null;
  return value.startsWith("/media/") || value.startsWith("/uploads/") ? value : null;
}

function newTrack(index: number, name: string): Track {
  return {
    id: uid("trk"),
    name,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    volume: 1,
    pan: 0,
    muted: false,
    solo: false,
    clips: [],
  };
}

function updateClip(p: Project, trackId: string, clipId: string, patch: Partial<Clip>): Project {
  return {
    ...p,
    tracks: p.tracks.map((t) =>
      t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : t,
    ),
  };
}

export function MixEditor() {
  const t = useTranslations("Editor");
  const home = useTranslations("Home");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { db } = useCommunityStore();
  const currentUser = useCurrentUser();

  const [project, setProject] = useState<Project>(() => ({
    tracks: [newTrack(0, t("trackName", { n: 1 })), newTrack(1, t("trackName", { n: 2 }))],
    bpm: 100,
    masterVolume: 0.9,
  }));
  const historyRef = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const [history, setHistory] = useState({ past: 0, future: 0 });
  const [sources, setSources] = useState<Record<string, { peaks: Float32Array; duration: number }>>({});
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [position, setPosition] = useState(0);
  const [pps, setPps] = useState(60);
  const [snap, setSnap] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [loop, setLoop] = useState<Loop>({ start: 0, end: 0, on: false });
  const [selected, setSelected] = useState<Selection>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [note, setNote] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSearchHits, setPickerSearchHits] = useState<DbUser[] | null>(null);
  const [pickerSearching, setPickerSearching] = useState(false);

  const engineRef = useRef<AudioEngine | null>(null);
  const buffersRef = useRef(new Map<string, AudioBuffer>());
  const projectRef = useRef(project);
  const playingRef = useRef(false);
  const recordingRef = useRef(false);
  const loopRef = useRef(loop);
  const ppsRef = useRef(pps);
  const snapRef = useRef(snap);
  const metronomeRef = useRef(metronome);
  const dragRef = useRef<Drag | null>(null);
  const pendingRulerSeek = useRef<number | null>(null);
  const pushHistoryRef = useRef<(p: Project) => void>(() => {});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const playedKeyRef = useRef("");
  const loadedSrcRef = useRef<string | null>(null);
  const actionsRef = useRef<Record<string, () => void>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const barsRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    projectRef.current = project;
    loopRef.current = loop;
    ppsRef.current = pps;
    snapRef.current = snap;
    metronomeRef.current = metronome;
  });

  useEffect(() => () => engineRef.current?.dispose(), []);

  const end = projectEnd(project);
  const timelineWidth = Math.max(end + 30, 60, loop.end + 10) * pps;
  const beatPx = (60 / project.bpm) * pps;
  const clipsKey = useMemo(
    () => JSON.stringify([project.tracks.map((tr) => [tr.id, tr.clips]), project.bpm, metronome]),
    [project.tracks, project.bpm, metronome],
  );
  const selectedClip = useMemo(() => {
    if (!selected) return null;
    const track = project.tracks.find((tr) => tr.id === selected.trackId);
    const clip = track?.clips.find((c) => c.id === selected.clipId);
    return track && clip ? { track, clip } : null;
  }, [project.tracks, selected]);
  const showcaseAudio = useMemo(
    () =>
      db.collections
        .filter((c) => c.kind === "audio" && c.audioSrc)
        .map((c) => ({ item: c, owner: db.users.find((u) => u.id === c.musicianId) })),
    [db.collections, db.users],
  );
  const myFollowIds = useMemo(
    () => (currentUser ? (db.follows[currentUser.id] ?? []) : []),
    [db.follows, currentUser],
  );
  const recipients = useMemo(
    () =>
      db.users.filter(
        (u) =>
          u.profileCompleted &&
          u.id !== currentUser?.id &&
          (!u.isPrivate || myFollowIds.includes(u.id)),
      ),
    [db.users, currentUser, myFollowIds],
  );
  const followingMusicians = useMemo(
    () => recipients.filter((u) => myFollowIds.includes(u.id)),
    [recipients, myFollowIds],
  );
  const selectedRecipient = useMemo(
    () => recipients.find((u) => u.id === sendTo) ?? db.users.find((u) => u.id === sendTo) ?? null,
    [recipients, db.users, sendTo],
  );

  useEffect(() => {
    const q = pickerQuery.trim();
    if (!pickerOpen || !q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPickerSearching(true);
      try {
        const res = await fetch(`/community-search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { hits?: SemanticMusicianHit[] };
        if (cancelled) return;
        const semanticUsers = (data.hits ?? [])
          .map((h) => h.user)
          .filter((u) => u.id !== currentUser?.id);
        const lower = q.toLowerCase();
        const localMatches = recipients.filter(
          (u) =>
            u.name.toLowerCase().includes(lower) ||
            u.nameBn.toLowerCase().includes(lower) ||
            u.city.toLowerCase().includes(lower) ||
            u.instruments.some((ins) => ins.toLowerCase().includes(lower)) ||
            u.genres.some((g) => g.toLowerCase().includes(lower)),
        );
        const merged = new Map<string, DbUser>();
        for (const u of [...localMatches, ...semanticUsers]) {
          merged.set(u.id, u);
        }
        setPickerSearchHits(Array.from(merged.values()));
      } catch {
        if (!cancelled) setPickerSearchHits([]);
      } finally {
        if (!cancelled) setPickerSearching(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickerOpen, pickerQuery, recipients, currentUser]);

  function getEngine() {
    engineRef.current ??= new AudioEngine();
    return engineRef.current;
  }

  function currentPosition() {
    return playingRef.current && engineRef.current ? engineRef.current.position() : position;
  }

  // ---- project mutations with undo history ----
  function setHistoryStacks(next: { past: Project[]; future: Project[] }) {
    historyRef.current = next;
    setHistory({ past: next.past.length, future: next.future.length });
  }

  function pushHistory(prev: Project) {
    setHistoryStacks({ past: [...historyRef.current.past.slice(-79), prev], future: [] });
  }

  function change(updater: (p: Project) => Project) {
    const prev = projectRef.current;
    const next = updater(prev);
    projectRef.current = next;
    pushHistory(prev);
    setProject(next);
  }

  function live(updater: (p: Project) => Project) {
    const next = updater(projectRef.current);
    projectRef.current = next;
    setProject(next);
  }

  function undo() {
    const h = historyRef.current;
    const prev = h.past.at(-1);
    if (!prev) return;
    setHistoryStacks({ past: h.past.slice(0, -1), future: [projectRef.current, ...h.future] });
    projectRef.current = prev;
    setProject(prev);
  }

  function redo() {
    const h = historyRef.current;
    const next = h.future[0];
    if (!next) return;
    setHistoryStacks({ past: [...h.past, projectRef.current], future: h.future.slice(1) });
    projectRef.current = next;
    setProject(next);
  }

  // ---- audio import ----
  async function addAudio(
    data: ArrayBuffer,
    name: string,
    opts: { trackId?: string; newTrack?: boolean; offset?: number; trim?: number } = {},
  ) {
    let buffer: AudioBuffer;
    try {
      buffer = await getEngine().decode(data);
    } catch {
      setNotice("decodeError");
      return;
    }
    const bufferId = uid("buf");
    buffersRef.current.set(bufferId, buffer);
    setSources((s) => ({ ...s, [bufferId]: { peaks: computePeaks(buffer), duration: buffer.duration } }));
    const trim = Math.min(opts.trim ?? 0, buffer.duration - 0.05);
    const clip: Clip = {
      id: uid("clip"),
      bufferId,
      name,
      start: Math.max(0, trim),
      end: buffer.duration,
      offset: opts.offset ?? 0,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
    change((p) => {
      let target = opts.trackId ? p.tracks.find((tr) => tr.id === opts.trackId) : undefined;
      if (!target && !opts.newTrack) target = p.tracks.find((tr) => tr.clips.length === 0);
      if (target) {
        const id = target.id;
        return { ...p, tracks: p.tracks.map((tr) => (tr.id === id ? { ...tr, clips: [...tr.clips, clip] } : tr)) };
      }
      const created = { ...newTrack(p.tracks.length, name), clips: [clip] };
      return { ...p, tracks: [...p.tracks, created] };
    });
    setNotice("");
  }

  async function importFiles(files: FileList | File[], trackId?: string) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|ogg|aac|webm|flac)$/i.test(file.name)) continue;
      const track = trackId ? projectRef.current.tracks.find((tr) => tr.id === trackId) : undefined;
      await addAudio(await file.arrayBuffer(), file.name.replace(/\.[^.]+$/, ""), {
        trackId,
        offset: track && track.clips.length > 0 ? currentPosition() : 0,
      });
    }
  }

  async function importUrl(url: string, name: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("load");
      await addAudio(await res.arrayBuffer(), name);
    } catch {
      setNotice("decodeError");
    }
  }

  useEffect(() => {
    const src = safeSampleSrc(searchParams.get("src"));
    if (!src || loadedSrcRef.current === src) return;
    loadedSrcRef.current = src;
    void (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("load");
        const data = await res.arrayBuffer();
        await addAudio(data, src.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "take");
        setNotice("loaded");
      } catch {
        setNotice("decodeError");
      }
    })();
    // addAudio only touches refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ---- transport ----
  async function startPlayback(from: number) {
    const p = projectRef.current;
    playedKeyRef.current = clipsKey;
    await getEngine().play(p, buffersRef.current, from, {
      metronome: metronomeRef.current,
      metronomeUntil: Math.max(projectEnd(p), from) + 180,
    });
    playingRef.current = true;
    setPlaying(true);
  }

  function pause() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.pause();
    playingRef.current = false;
    setPlaying(false);
    setPosition(engine.position());
  }

  function togglePlay() {
    if (recordingRef.current) {
      stopRecording();
      return;
    }
    if (playingRef.current) pause();
    else if (end === 0 && !metronomeRef.current) setNotice("needFile");
    else void startPlayback(position >= end && end > 0 && !loop.on ? 0 : loop.on && loop.end > loop.start ? Math.min(Math.max(position, loop.start), loop.end - 0.01) : position);
  }

  function stopAll() {
    if (recordingRef.current) stopRecording();
    engineRef.current?.pause();
    engineRef.current?.seek(0);
    playingRef.current = false;
    setPlaying(false);
    setPosition(0);
  }

  function seek(pos: number) {
    const p = Math.max(0, pos);
    if (playingRef.current && !recordingRef.current) void startPlayback(p);
    else engineRef.current?.seek(p);
    setPosition(p);
  }

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      setNotice("micDenied");
      return;
    }
    const engine = getEngine();
    const from = currentPosition();
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const count = projectRef.current.tracks.length + 1;
      void blob.arrayBuffer().then((data) =>
        addAudio(data, t("recordingName", { n: count }), { newTrack: true, offset: from, trim: engine.latency }),
      );
    };
    recorderRef.current = recorder;
    recordingRef.current = true;
    setRecording(true);
    setNotice("recording");
    recorder.start();
    await startPlayback(from);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setNotice("");
    pause();
  }

  // Restart playback when clips change mid-play (not on pure mix changes).
  useEffect(() => {
    if (!playing || dragging || recordingRef.current || playedKeyRef.current === clipsKey) return;
    const engine = engineRef.current;
    if (!engine) return;
    playedKeyRef.current = clipsKey;
    void engine.play(projectRef.current, buffersRef.current, engine.position(), {
      metronome: metronomeRef.current,
      metronomeUntil: projectEnd(projectRef.current) + 180,
    });
  }, [clipsKey, dragging, playing]);

  useEffect(() => {
    engineRef.current?.updateMix(project);
  }, [project]);

  function drawPlayhead(pos: number) {
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${pos * ppsRef.current}px)`;
    if (timeRef.current) timeRef.current.textContent = formatTime(pos);
    if (barsRef.current) barsRef.current.textContent = formatBars(pos, projectRef.current.bpm);
  }

  useEffect(() => {
    if (!playing) drawPlayhead(position);
  });

  useEffect(() => {
    if (!playing) {
      if (meterRef.current) meterRef.current.style.width = "0%";
      return;
    }
    let raf = 0;
    const scratch = new Float32Array(1024);
    const tick = () => {
      const engine = engineRef.current;
      if (!engine) return;
      let pos = engine.position();
      const lp = loopRef.current;
      const p = projectRef.current;
      if (!recordingRef.current && lp.on && lp.end - lp.start > 0.05 && pos >= lp.end) {
        playedKeyRef.current = JSON.stringify([p.tracks.map((tr) => [tr.id, tr.clips]), p.bpm, metronomeRef.current]);
        void engine.play(p, buffersRef.current, lp.start, {
          metronome: metronomeRef.current,
          metronomeUntil: lp.end + 1,
        });
        pos = lp.start;
      } else if (!recordingRef.current && !lp.on && pos >= projectEnd(p) + 0.1 && !metronomeRef.current) {
        engine.pause();
        playingRef.current = false;
        setPlaying(false);
        setPosition(projectEnd(p));
        return;
      }
      drawPlayhead(pos);
      const scroller = scrollRef.current;
      if (scroller) {
        const x = pos * ppsRef.current;
        const visible = scroller.clientWidth - HEADER_W;
        if (x > scroller.scrollLeft + visible - 40 || x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - 40);
      }
      if (meterRef.current) {
        const level = engine.level(scratch);
        meterRef.current.style.width = `${Math.min(100, level * 100)}%`;
        meterRef.current.style.background = level > 0.98 ? "#ef4444" : level > 0.7 ? "#facc15" : "#22c55e";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // ---- pointer dragging (clips, ruler) ----
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const scale = ppsRef.current;
      const beat = 60 / projectRef.current.bpm;
      const sn = (x: number) => (snapRef.current ? Math.round(x / beat) * beat : x);
      if (d.kind === "ruler") {
        if (!d.moved && Math.abs(e.clientX - d.startX) < 4) return;
        d.moved = true;
        const cur = sn(Math.max(0, d.startTime + (e.clientX - d.startX) / scale));
        const a = sn(d.startTime);
        setLoop({ start: Math.min(a, cur), end: Math.max(a, cur), on: true });
        return;
      }
      if (!d.changed) {
        if (Math.abs(e.clientX - d.startX) < 3 && d.kind !== "move") return;
        d.changed = true;
        pushHistoryRef.current(projectRef.current);
      }
      const dt = (e.clientX - d.startX) / scale;
      const o = d.orig;
      const sourceDur = buffersRef.current.get(o.bufferId)?.duration ?? o.end;
      let patch: Partial<Clip> = {};
      if (d.kind === "move") {
        patch = { offset: Math.max(0, sn(o.offset + dt)) };
        const lanes = lanesRef.current;
        if (lanes) {
          const tracks = projectRef.current.tracks;
          const idx = Math.floor((e.clientY - lanes.getBoundingClientRect().top) / LANE_H);
          const target = tracks[Math.max(0, Math.min(tracks.length - 1, idx))];
          if (target && target.id !== d.trackId) {
            const from = d.trackId;
            const clip = tracks.find((tr) => tr.id === from)?.clips.find((c) => c.id === d.clipId);
            if (clip) {
              live((p) => ({
                ...p,
                tracks: p.tracks.map((tr) =>
                  tr.id === from
                    ? { ...tr, clips: tr.clips.filter((c) => c.id !== clip.id) }
                    : tr.id === target.id
                      ? { ...tr, clips: [...tr.clips, clip] }
                      : tr,
                ),
              }));
              d.trackId = target.id;
              setSelected({ trackId: target.id, clipId: d.clipId });
            }
          }
        }
      } else if (d.kind === "trimL") {
        const minLeft = Math.max(0, o.offset - o.start);
        const left = Math.min(Math.max(sn(o.offset + dt), minLeft), clipEndTime(o) - 0.05);
        patch = { offset: left, start: o.start + (left - o.offset) };
      } else if (d.kind === "trimR") {
        const right = Math.min(Math.max(sn(clipEndTime(o) + dt), o.offset + 0.05), o.offset + (sourceDur - o.start));
        patch = { end: o.start + (right - o.offset) };
      } else if (d.kind === "fadeIn") {
        patch = { fadeIn: Math.min(Math.max(0, o.fadeIn + dt), clipLength(o) - o.fadeOut) };
      } else if (d.kind === "fadeOut") {
        patch = { fadeOut: Math.min(Math.max(0, o.fadeOut - dt), clipLength(o) - o.fadeIn) };
      }
      live((p) => updateClip(p, d.trackId, d.clipId, patch));
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      if (d.kind === "ruler" && !d.moved) actionsRef.current.seekToRulerStart?.();
      setDragging(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function beginClipDrag(e: ReactPointerEvent, kind: ClipDragKind, trackId: string, clip: Clip) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected({ trackId, clipId: clip.id });
    dragRef.current = { kind, trackId, clipId: clip.id, startX: e.clientX, orig: clip, changed: false };
    setDragging(true);
  }

  function timeFromEvent(e: ReactPointerEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left) / pps);
  }

  // ---- editing commands ----
  function splitAtPlayhead() {
    const pos = currentPosition();
    change((p) => ({
      ...p,
      tracks: p.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips.flatMap((c) => {
          const targeted = selected ? selected.clipId === c.id : true;
          if (!targeted || pos <= c.offset + 0.01 || pos >= clipEndTime(c) - 0.01) return [c];
          const cut = c.start + (pos - c.offset);
          return [
            { ...c, end: cut, fadeOut: 0 },
            { ...c, id: uid("clip"), start: cut, offset: pos, fadeIn: 0 },
          ];
        }),
      })),
    }));
  }

  function deleteSelected() {
    if (!selected) return;
    change((p) => ({
      ...p,
      tracks: p.tracks.map((tr) =>
        tr.id === selected.trackId ? { ...tr, clips: tr.clips.filter((c) => c.id !== selected.clipId) } : tr,
      ),
    }));
    setSelected(null);
  }

  function duplicateSelected() {
    if (!selectedClip) return;
    const { track, clip } = selectedClip;
    const copy = { ...clip, id: uid("clip"), offset: clipEndTime(clip) };
    change((p) => ({
      ...p,
      tracks: p.tracks.map((tr) => (tr.id === track.id ? { ...tr, clips: [...tr.clips, copy] } : tr)),
    }));
    setSelected({ trackId: track.id, clipId: copy.id });
  }

  function patchTrack(trackId: string, patch: Partial<Track>, record: boolean) {
    const fn = (p: Project) => ({ ...p, tracks: p.tracks.map((tr) => (tr.id === trackId ? { ...tr, ...patch } : tr)) });
    if (record) change(fn);
    else live(fn);
  }

  function zoom(factor: number) {
    setPps((v) => Math.min(MAX_PPS, Math.max(MIN_PPS, Math.round(v * factor))));
  }

  async function exportWav() {
    if (end === 0) {
      setNotice("needFile");
      return;
    }
    setExporting(true);
    try {
      const rendered = await renderMix(projectRef.current, buffersRef.current);
      const url = URL.createObjectURL(audioBufferToWav(rendered));
      const a = document.createElement("a");
      a.href = url;
      a.download = "surshongi-mix.wav";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function sendMix() {
    if (!currentUser || !sendTo) return;
    if (end === 0) {
      setNotice("needFile");
      return;
    }
    setSendState("sending");
    try {
      const rendered = await renderMix(projectRef.current, buffersRef.current);
      const file = new File([audioBufferToWav(rendered)], `surshongi-mix-${Date.now()}.wav`, { type: "audio/wav" });
      const up = await uploadAudioFile(file);
      const text = note.trim() || "🎧 Sent a multitrack mix";
      await mutateCommunity({
        action: "sendMessage",
        fromId: currentUser.id,
        toId: sendTo,
        text,
        attachmentUrl: up.url,
        attachmentKind: "audio",
        attachmentName: "SurShongi Mix",
      });
      openChatWindow(sendTo);
      setNote("");
      setSendState("sent");
    } catch {
      setSendState("error");
    }
  }

  useEffect(() => {
    pushHistoryRef.current = pushHistory;
    actionsRef.current = {
      togglePlay,
      splitAtPlayhead,
      deleteSelected,
      duplicateSelected,
      undo,
      redo,
      toStart: () => seek(0),
      toggleLoop: () => setLoop((l) => ({ ...l, on: !l.on && l.end > l.start })),
      seekToRulerStart: () => {
        const d = pendingRulerSeek.current;
        if (d !== null) seek(d);
      },
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const a = actionsRef.current;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === "Space") {
        e.preventDefault();
        a.togglePlay?.();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) a.redo?.();
        else a.undo?.();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        a.redo?.();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        a.duplicateSelected?.();
      } else if (!mod && e.key.toLowerCase() === "s") {
        a.splitAtPlayhead?.();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        a.deleteSelected?.();
      } else if (e.key === "Home") {
        a.toStart?.();
      } else if (!mod && e.key.toLowerCase() === "l") {
        a.toggleLoop?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
  }

  const headerLabels = {
    mute: t("mute"),
    solo: t("solo"),
    volume: t("volume"),
    pan: t("pan"),
    importToTrack: t("importToTrack"),
    deleteTrack: t("deleteTrack"),
  };

  const toolBtn =
    "inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 text-xs font-medium text-muted-foreground hover:border-white/25 hover:text-foreground disabled:opacity-40";
  const toggleOn = "border-primary/60 bg-primary/15 text-foreground";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-5" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{t("title")}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{t("sub")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("rights")}</p>
      </div>

      {/* Transport */}
      <div className="sticky top-16 z-30 mt-5 flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-[#141414]/95 p-2.5 shadow-xl backdrop-blur">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => seek(0)} title={t("toStart")} className="grid size-10 place-items-center rounded-full hover:bg-white/10">
            <SkipBack className="size-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            title={playing ? t("pause") : t("play")}
            className="grid size-11 place-items-center rounded-full bg-gradient-to-r from-[#ff5500] to-[#ffaa33] text-[#1a0900] shadow-md"
          >
            {playing && !recording ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
          </button>
          <button type="button" onClick={stopAll} title={t("stop")} className="grid size-10 place-items-center rounded-full hover:bg-white/10">
            <Square className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : void startRecording())}
            title={recording ? t("stopRecording") : t("record")}
            className={`grid size-10 place-items-center rounded-full ${recording ? "animate-pulse bg-red-600 text-white" : "text-red-500 hover:bg-white/10"}`}
          >
            <Mic className="size-4" />
          </button>
        </div>

        <div className="flex min-w-36 flex-col rounded-2xl bg-black px-3 py-1 font-mono">
          <span ref={timeRef} className="text-lg leading-6 text-primary tabular-nums">
            00:00.000
          </span>
          <span className="text-[10px] text-muted-foreground">
            {t("bar")} <span ref={barsRef}>1.1</span>
          </span>
        </div>

        <label className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-muted-foreground">
          {t("bpm")}
          <input
            type="number"
            min={40}
            max={240}
            value={project.bpm}
            onChange={(e) => {
              const bpm = Math.min(240, Math.max(40, Number(e.target.value) || 100));
              live((p) => ({ ...p, bpm }));
            }}
            className="w-12 bg-transparent text-sm text-foreground outline-none"
          />
        </label>
        <button type="button" onClick={() => setMetronome((v) => !v)} aria-pressed={metronome} className={`${toolBtn} ${metronome ? toggleOn : ""}`}>
          <Timer className="size-3.5" />
          {t("metronome")}
        </button>
        <button type="button" onClick={() => setSnap((v) => !v)} aria-pressed={snap} className={`${toolBtn} ${snap ? toggleOn : ""}`}>
          <Magnet className="size-3.5" />
          {t("snap")}
        </button>
        <button
          type="button"
          onClick={() => setLoop((l) => (l.end > l.start ? { ...l, on: !l.on } : { start: currentPosition(), end: currentPosition() + 8, on: true }))}
          aria-pressed={loop.on}
          className={`${toolBtn} ${loop.on ? toggleOn : ""}`}
        >
          <Repeat className="size-3.5" />
          {t("loop")}
        </button>

        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/50 px-1.5 py-1">
          <button type="button" onClick={() => zoom(1 / 1.4)} title={t("zoom")} className="grid size-7 place-items-center rounded-full hover:bg-white/10">
            <ZoomOut className="size-3.5" />
          </button>
          <input
            type="range"
            min={MIN_PPS}
            max={MAX_PPS}
            value={pps}
            onChange={(e) => setPps(Number(e.target.value))}
            aria-label={t("zoom")}
            className="w-20 accent-primary"
          />
          <button type="button" onClick={() => zoom(1.4)} title={t("zoom")} className="grid size-7 place-items-center rounded-full hover:bg-white/10">
            <ZoomIn className="size-3.5" />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("master")}
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={project.masterVolume}
              onChange={(e) => live((p) => ({ ...p, masterVolume: Number(e.target.value) }))}
              className="w-20 accent-primary"
            />
          </label>
          <div className="h-2 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div ref={meterRef} className="h-full w-0 rounded-full transition-[width] duration-75" />
          </div>
          <Button type="button" size="sm" className="rounded-full" disabled={exporting} onClick={() => void exportWav()}>
            <Download className="size-4" />
            {exporting ? t("exporting") : t("export")}
          </Button>
        </div>
      </div>

      {/* Edit toolbar */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className={`${toolBtn} cursor-pointer`}>
          <Upload className="size-3.5" />
          {t("importAudio")}
          <input
            type="file"
            multiple
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void importFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <details className="relative">
          <summary className={`${toolBtn} cursor-pointer list-none`}>
            <Library className="size-3.5" />
            {t("fromShowcase")}
          </summary>
          <div className="absolute z-40 mt-2 max-h-72 w-80 overflow-y-auto rounded-2xl border border-white/10 bg-[#161616] p-2 shadow-2xl">
            {showcaseAudio.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t("noShowcaseAudio")}</p>
            ) : (
              showcaseAudio.map(({ item, owner }) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void importUrl(item.audioSrc as string, item.title)}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-white/5"
                >
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {owner ? pick(locale, owner.nameBn, owner.name) : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </details>
        <button
          type="button"
          className={toolBtn}
          onClick={() => change((p) => ({ ...p, tracks: [...p.tracks, newTrack(p.tracks.length, t("trackName", { n: p.tracks.length + 1 }))] }))}
        >
          <Plus className="size-3.5" />
          {t("addTrack")}
        </button>
        <span className="mx-1 h-6 w-px bg-white/10" />
        <button type="button" className={toolBtn} onClick={splitAtPlayhead} disabled={end === 0}>
          <Scissors className="size-3.5" />
          {t("split")}
        </button>
        <button type="button" className={toolBtn} onClick={duplicateSelected} disabled={!selectedClip}>
          <Copy className="size-3.5" />
          {t("duplicate")}
        </button>
        <button type="button" className={toolBtn} onClick={deleteSelected} disabled={!selectedClip}>
          <Trash2 className="size-3.5" />
          {t("deleteClip")}
        </button>
        <span className="mx-1 h-6 w-px bg-white/10" />
        <button type="button" className={toolBtn} onClick={undo} disabled={history.past === 0}>
          <Undo2 className="size-3.5" />
          {t("undo")}
        </button>
        <button type="button" className={toolBtn} onClick={redo} disabled={history.future === 0}>
          <Redo2 className="size-3.5" />
          {t("redo")}
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm ${notice === "recording" ? "border border-red-500/40 bg-red-500/10 text-red-300" : notice === "loaded" ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border border-amber-500/30 bg-amber-500/10 text-amber-200"}`}
        >
          {t(notice === "recording" ? "recordingHint" : notice)}
          {notice !== "recording" ? (
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss" className="rounded-full p-1 hover:bg-white/10">
              <X className="size-3.5" />
            </button>
          ) : null}
        </p>
      ) : null}

      {/* Timeline */}
      <div ref={scrollRef} className="relative mt-3 overflow-x-auto overflow-y-hidden rounded-3xl border border-white/10 bg-[#0e0e0e]">
        <div className="relative" style={{ width: HEADER_W + timelineWidth }}>
          <div className="flex">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-white/10 bg-[#151515] px-3 text-[11px] text-muted-foreground"
              style={{ width: HEADER_W, height: RULER_H }}
            >
              {t("tracksCount", { n: project.tracks.length })}
            </div>
            <Ruler
              width={timelineWidth}
              pps={pps}
              loop={loop}
              onPointerDown={(e) => {
                const time = timeFromEvent(e);
                pendingRulerSeek.current = time;
                dragRef.current = { kind: "ruler", startX: e.clientX, startTime: time, moved: false };
              }}
            />
          </div>

          <div ref={lanesRef}>
            {project.tracks.map((track, index) => (
              <div key={track.id} className="flex">
                <TrackHeader
                  track={track}
                  index={index}
                  labels={headerLabels}
                  onChange={(patch) => patchTrack(track.id, patch, !("volume" in patch || "pan" in patch || "name" in patch))}
                  onDelete={() => {
                    change((p) => ({ ...p, tracks: p.tracks.filter((tr) => tr.id !== track.id) }));
                    if (selected?.trackId === track.id) setSelected(null);
                  }}
                  onImport={(files) => void importFiles(files, track.id)}
                />
                <div
                  className="relative border-b border-white/10"
                  style={{
                    width: timelineWidth,
                    height: LANE_H,
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)",
                    backgroundSize: `${beatPx * 4}px 100%, ${beatPx}px 100%`,
                    opacity: track.muted ? 0.55 : 1,
                  }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    setSelected(null);
                    seek(timeFromEvent(e));
                  }}
                >
                  {track.clips.length === 0 ? (
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-xs text-muted-foreground/70">
                      {t("emptyLane")}
                    </span>
                  ) : null}
                  {track.clips.map((clip) => (
                    <ClipView
                      key={clip.id}
                      clip={clip}
                      color={track.color}
                      pps={pps}
                      peaks={sources[clip.bufferId]?.peaks}
                      selected={selected?.clipId === clip.id}
                      onPointerDown={(e, kind) => beginClipDrag(e, kind, track.id, clip)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {loop.on && loop.end > loop.start ? (
            <div
              className="pointer-events-none absolute bottom-0 bg-primary/5 ring-1 ring-primary/30"
              style={{ top: RULER_H, left: HEADER_W + loop.start * pps, width: (loop.end - loop.start) * pps }}
            />
          ) : null}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-white"
            style={{ left: HEADER_W }}
          >
            <span className="absolute -top-0 -left-1.5 size-3 rotate-45 bg-white" />
          </div>
        </div>
        {project.tracks.length === 0 || end === 0 ? (
          <div className="sticky left-0 border-t border-dashed border-white/10 p-5 text-center text-sm text-muted-foreground">
            {t("dropHint")}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Inspector */}
        <section className="rounded-3xl border border-white/10 bg-[#141414] p-5">
          <h2 className="text-sm font-semibold">
            {t("inspector")}
            {selectedClip ? <span className="ml-2 font-normal text-muted-foreground">{selectedClip.clip.name}</span> : null}
          </h2>
          {selectedClip ? (
            <ClipInspector
              clip={selectedClip.clip}
              sourceDuration={sources[selectedClip.clip.bufferId]?.duration ?? selectedClip.clip.end}
              labels={{
                position: t("position"),
                trimIn: t("trimIn"),
                length: t("length"),
                clipGain: t("clipGain"),
                fadeIn: t("fadeIn"),
                fadeOut: t("fadeOut"),
              }}
              onChange={(patch) => change((p) => updateClip(p, selectedClip.track.id, selectedClip.clip.id, patch))}
            />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t("noSelection")}</p>
          )}
          <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-muted-foreground">{t("shortcuts")}</p>
        </section>

        {/* Send */}
        <section className="rounded-3xl border border-white/10 bg-[#141414] p-5">
          <h2 className="text-sm font-semibold">{t("sendTitle")}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("sendHint")}</p>
          {!currentUser ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("signInToSend")}</p>
          ) : (
            <div className="mt-3 space-y-3">
              {/* Scalable Musician Selector Trigger (opens Following + Search Modal) */}
              {selectedRecipient ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-black/70 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      src={selectedRecipient.avatarUrl}
                      name={pick(locale, selectedRecipient.nameBn, selectedRecipient.name)}
                      className="size-10 shrink-0"
                      textClassName="text-sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {pick(locale, selectedRecipient.nameBn, selectedRecipient.name)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {home(`roles.${selectedRecipient.roles[0] as Role}`)} ·{" "}
                        {pick(locale, selectedRecipient.cityBn, selectedRecipient.city)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-foreground hover:border-primary"
                    >
                      {locale === "bn" ? "পরিবর্তন" : "Change"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSendTo("")}
                      className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      aria-label="Clear recipient"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-white/15 bg-black px-4 text-sm font-medium text-foreground transition-colors hover:border-primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Users className="size-4 text-primary" />
                    <span>{t("choose")}</span>
                  </span>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-muted-foreground">
                    {locale === "bn"
                      ? `অনুসরণ করা (${followingMusicians.length}) · খুঁজুন`
                      : `Following (${followingMusicians.length}) · Search`}
                  </span>
                </button>
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                rows={3}
                aria-label={t("note")}
                className="w-full rounded-2xl border border-white/10 bg-black px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <Button
                type="button"
                size="sm"
                className="w-full rounded-full"
                disabled={!sendTo || sendState === "sending"}
                onClick={() => void sendMix()}
              >
                {sendState === "sending" ? t("sending") : t("sendMix")}
              </Button>
              {sendState === "sent" ? <p className="text-xs text-emerald-400">{t("sent")}</p> : null}
              {sendState === "error" ? <p className="text-xs text-destructive">{t("sendError")}</p> : null}
            </div>
          )}
        </section>
      </div>

      {/* Choose Musician Modal (Following List + Optional Profile Search) */}
      {pickerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("choose")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-[#161718] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="font-display text-base font-bold text-foreground">
                  {t("choose")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {locale === "bn"
                    ? "তোমার অনুসরণ করা শিল্পীদের তালিকা থেকে বেছে নাও অথবা যেকোনো প্রোফাইল সার্চ করো"
                    : "Pick from musicians you follow or search for any profile"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Optional Search Input */}
            <div className="border-b border-white/10 p-4">
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black px-3.5 py-2">
                <Search className="size-4 shrink-0 text-primary" />
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={
                    locale === "bn"
                      ? "নাম, যন্ত্র, শহর বা ঘরানা লিখে প্রোফাইল খুঁজো (ঐচ্ছিক)…"
                      : "Search profile by name, instrument, city, or genre (optional)…"
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                />
                {pickerQuery ? (
                  <button
                    type="button"
                    onClick={() => setPickerQuery("")}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto p-4">
              {pickerQuery.trim() ? (
                /* Search Results View */
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {pickerSearching
                      ? locale === "bn"
                        ? "খোঁজা হচ্ছে…"
                        : "Searching…"
                      : locale === "bn"
                        ? `সার্চ ফলাফল (${pickerSearchHits?.length ?? 0})`
                        : `Search Results (${pickerSearchHits?.length ?? 0})`}
                  </p>
                  {!pickerSearching && (pickerSearchHits?.length ?? 0) === 0 ? (
                    <p className="rounded-2xl border border-white/10 bg-black/40 p-4 text-center text-xs text-muted-foreground">
                      {locale === "bn"
                        ? "কোনো শিল্পী পাওয়া যায়নি।"
                        : "No matching musician profiles found."}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(pickerSearchHits ?? []).map((u) => {
                        const isFollowed = myFollowIds.includes(u.id);
                        const isSelected = sendTo === u.id;
                        const uName = pick(locale, u.nameBn, u.name);
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSendTo(u.id);
                                setPickerOpen(false);
                              }}
                              className={
                                isSelected
                                  ? "flex w-full items-center justify-between gap-3 rounded-2xl border border-primary bg-primary/10 p-3 text-left"
                                  : "flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/50 p-3 text-left hover:border-white/25 hover:bg-white/5"
                              }
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <UserAvatar
                                  src={u.avatarUrl}
                                  name={uName}
                                  className="size-10 shrink-0"
                                  textClassName="text-sm"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-foreground">
                                      {uName}
                                    </span>
                                    {isFollowed ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                        <UserCheck className="size-3" />
                                        {locale === "bn" ? "অনুসরণ করছ" : "Following"}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {home(`roles.${u.roles[0] as Role}`)} ·{" "}
                                    {pick(locale, u.cityBn, u.city)} ·{" "}
                                    {u.instruments.slice(0, 2).join(", ")}
                                  </p>
                                </div>
                              </div>
                              {isSelected ? (
                                <Check className="size-4 shrink-0 text-primary" />
                              ) : (
                                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground">
                                  {locale === "bn" ? "বেছে নাও" : "Select"}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                /* Default View: Following List First */
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 flex items-center justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <span>
                        {locale === "bn"
                          ? `তোমার অনুসরণ করা শিল্পীরা (${followingMusicians.length})`
                          : `Following (${followingMusicians.length})`}
                      </span>
                    </p>
                    {followingMusicians.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-white/15 bg-black/40 p-4 text-xs text-muted-foreground">
                        {locale === "bn"
                          ? "তুমি এখনো কাউকে ফলো করোনি। ওপরে সার্চ বক্সে নাম বা যন্ত্র লিখে যেকোনো শিল্পীকে খুঁজে নাও।"
                          : "You aren't following anyone yet. Use the search box above to find any musician by name, instrument, or city."}
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {followingMusicians.map((u) => {
                          const isSelected = sendTo === u.id;
                          const uName = pick(locale, u.nameBn, u.name);
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSendTo(u.id);
                                  setPickerOpen(false);
                                }}
                                className={
                                  isSelected
                                    ? "flex w-full items-center justify-between gap-3 rounded-2xl border border-primary bg-primary/10 p-3 text-left"
                                    : "flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/50 p-3 text-left hover:border-white/25 hover:bg-white/5"
                                }
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <UserAvatar
                                    src={u.avatarUrl}
                                    name={uName}
                                    className="size-10 shrink-0"
                                    textClassName="text-sm"
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-sm font-semibold text-foreground">
                                        {uName}
                                      </span>
                                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                        <UserCheck className="size-3" />
                                        {locale === "bn" ? "অনুসরণ করছ" : "Following"}
                                      </span>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {home(`roles.${u.roles[0] as Role}`)} ·{" "}
                                      {pick(locale, u.cityBn, u.city)} ·{" "}
                                      {u.instruments.slice(0, 2).join(", ")}
                                    </p>
                                  </div>
                                </div>
                                {isSelected ? (
                                  <Check className="size-4 shrink-0 text-primary" />
                                ) : (
                                  <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-foreground">
                                    {locale === "bn" ? "বেছে নাও" : "Select"}
                                  </span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClipInspector({
  clip,
  sourceDuration,
  labels,
  onChange,
}: {
  clip: Clip;
  sourceDuration: number;
  labels: Record<"position" | "trimIn" | "length" | "clipGain" | "fadeIn" | "fadeOut", string>;
  onChange: (patch: Partial<Clip>) => void;
}) {
  const length = clipLength(clip);
  const num = (label: string, value: number, apply: (v: number) => void, max?: number) => (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        step={0.01}
        min={0}
        max={max}
        value={Number(value.toFixed(3))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) apply(Math.max(0, v));
        }}
        className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black px-3 text-sm text-foreground tabular-nums"
      />
    </label>
  );

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {num(labels.position, clip.offset, (v) => onChange({ offset: v }))}
      {num(labels.trimIn, clip.start, (v) => onChange({ start: Math.min(v, clip.end - 0.05) }), clip.end - 0.05)}
      {num(labels.length, length, (v) => onChange({ end: Math.min(sourceDuration, clip.start + Math.max(0.05, v)) }), sourceDuration - clip.start)}
      <label className="text-xs text-muted-foreground">
        {labels.clipGain} ({(20 * Math.log10(Math.max(clip.gain, 0.0001))).toFixed(1)} dB)
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={clip.gain}
          onChange={(e) => onChange({ gain: Number(e.target.value) })}
          className="mt-3 w-full accent-primary"
        />
      </label>
      {num(labels.fadeIn, clip.fadeIn, (v) => onChange({ fadeIn: Math.min(v, length - clip.fadeOut) }))}
      {num(labels.fadeOut, clip.fadeOut, (v) => onChange({ fadeOut: Math.min(v, length - clip.fadeIn) }))}
    </div>
  );
}
