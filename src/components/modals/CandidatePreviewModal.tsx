import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Scissors,
  X,
  Type,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyEnd,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Move,
  Clock,
  Play,
  Pause,
  Palette,
  Heart,
  Sparkles,
  Trash2,
  RotateCcw,
  Split,
  Film,
  Loader2,
  Layout,
  Music,
  Sliders,
  Volume2,
  Tv,
  UploadCloud,
  Check,
  XCircle,
  Lock,
  Unlock,
} from "lucide-react";
import { Candidate, Clip, ProjectDetail, CropRect, VideoLayoutOption } from "../../types";
import { formatTime } from "../../utils/format";
import { invoke, listen } from "../../apiBridge";

interface InternalSegment {
  id: string;
  start: number;
  end: number;
  deleted: boolean;
}

// Strips any emojis that the LLM may output
function cleanHook(text: string): string {
  return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

// Helpers matemáticos de paridad y cotas para composición vertical 9:16 y FFmpeg yuv420p
const makeEven = (val: number): number => Math.max(2, Math.floor(val / 2) * 2);
const makeEvenCoord = (val: number): number => Math.max(0, Math.floor(val / 2) * 2);


interface CandidatePreviewModalProps {
  candidate: Candidate | null;
  detail: ProjectDetail | null;
  onClose: () => void;
  trimStart: number;
  setTrimStart: (val: number | ((prev: number) => number)) => void;
  trimEnd: number;
  setTrimEnd: (val: number | ((prev: number) => number)) => void;
  isSavingTrim: boolean;
  onSaveTrim: (startSec?: number, endSec?: number) => Promise<void>;
  onCutCandidate: (candidateId: string, options?: any) => Promise<void>;
  clipByCandidate: Map<string, Clip>;
  busy: string;
  onToggleDismissed?: (candidateId: string, dismissed: boolean) => Promise<void>;
}

export function CandidatePreviewModal({
  candidate,
  detail,
  onClose,
  trimStart,
  setTrimStart,
  trimEnd,
  setTrimEnd,
  isSavingTrim,
  onSaveTrim,
  onCutCandidate,
  clipByCandidate,
  busy,
  onToggleDismissed,
}: CandidatePreviewModalProps) {
  if (!candidate || !detail) return null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentPlayTime, setCurrentPlayTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"trim" | "subs" | "cta" | "format" | "export">("trim");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const exportedClip = clipByCandidate.get(candidate.id);
  const exportedPath = exportedClip?.status === "done" && exportedClip.outputPath ? exportedClip.outputPath : null;
  const isExported = Boolean(exportedPath);

  // V3.0 Layout Vertical & Gaming Split
  const [videoLayout, setVideoLayout] = useState<VideoLayoutOption>(() => {
    return (localStorage.getItem("autoshorts_video_layout") as VideoLayoutOption) || "crop";
  });

  const defaultCameraCrop: CropRect = { x: 1280, y: 0, width: 640, height: 360 };
  const defaultGameplayCrop: CropRect = { x: 0, y: 0, width: 1920, height: 1080 };

  const [cameraCrop, setCameraCrop] = useState<CropRect>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.cameraCrop) return parsed.cameraCrop;
      }
    } catch {}
    return defaultCameraCrop;
  });

  const [gameplayCrop, setGameplayCrop] = useState<CropRect>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gameplayCrop) return parsed.gameplayCrop;
      }
    } catch {}
    return defaultGameplayCrop;
  });

  const [camOutWidth, setCamOutWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.camOutWidth) return parsed.camOutWidth;
        if (parsed.cameraCrop?.outWidth) return parsed.cameraCrop.outWidth;
      }
    } catch {}
    return 1080;
  });

  const [camOutHeight, setCamOutHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.camOutHeight) return parsed.camOutHeight;
        if (parsed.cameraCrop?.outHeight) return parsed.cameraCrop.outHeight;
      }
    } catch {}
    return 340;
  });

  const [camOutX, setCamOutX] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.camOutX === "number") return parsed.camOutX;
        if (typeof parsed.cameraCrop?.outX === "number") return parsed.cameraCrop.outX;
      }
    } catch {}
    return 0;
  });

  const [camOutY, setCamOutY] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.camOutY === "number") return parsed.camOutY;
        if (typeof parsed.cameraCrop?.outY === "number") return parsed.cameraCrop.outY;
      }
    } catch {}
    return 0;
  });

  const [gameOutWidth, setGameOutWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gameOutWidth) return parsed.gameOutWidth;
        if (parsed.gameplayCrop?.outWidth) return parsed.gameplayCrop.outWidth;
      }
    } catch {}
    return 1080;
  });

  const [gameOutHeight, setGameOutHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.gameOutHeight) return parsed.gameOutHeight;
        if (parsed.gameplayCrop?.outHeight) return parsed.gameplayCrop.outHeight;
      }
    } catch {}
    return 720;
  });

  const [gameOutX, setGameOutX] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.gameOutX === "number") return parsed.gameOutX;
        if (typeof parsed.gameplayCrop?.outX === "number") return parsed.gameplayCrop.outX;
      }
    } catch {}
    return 0;
  });

  const [gameOutY, setGameOutY] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`autoshorts_crop_${detail.project.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.gameOutY === "number") return parsed.gameOutY;
        if (typeof parsed.gameplayCrop?.outY === "number") return parsed.gameplayCrop.outY;
      }
    } catch {}
    return 360;
  });

  const [isPlayingBgmPreview, setIsPlayingBgmPreview] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem(
      `autoshorts_crop_${detail.project.id}`,
      JSON.stringify({
        cameraCrop: { ...cameraCrop, outWidth: camOutWidth, outHeight: camOutHeight, outX: camOutX, outY: camOutY },
        gameplayCrop: { ...gameplayCrop, outWidth: gameOutWidth, outHeight: gameOutHeight, outX: gameOutX, outY: gameOutY },
        camOutWidth,
        camOutHeight,
        camOutX,
        camOutY,
        gameOutWidth,
        gameOutHeight,
        gameOutX,
        gameOutY,
      })
    );
  }, [detail.project.id, cameraCrop, gameplayCrop, camOutWidth, camOutHeight, camOutX, camOutY, gameOutWidth, gameOutHeight, gameOutX, gameOutY]);

  useEffect(() => {
    localStorage.setItem("autoshorts_video_layout", videoLayout);
  }, [videoLayout]);

  // V3.0 Música de Fondo Drag & Drop
  const [bgmPath, setBgmPath] = useState<string | null>(() => {
    return localStorage.getItem(`autoshorts_bgm_path_${detail.project.id}`) || null;
  });
  const [bgmFileName, setBgmFileName] = useState<string>(() => {
    return localStorage.getItem(`autoshorts_bgm_filename_${detail.project.id}`) || "";
  });
  const [bgmBlobUrl, setBgmBlobUrl] = useState<string | null>(null);
  const [bgmVolume, setBgmVolume] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_bgm_volume");
    return saved !== null ? Number(saved) : 15;
  });

  useEffect(() => {
    if (bgmPath) {
      localStorage.setItem(`autoshorts_bgm_path_${detail.project.id}`, bgmPath);
      localStorage.setItem(`autoshorts_bgm_filename_${detail.project.id}`, bgmFileName);
    } else {
      localStorage.removeItem(`autoshorts_bgm_path_${detail.project.id}`);
      localStorage.removeItem(`autoshorts_bgm_filename_${detail.project.id}`);
    }
  }, [detail.project.id, bgmPath, bgmFileName]);

  useEffect(() => {
    localStorage.setItem("autoshorts_bgm_volume", String(bgmVolume));
  }, [bgmVolume]);

  // V3.0 Inicio de Música (Timeline Offset)
  const [bgmStartSec, setBgmStartSec] = useState<number>(() => {
    const saved = localStorage.getItem(`autoshorts_bgm_start_${detail.project.id}`);
    return saved !== null ? Number(saved) : 0;
  });

  useEffect(() => {
    localStorage.setItem(`autoshorts_bgm_start_${detail.project.id}`, String(bgmStartSec));
  }, [detail.project.id, bgmStartSec]);

  // V3.0 Elementos Multimedia de Fondo y Telemetría
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);
  const gameVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const phoneStageRef = useRef<HTMLDivElement | null>(null);
  const stageDragSessionRef = useRef<{
    target: "camera" | "gameplay";
    mode: "move" | "resize_br";
    startX: number;
    startY: number;
    initialWidth: number;
    initialHeight: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const isCancellingRef = useRef<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [activeCropTarget, setActiveCropTarget] = useState<"camera" | "gameplay">("camera");

  const syncBgm = useCallback((action: "play" | "pause" | "seek") => {
    if (!bgmAudioRef.current || (!bgmPath && !bgmBlobUrl) || isExported) return;
    const v = videoRef.current;
    if (!v) return;

    const offset = Math.max(0, v.currentTime - trimStart);
    const targetTime = bgmStartSec + offset;

    if (action === "pause") {
      bgmAudioRef.current.pause();
      setIsPlayingBgmPreview(false);
    } else if (action === "play") {
      if (bgmAudioRef.current.readyState >= 1) {
        bgmAudioRef.current.currentTime = targetTime;
      }
      bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
      bgmAudioRef.current.play().then(() => setIsPlayingBgmPreview(true)).catch(() => {});
    } else if (action === "seek") {
      if (bgmAudioRef.current.readyState >= 1) {
        bgmAudioRef.current.currentTime = targetTime;
      }
    }
  }, [bgmPath, bgmBlobUrl, isExported, trimStart, bgmStartSec, bgmVolume]);

  const syncBgVideo = useCallback((action: "play" | "pause" | "seek") => {
    if (isExported) return;
    const v = videoRef.current;
    if (!v) return;

    const syncTarget = (el: HTMLVideoElement | null) => {
      if (!el || el.readyState < 1) return;
      if (action === "pause") {
        el.pause();
      } else if (action === "play") {
        if (Math.abs(el.currentTime - v.currentTime) > 0.08) {
          el.currentTime = v.currentTime;
        }
        el.play().catch(() => {});
      } else if (action === "seek") {
        el.currentTime = v.currentTime;
      }
    };

    syncTarget(bgVideoRef.current);
    syncTarget(camVideoRef.current);
    syncTarget(gameVideoRef.current);
  }, [isExported]);

  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
    }
  }, [bgmVolume]);

  useEffect(() => {
    let unlistenProgress: (() => void) | null = null;
    void listen<{ candidateId: string; percent: number; stage: string }>("render-progress", (event) => {
      if (event.payload && event.payload.candidateId === candidate.id) {
        setRenderProgress({ percent: event.payload.percent, stage: event.payload.stage });
      }
    }).then((unsub) => {
      unlistenProgress = unsub;
    });

    const handleBeforeUnload = () => {
      if (isExporting) {
        void invoke("cancel_render");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (unlistenProgress) unlistenProgress();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      bgmAudioRef.current?.pause();
      if (bgVideoRef.current) bgVideoRef.current.pause();
    };
  }, [candidate.id, isExporting]);

  // V3.0 Canvas Interactivo de Recorte Gaming con Mouse
  const cropCanvasRef = useRef<HTMLDivElement | null>(null);
  const mappingVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragSessionRef = useRef<{
    target: "camera" | "gameplay";
    mode: "move" | "resize_br";
    startX: number;
    startY: number;
    initialCrop: CropRect;
  } | null>(null);

  const handleBoxPointerDown = (
    e: React.PointerEvent,
    target: "camera" | "gameplay",
    mode: "move" | "resize_br"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveCropTarget(target);
    const initialCrop = target === "camera" ? { ...cameraCrop } : { ...gameplayCrop };
    dragSessionRef.current = {
      target,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (!cropCanvasRef.current) return;
    const rect = cropCanvasRef.current.getBoundingClientRect();
    const clickRelX = (e.clientX - rect.left) / rect.width;
    const clickRelY = (e.clientY - rect.top) / rect.height;

    const nativeClickX = clickRelX * 1920;
    const nativeClickY = clickRelY * 1080;

    if (activeCropTarget === "camera") {
      const newX = Math.round(Math.max(0, Math.min(1920 - cameraCrop.width, nativeClickX - cameraCrop.width / 2)) / 2) * 2;
      const newY = Math.round(Math.max(0, Math.min(1080 - cameraCrop.height, nativeClickY - cameraCrop.height / 2)) / 2) * 2;
      setCameraCrop({ ...cameraCrop, x: newX, y: newY });
    } else {
      const newX = Math.round(Math.max(0, Math.min(1920 - gameplayCrop.width, nativeClickX - gameplayCrop.width / 2)) / 2) * 2;
      const newY = Math.round(Math.max(0, Math.min(1080 - gameplayCrop.height, nativeClickY - gameplayCrop.height / 2)) / 2) * 2;
      setGameplayCrop({ ...gameplayCrop, x: newX, y: newY });
    }
  };

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!dragSessionRef.current || !cropCanvasRef.current) return;
      const { target, mode, startX, startY, initialCrop } = dragSessionRef.current;
      const rect = cropCanvasRef.current.getBoundingClientRect();
      const scaleX = 1920 / rect.width;
      const scaleY = 1080 / rect.height;

      const deltaX = (e.clientX - startX) * scaleX;
      const deltaY = (e.clientY - startY) * scaleY;

      if (mode === "move") {
        const rawX = Math.max(0, Math.min(1920 - initialCrop.width, initialCrop.x + deltaX));
        const rawY = Math.max(0, Math.min(1080 - initialCrop.height, initialCrop.y + deltaY));
        const newX = Math.round(rawX / 2) * 2;
        const newY = Math.round(rawY / 2) * 2;
        if (target === "camera") {
          setCameraCrop((prev) => ({ ...prev, x: newX, y: newY }));
        } else {
          setGameplayCrop((prev) => ({ ...prev, x: newX, y: newY }));
        }
      } else if (mode === "resize_br") {
        const rawW = Math.max(120, Math.min(1920 - initialCrop.x, initialCrop.width + deltaX));
        const rawH = Math.max(80, Math.min(1080 - initialCrop.y, initialCrop.height + deltaY));
        const newW = Math.round(rawW / 2) * 2;
        const newH = Math.round(rawH / 2) * 2;
        if (target === "camera") {
          setCameraCrop((prev) => ({ ...prev, width: newW, height: newH }));
        } else {
          setGameplayCrop((prev) => ({ ...prev, width: newW, height: newH }));
        }
      }
    };

    const handleGlobalPointerUp = () => {
      dragSessionRef.current = null;
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, []);

  // V3.0 Interacción Directa con Mouse en el Phone Stage 9:16 (Facecam & Gameplay 2D)
  const handleStagePointerDown = (
    e: React.PointerEvent,
    target: "camera" | "gameplay",
    mode: "move" | "resize_br"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveCropTarget(target);
    stageDragSessionRef.current = {
      target,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: target === "camera" ? camOutWidth : gameOutWidth,
      initialHeight: target === "camera" ? camOutHeight : gameOutHeight,
      initialX: target === "camera" ? camOutX : gameOutX,
      initialY: target === "camera" ? camOutY : gameOutY,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const initialSeekDoneRef = useRef<boolean>(false);
  const [lockOutputAspectRatio, setLockOutputAspectRatio] = useState<boolean>(() => {
    const saved = localStorage.getItem("autoshorts_lock_out_ar");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("autoshorts_lock_out_ar", lockOutputAspectRatio ? "true" : "false");
  }, [lockOutputAspectRatio]);

  useEffect(() => {
    initialSeekDoneRef.current = false;
  }, [candidate.id, exportedPath]);

  useEffect(() => {
    const handleStageGlobalPointerMove = (e: PointerEvent) => {
      const session = stageDragSessionRef.current;
      if (!session || !phoneStageRef.current) return;
      const rect = phoneStageRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scaleX = 1080.0 / rect.width;
      const scaleY = 1920.0 / rect.height;
      const deltaX = (e.clientX - session.startX) * scaleX;
      const deltaY = (e.clientY - session.startY) * scaleY;

      if (session.mode === "move") {
        const newX = Math.max(0, Math.min(1080 - session.initialWidth, session.initialX + deltaX));
        const newY = Math.max(0, Math.min(1920 - session.initialHeight, session.initialY + deltaY));
        if (session.target === "camera") {
          setCamOutX(makeEvenCoord(newX));
          setCamOutY(makeEvenCoord(newY));
        } else {
          setGameOutX(makeEvenCoord(newX));
          setGameOutY(makeEvenCoord(newY));
        }
      } else if (session.mode === "resize_br") {
        const minW = session.target === "camera" ? 180 : 360;
        const minH = session.target === "camera" ? 180 : 360;
        const effMaxW = makeEvenCoord(Math.max(0, 1080 - session.initialX));
        const effMaxH = makeEvenCoord(Math.max(0, 1920 - session.initialY));
        const keepAspect = (lockOutputAspectRatio && !e.shiftKey) || (!lockOutputAspectRatio && e.shiftKey);

        let newW: number;
        let newH: number;

        if (!keepAspect) {
          newW = makeEven(Math.min(effMaxW, Math.max(Math.min(minW, effMaxW), session.initialWidth + deltaX)));
          newH = makeEven(Math.min(effMaxH, Math.max(Math.min(minH, effMaxH), session.initialHeight + deltaY)));
        } else {
          const crop = session.target === "camera" ? cameraCrop : gameplayCrop;
          const targetRatio = crop.height > 0 ? crop.width / crop.height : session.initialWidth / Math.max(1, session.initialHeight);
          const ratioMinW = Math.max(minW, minH * targetRatio);
          const ratioMaxW = Math.min(effMaxW, effMaxH * targetRatio);
          const candidateW =
            Math.abs(deltaX) >= Math.abs(deltaY)
              ? session.initialWidth + deltaX
              : (session.initialHeight + deltaY) * targetRatio;
          const clampedW =
            ratioMinW <= ratioMaxW
              ? Math.max(ratioMinW, Math.min(ratioMaxW, candidateW))
              : Math.max(2, Math.min(effMaxW, effMaxH * targetRatio));
          newW = Math.min(effMaxW, Math.max(2, makeEven(clampedW)));
          newH = Math.min(effMaxH, Math.max(2, makeEven(newW / targetRatio)));
        }

        if (session.target === "camera") {
          setCamOutWidth(newW);
          setCamOutHeight(newH);
        } else {
          setGameOutWidth(newW);
          setGameOutHeight(newH);
        }
      }
    };

    const handleStageGlobalPointerUp = () => {
      stageDragSessionRef.current = null;
    };

    window.addEventListener("pointermove", handleStageGlobalPointerMove);
    window.addEventListener("pointerup", handleStageGlobalPointerUp);
    return () => {
      window.removeEventListener("pointermove", handleStageGlobalPointerMove);
      window.removeEventListener("pointerup", handleStageGlobalPointerUp);
    };
  }, [camOutWidth, camOutHeight, camOutX, camOutY, gameOutWidth, gameOutHeight, gameOutX, gameOutY, lockOutputAspectRatio, cameraCrop, gameplayCrop]);

  useEffect(() => {
    if (activeTab === "format" && videoLayout === "gaming_split" && mappingVideoRef.current && videoRef.current) {
      if (Math.abs(mappingVideoRef.current.currentTime - videoRef.current.currentTime) > 0.25) {
        mappingVideoRef.current.currentTime = videoRef.current.currentTime;
      }
    }
  }, [currentPlayTime, activeTab, videoLayout]);

  // V3.0 Control Avanzado de Exportación (Bitrate, 2-Pass, FPS)
  const origBitrateMbps = detail.project.bitRateMbps || (detail.project.bitRate ? Number((detail.project.bitRate / 1e6).toFixed(2)) : null);

  const [bitrateMode, setBitrateMode] = useState<"recommended" | "original" | "custom">(() => {
    return (localStorage.getItem("autoshorts_bitrate_mode") as any) || "recommended";
  });
  const [customBitrateMbps, setCustomBitrateMbps] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_custom_bitrate_mbps");
    return saved !== null ? Number(saved) : 10;
  });
  const [twoPass, setTwoPass] = useState<boolean>(() => {
    return localStorage.getItem("autoshorts_two_pass") === "true";
  });
  const [vbrMinMbps, setVbrMinMbps] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_vbr_min_mbps");
    return saved !== null ? Number(saved) : 6;
  });
  const [vbrMaxMbps, setVbrMaxMbps] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_vbr_max_mbps");
    return saved !== null ? Number(saved) : 14;
  });

  useEffect(() => {
    localStorage.setItem("autoshorts_bitrate_mode", bitrateMode);
  }, [bitrateMode]);

  useEffect(() => {
    localStorage.setItem("autoshorts_custom_bitrate_mbps", String(customBitrateMbps));
  }, [customBitrateMbps]);

  useEffect(() => {
    localStorage.setItem("autoshorts_two_pass", twoPass ? "true" : "false");
  }, [twoPass]);

  useEffect(() => {
    localStorage.setItem("autoshorts_vbr_min_mbps", String(vbrMinMbps));
  }, [vbrMinMbps]);

  useEffect(() => {
    localStorage.setItem("autoshorts_vbr_max_mbps", String(vbrMaxMbps));
  }, [vbrMaxMbps]);

  const handleSelectAudioFile = async () => {
    try {
      const selected = await invoke<string | null>("open_file_dialog", {
        fileTypes: [
          "Archivos de Audio (*.mp3;*.wav;*.aac;*.m4a)",
          "MP3 Audio (*.mp3)",
          "WAV Audio (*.wav)",
          "Todos los Archivos (*.*)"
        ]
      });
      if (selected) {
        setBgmPath(selected);
        const name = selected.split(/[\\/]/).pop() || "musica.mp3";
        setBgmFileName(name);
      }
    } catch (err) {
      console.warn("Error seleccionando archivo de audio:", err);
    }
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const blobUrl = URL.createObjectURL(file);
      setBgmBlobUrl(blobUrl);
      setBgmFileName(file.name);

      // Si el entorno ya expone la ruta nativa (modo no sandboxed)
      const nativePath = (file as any).path;
      if (nativePath) {
        setBgmPath(nativePath);
      }

      // Persistir el archivo mediante RPC backend a disco para que FFmpeg tenga la ruta absoluta
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await invoke<{ success: boolean; path: string; fileName: string }>("save_project_bgm", {
            projectId: (detail.project as any)?.id,
            fileName: file.name,
            dataBase64: base64Data
          });
          if (res && res.success && res.path) {
            setBgmPath(res.path);
          }
        } catch (err) {
          console.warn("Error guardando BGM en disco:", err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const [burnSubtitles, setBurnSubtitles] = useState<boolean>(() => {
    const saved = localStorage.getItem("autoshorts_burn_subtitles");
    return saved !== null ? saved === "true" : true;
  });

  const [captionStyle, setCaptionStyle] = useState<string>(() => {
    return localStorage.getItem("autoshorts_caption_style") || "tiktok-karaoke";
  });

  const [captionPosition, setCaptionPosition] = useState<"bottom" | "center" | "top">(() => {
    return (localStorage.getItem("autoshorts_caption_position") as "bottom" | "center" | "top") || "bottom";
  });

  const [captionColor, setCaptionColor] = useState<string>(() => {
    return localStorage.getItem("autoshorts_caption_color") || "#ffffff";
  });

  const [captionHighlight, setCaptionHighlight] = useState<string>(() => {
    return localStorage.getItem("autoshorts_caption_highlight") || "#facc15";
  });

  const [captionLines, setCaptionLines] = useState<"1" | "2">(() => {
    return (localStorage.getItem("autoshorts_caption_lines") as "1" | "2") || "1";
  });

  const [ctaEnabled, setCtaEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("autoshorts_cta_enabled");
    return saved !== null ? saved === "true" : false;
  });

  const [ctaText, setCtaText] = useState<string>(() => {
    return localStorage.getItem("autoshorts_cta_text") || "¡Sígueme y dale like!";
  });

  const [ctaPosition, setCtaPosition] = useState<"top" | "center" | "bottom">(() => {
    return (localStorage.getItem("autoshorts_cta_position") as "top" | "center" | "bottom") || "top";
  });

  const [ctaAnimation, setCtaAnimation] = useState<string>(() => {
    return localStorage.getItem("autoshorts_cta_animation") || "bounce-land";
  });

  const [exportAspectRatio, setExportAspectRatio] = useState<"original" | "16:9" | "9:16">(() => {
    return (localStorage.getItem("autoshorts_clip_aspect_ratio") as any) || "original";
  });

  const isSourceVertical = (detail.project.sourceHeight || 0) > (detail.project.sourceWidth || 0);
  const isEffectiveVertical = exportAspectRatio === "9:16" || (exportAspectRatio === "original" && isSourceVertical);
  const canvasWidth = isEffectiveVertical ? 1080 : 1920;
  const canvasHeight = isEffectiveVertical ? 1920 : 1080;

  // Presets adaptativos según lienzo activo (1920x1080 horizontal vs 1080x1920 vertical)
  const presetTopY = isEffectiveVertical ? 280 : 100;
  const presetCenterY = isEffectiveVertical ? 960 : 540;
  const presetBottomY = isEffectiveVertical ? 1680 : 920;
  const presetStreamerY = isEffectiveVertical ? 1420 : 780;
  const presetCenterX = isEffectiveVertical ? 540 : 960;

  const presetCtaTopY = isEffectiveVertical ? 240 : 90;
  const presetCtaCenterY = isEffectiveVertical ? 960 : 540;
  const presetCtaBottomY = isEffectiveVertical ? 1550 : 920;
  const presetCtaCenterX = isEffectiveVertical ? 540 : 960;

  // Coordenadas absolutas exactas (Lienzo 1080x1920 vertical o 1920x1080 horizontal estilo NLE)
  const [captionX, setCaptionX] = useState<number>(() => {
    const isVert = exportAspectRatio === "9:16" || (exportAspectRatio === "original" && (detail.project.sourceHeight || 0) > (detail.project.sourceWidth || 0));
    const suffix = isVert ? "_v" : "_h";
    const saved = localStorage.getItem(`autoshorts_caption_x${suffix}`);
    if (saved !== null) {
      const val = Number(saved);
      return isVert ? Math.min(1080, Math.max(10, val)) : (val === 540 ? 960 : Math.min(1920, Math.max(10, val)));
    }
    const savedGen = localStorage.getItem("autoshorts_caption_x");
    if (savedGen !== null) {
      const val = Number(savedGen);
      return isVert ? Math.min(1080, Math.max(10, val)) : (val === 540 ? 960 : Math.min(1920, Math.max(10, val)));
    }
    return isVert ? 540 : 960;
  });

  const [captionY, setCaptionY] = useState<number>(() => {
    const isVert = exportAspectRatio === "9:16" || (exportAspectRatio === "original" && (detail.project.sourceHeight || 0) > (detail.project.sourceWidth || 0));
    const suffix = isVert ? "_v" : "_h";
    const saved = localStorage.getItem(`autoshorts_caption_y${suffix}`);
    if (saved !== null) {
      const val = Number(saved);
      if (!isVert && val > 1080) return 920;
      return isVert ? Math.min(1920, Math.max(20, val)) : Math.min(1080, Math.max(20, val));
    }
    const savedGen = localStorage.getItem("autoshorts_caption_y");
    if (savedGen !== null) {
      const val = Number(savedGen);
      if (!isVert && val > 1080) return 920;
      return isVert ? Math.min(1920, Math.max(20, val)) : Math.min(1080, Math.max(20, val));
    }
    return isVert ? 1680 : 920;
  });

  const [captionFontSize, setCaptionFontSize] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_caption_font_size");
    return saved !== null ? Number(saved) : 62;
  });
  const [captionAlignH, setCaptionAlignH] = useState<"left" | "center" | "right">(() => {
    return (localStorage.getItem("autoshorts_caption_align_h") as "left" | "center" | "right") || "center";
  });

  const [ctaX, setCtaX] = useState<number>(() => {
    const isVert = exportAspectRatio === "9:16" || (exportAspectRatio === "original" && (detail.project.sourceHeight || 0) > (detail.project.sourceWidth || 0));
    const suffix = isVert ? "_v" : "_h";
    const saved = localStorage.getItem(`autoshorts_cta_x${suffix}`);
    if (saved !== null) {
      const val = Number(saved);
      return isVert ? Math.min(1080, Math.max(10, val)) : (val === 540 ? 960 : Math.min(1920, Math.max(10, val)));
    }
    const savedGen = localStorage.getItem("autoshorts_cta_x");
    if (savedGen !== null) {
      const val = Number(savedGen);
      return isVert ? Math.min(1080, Math.max(10, val)) : (val === 540 ? 960 : Math.min(1920, Math.max(10, val)));
    }
    return isVert ? 540 : 960;
  });

  const [ctaY, setCtaY] = useState<number>(() => {
    const isVert = exportAspectRatio === "9:16" || (exportAspectRatio === "original" && (detail.project.sourceHeight || 0) > (detail.project.sourceWidth || 0));
    const suffix = isVert ? "_v" : "_h";
    const saved = localStorage.getItem(`autoshorts_cta_y${suffix}`);
    if (saved !== null) {
      const val = Number(saved);
      if (!isVert && val > 1080) return 90;
      return isVert ? Math.min(1920, Math.max(10, val)) : Math.min(1080, Math.max(10, val));
    }
    const savedGen = localStorage.getItem("autoshorts_cta_y");
    if (savedGen !== null) {
      const val = Number(savedGen);
      if (!isVert && val > 1080) return 90;
      return isVert ? Math.min(1920, Math.max(10, val)) : Math.min(1080, Math.max(10, val));
    }
    return isVert ? 1550 : 90;
  });

  const [ctaScale, setCtaScale] = useState<number>(() => {
    const saved = localStorage.getItem("autoshorts_cta_scale");
    return saved !== null ? Number(saved) : 100;
  });

  // Conmutador adaptativo y defensivo al cambiar entre modo Horizontal y Vertical
  const prevIsVertRef = React.useRef(isEffectiveVertical);
  useEffect(() => {
    if (prevIsVertRef.current !== isEffectiveVertical) {
      if (!isEffectiveVertical) {
        // Conmutó a Horizontal (1920x1080)
        const savedYH = localStorage.getItem("autoshorts_caption_y_h");
        const parsedYH = savedYH !== null ? Number(savedYH) : null;
        setCaptionY(parsedYH !== null && parsedYH <= 1080 ? parsedYH : (captionY > 1080 ? 920 : captionY));

        const savedXH = localStorage.getItem("autoshorts_caption_x_h");
        const parsedXH = savedXH !== null ? Number(savedXH) : null;
        setCaptionX(parsedXH !== null && parsedXH <= 1920 ? (parsedXH === 540 ? 960 : parsedXH) : (captionX === 540 ? 960 : captionX));

        const savedCtaYH = localStorage.getItem("autoshorts_cta_y_h");
        const parsedCtaYH = savedCtaYH !== null ? Number(savedCtaYH) : null;
        setCtaY(parsedCtaYH !== null && parsedCtaYH <= 1080 ? parsedCtaYH : (ctaY > 1080 ? 90 : ctaY));

        const savedCtaXH = localStorage.getItem("autoshorts_cta_x_h");
        const parsedCtaXH = savedCtaXH !== null ? Number(savedCtaXH) : null;
        setCtaX(parsedCtaXH !== null && parsedCtaXH <= 1920 ? (parsedCtaXH === 540 ? 960 : parsedCtaXH) : (ctaX === 540 ? 960 : ctaX));
      } else {
        // Conmutó a Vertical (1080x1920)
        const savedYV = localStorage.getItem("autoshorts_caption_y_v");
        const parsedYV = savedYV !== null ? Number(savedYV) : null;
        setCaptionY(parsedYV !== null ? parsedYV : Math.min(1920, Math.round((captionY / 1080) * 1920)));

        const savedXV = localStorage.getItem("autoshorts_caption_x_v");
        const parsedXV = savedXV !== null ? Number(savedXV) : null;
        setCaptionX(parsedXV !== null ? parsedXV : (captionX === 960 ? 540 : captionX));

        const savedCtaYV = localStorage.getItem("autoshorts_cta_y_v");
        const parsedCtaYV = savedCtaYV !== null ? Number(savedCtaYV) : null;
        setCtaY(parsedCtaYV !== null ? parsedCtaYV : Math.min(1920, Math.round((ctaY / 1080) * 1920)));

        const savedCtaXV = localStorage.getItem("autoshorts_cta_x_v");
        const parsedCtaXV = savedCtaXV !== null ? Number(savedCtaXV) : null;
        setCtaX(parsedCtaXV !== null ? parsedCtaXV : (ctaX === 960 ? 540 : ctaX));
      }
      prevIsVertRef.current = isEffectiveVertical;
    }
  }, [isEffectiveVertical]);

  useEffect(() => {
    localStorage.setItem("autoshorts_clip_aspect_ratio", exportAspectRatio);
  }, [exportAspectRatio]);

  useEffect(() => {
    const suffix = isEffectiveVertical ? "_v" : "_h";
    const clampedY = isEffectiveVertical ? Math.min(1920, captionY) : Math.min(1080, captionY);
    const clampedX = isEffectiveVertical ? Math.min(1080, captionX) : Math.min(1920, captionX);
    localStorage.setItem(`autoshorts_caption_x${suffix}`, String(clampedX));
    localStorage.setItem(`autoshorts_caption_y${suffix}`, String(clampedY));
    localStorage.setItem("autoshorts_caption_x", String(clampedX));
    localStorage.setItem("autoshorts_caption_y", String(clampedY));
  }, [captionX, captionY, isEffectiveVertical]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_font_size", String(captionFontSize));
  }, [captionFontSize]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_align_h", captionAlignH);
  }, [captionAlignH]);

  useEffect(() => {
    const suffix = isEffectiveVertical ? "_v" : "_h";
    const clampedY = isEffectiveVertical ? Math.min(1920, ctaY) : Math.min(1080, ctaY);
    const clampedX = isEffectiveVertical ? Math.min(1080, ctaX) : Math.min(1920, ctaX);
    localStorage.setItem(`autoshorts_cta_x${suffix}`, String(clampedX));
    localStorage.setItem(`autoshorts_cta_y${suffix}`, String(clampedY));
    localStorage.setItem("autoshorts_cta_x", String(clampedX));
    localStorage.setItem("autoshorts_cta_y", String(clampedY));
  }, [ctaX, ctaY, isEffectiveVertical]);

  useEffect(() => {
    localStorage.setItem("autoshorts_cta_scale", String(ctaScale));
  }, [ctaScale]);

  useEffect(() => {
    localStorage.setItem("autoshorts_burn_subtitles", String(burnSubtitles));
  }, [burnSubtitles]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_style", captionStyle);
  }, [captionStyle]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_position", captionPosition);
  }, [captionPosition]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_color", captionColor);
  }, [captionColor]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_highlight", captionHighlight);
  }, [captionHighlight]);

  useEffect(() => {
    localStorage.setItem("autoshorts_caption_lines", captionLines);
  }, [captionLines]);

  useEffect(() => {
    localStorage.setItem("autoshorts_cta_enabled", String(ctaEnabled));
  }, [ctaEnabled]);

  useEffect(() => {
    localStorage.setItem("autoshorts_cta_text", ctaText);
  }, [ctaText]);

  useEffect(() => {
    localStorage.setItem("autoshorts_cta_position", ctaPosition);
  }, [ctaPosition]);

  useEffect(() => {
    localStorage.setItem("autoshorts_cta_animation", ctaAnimation);
  }, [ctaAnimation]);

  const [segments, setSegments] = useState<InternalSegment[]>(() => {
    try {
      const saved = localStorage.getItem("autoshorts_candidate_segments_" + candidate.id);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [{ id: "seg-1", start: trimStart, end: trimEnd, deleted: false }];
  });
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>("seg-1");
  const [hasTransition, setHasTransition] = useState<boolean>(false);
  const [selectedFps, setSelectedFps] = useState<string>("auto");
  const [exportError, setExportError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("autoshorts_candidate_segments_" + candidate.id);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSegments(parsed);
          setSelectedSegmentId(parsed[0].id);
          return;
        }
      }
    } catch {
      // ignore
    }
    setSegments([{ id: "seg-1", start: trimStart, end: trimEnd, deleted: false }]);
    setSelectedSegmentId("seg-1");
  }, [candidate.id]);

  const handleSplitAtPlayhead = () => {
    const playhead = isExported ? currentPlayTime : trimStart + currentPlayTime;
    setSegments((prev) => {
      const idx = prev.findIndex((s) => playhead > s.start + 0.3 && playhead < s.end - 0.3);
      if (idx === -1) return prev;
      const target = prev[idx];
      const s1: InternalSegment = {
        id: `seg-${Date.now()}-1`,
        start: target.start,
        end: Number(playhead.toFixed(2)),
        deleted: target.deleted,
      };
      const s2: InternalSegment = {
        id: `seg-${Date.now()}-2`,
        start: Number(playhead.toFixed(2)),
        end: target.end,
        deleted: target.deleted,
      };
      const updated = [...prev.slice(0, idx), s1, s2, ...prev.slice(idx + 1)];
      setSelectedSegmentId(s2.id);
      return updated;
    });
  };

  const toggleDeleteSegment = (id: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, deleted: !s.deleted } : s))
    );
  };

  const handleResetSegments = () => {
    setSegments([{ id: "seg-1", start: trimStart, end: trimEnd, deleted: false }]);
    setSelectedSegmentId("seg-1");
  };

  const handleUpdateTrimStart = (delta: number) => {
    const newStart = Math.max(0, Math.min(trimEnd - 1, Number((trimStart + delta).toFixed(1))));
    setTrimStart(newStart);
    setSegments((prev) => {
      if (!prev || prev.length === 0) {
        return [{ id: "seg-1", start: newStart, end: trimEnd, deleted: false }];
      }
      return [{ ...prev[0], start: newStart }, ...prev.slice(1)];
    });
  };

  const handleUpdateTrimEnd = (delta: number) => {
    const newEnd = Math.max(trimStart + 1, Number((trimEnd + delta).toFixed(1)));
    setTrimEnd(newEnd);
    setSegments((prev) => {
      if (!prev || prev.length === 0) {
        return [{ id: "seg-1", start: trimStart, end: newEnd, deleted: false }];
      }
      const last = prev[prev.length - 1];
      return [...prev.slice(0, prev.length - 1), { ...last, end: newEnd }];
    });
  };

  const totalKeptDuration = segments
    .filter((s) => !s.deleted)
    .reduce((acc, s) => acc + (s.end - s.start), 0);
  const totalRemovedDuration = segments
    .filter((s) => s.deleted)
    .reduce((acc, s) => acc + (s.end - s.start), 0);

  const clipDuration = Math.max(0.1, isExported ? (candidate.endSec - candidate.startSec) : (trimEnd - trimStart));

  useEffect(() => {
    if (!videoRef.current || isExported) return;
    const curr = videoRef.current.currentTime;
    if (curr < trimStart || curr > trimEnd) {
      videoRef.current.currentTime = trimStart;
    }
  }, [trimStart, trimEnd, isExported]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    if (isExported) {
      setCurrentPlayTime(time);
    } else {
      // Live Jump Cut preview: if playhead enters a deleted segment, jump to next active segment!
      const activeSegs = segments.filter((s) => !s.deleted);
      const inDeleted = segments.find((s) => s.deleted && time >= s.start && time < s.end);
      if (inDeleted) {
        const nextActive = activeSegs.find((s) => s.start >= inDeleted.end);
        if (nextActive) {
          videoRef.current.currentTime = nextActive.start;
          syncBgm("seek");
          syncBgVideo("seek");
          return;
        } else if (activeSegs.length > 0) {
          videoRef.current.currentTime = activeSegs[0].start;
          syncBgm("seek");
          syncBgVideo("seek");
          return;
        }
      }

      const rel = Math.max(0, Math.min(clipDuration, time - trimStart));
      setCurrentPlayTime(rel);

      // BGM audio drift sync check
      if (bgmAudioRef.current && bgmPath && !isExported && isPlaying) {
        const expected = bgmStartSec + rel;
        if (Math.abs(bgmAudioRef.current.currentTime - expected) > 0.25) {
          bgmAudioRef.current.currentTime = expected;
        }
      }
      // Secondary video layers drift sync check
      if (!isExported && isPlaying) {
        [bgVideoRef.current, camVideoRef.current, gameVideoRef.current].forEach((layer) => {
          if (layer && layer.readyState >= 1 && Math.abs(layer.currentTime - time) > 0.3) {
            layer.currentTime = time;
          }
        });
      }

      if (time >= trimEnd) {
        const firstActive = activeSegs[0];
        videoRef.current.currentTime = firstActive ? firstActive.start : trimStart;
        syncBgm("seek");
        syncBgVideo("seek");
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRelTime = parseFloat(e.target.value);
    setCurrentPlayTime(newRelTime);
    if (videoRef.current) {
      videoRef.current.currentTime = isExported ? newRelTime : trimStart + newRelTime;
      syncBgm("seek");
      syncBgVideo("seek");
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        syncBgm("play");
        syncBgVideo("play");
      }).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      syncBgm("pause");
      syncBgVideo("pause");
    }
  };

  const absoluteCurrentTime = isExported ? currentPlayTime : trimStart + currentPlayTime;

  const renderCtaBadgePreview = () => {
    const isTwitch = ctaText.toLowerCase().includes("twitch");
    const isFire = ctaText.includes("🔥") || ctaText.toLowerCase().includes("fuego");
    const isYoutube = ctaText.includes("🔔") || ctaText.toLowerCase().includes("youtube");

    let borderColor = "rgba(244, 63, 94, 0.85)";
    let shadowColor = "rgba(244, 63, 94, 0.35)";

    if (isTwitch) {
      borderColor = "rgba(145, 70, 255, 0.85)";
      shadowColor = "rgba(145, 70, 255, 0.4)";
    } else if (isFire) {
      borderColor = "rgba(251, 146, 60, 0.85)";
      shadowColor = "rgba(251, 146, 60, 0.4)";
    } else if (isYoutube) {
      borderColor = "rgba(239, 68, 68, 0.85)";
      shadowColor = "rgba(239, 68, 68, 0.4)";
    }

    let animClass = "motionmaxxing-badge";
    if (ctaAnimation === "slide-up") {
      animClass = "cta-anim-slide-up";
    } else if (ctaAnimation === "pulse-glow") {
      animClass = "cta-anim-pulse-glow";
    } else if (ctaAnimation === "fade-smooth") {
      animClass = "cta-anim-fade-smooth";
    }

    return (
      <div
        className={animClass}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          background: "rgba(16, 16, 22, 0.92)",
          border: `1.4px solid ${borderColor}`,
          boxShadow: `0 3px 12px ${shadowColor}, 0 2px 5px rgba(0,0,0,0.8)`,
          padding: "4px 13px",
          borderRadius: "9999px",
          color: "#ffffff",
          fontSize: "0.76rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          zIndex: 2,
        }}
      >
        <span style={{ display: "inline-block" }}>{ctaText}</span>
      </div>
    );
  };

  const renderCaptionPreview = () => {
    switch (captionStyle) {
      case "loud-viral":
        return (
          <div style={{ textAlign: "center", fontFamily: "Impact, 'Arial Black', sans-serif", fontSize: "1.08rem", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
            <span style={{ color: "#ffffff", textShadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 4px 10px rgba(0,0,0,0.9)", marginRight: "6px" }}>
              ESTA
            </span>
            <span
              style={{
                display: "inline-block",
                color: captionHighlight || "#facc15",
                transform: "scale(1.22)",
                transformOrigin: "center bottom",
                textShadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 5px 12px rgba(0,0,0,1)",
                fontWeight: 900,
                marginRight: "6px",
              }}
            >
              JUGADA
            </span>
            <span style={{ color: "#fb923c", fontWeight: 900, textShadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 4px 10px rgba(0,0,0,0.9)" }}>
              ÉPICA!
            </span>
          </div>
        );
      case "arcade-retro":
        return (
          <div style={{ textAlign: "center", fontFamily: "'Trebuchet MS', 'Arial Black', sans-serif", fontSize: "1.02rem", textTransform: "uppercase", letterSpacing: "0.03em", userSelect: "none" }}>
            <span style={{ color: "#ffffff", textShadow: "-2px -2px 0 #ec4899, 2px -2px 0 #ec4899, -2px 2px 0 #ec4899, 2px 2px 0 #ec4899", marginRight: "6px" }}>
              ESTA
            </span>
            <span
              style={{
                display: "inline-block",
                color: "#06b6d4",
                transform: "scale(1.18)",
                transformOrigin: "center bottom",
                textShadow: "-2px -2px 0 #ec4899, 2px -2px 0 #ec4899, -2px 2px 0 #ec4899, 2px 2px 0 #ec4899, 0 0 10px #06b6d4",
                fontWeight: 900,
                marginRight: "6px",
              }}
            >
              JUGADA
            </span>
            <span style={{ color: "#ffffff", textShadow: "-2px -2px 0 #ec4899, 2px -2px 0 #ec4899, -2px 2px 0 #ec4899, 2px 2px 0 #ec4899" }}>
              ÉPICA!
            </span>
          </div>
        );
      case "cyber-terminal":
        return (
          <div style={{ textAlign: "center", fontFamily: "Consolas, 'Courier New', monospace", fontSize: "0.92rem", letterSpacing: "0.02em", color: "#10b981", background: "rgba(10, 20, 15, 0.85)", padding: "4px 12px", borderRadius: "4px", border: "1px solid #10b981", boxShadow: "0 0 10px rgba(16, 185, 129, 0.3)" }}>
            &gt; ESTA <span style={{ color: "#38bdf8", fontWeight: 700 }}>[JUGADA]</span> ÉPICA!
          </div>
        );
      case "clean-editorial":
        return (
          <div style={{ textAlign: "center", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "0.96rem", fontWeight: 600, letterSpacing: "0.01em", userSelect: "none" }}>
            <span style={{ color: "#ffffff", textShadow: "0 2px 6px rgba(0,0,0,0.8)", marginRight: "5px" }}>
              Esta
            </span>
            <span style={{ color: captionHighlight || "#fde047", textShadow: "0 2px 8px rgba(0,0,0,0.9)", fontWeight: 700, marginRight: "5px" }}>
              jugada
            </span>
            <span style={{ color: "#ffffff", textShadow: "0 2px 6px rgba(0,0,0,0.8)" }}>
              épica!
            </span>
          </div>
        );
      case "modern-box":
        return (
          <div style={{ background: "rgba(0, 0, 0, 0.82)", padding: "4px 12px", borderRadius: "6px", color: captionColor, fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "0.88rem", letterSpacing: "0.02em", textTransform: "uppercase", border: "1px solid rgba(255, 255, 255, 0.15)" }}>
            ESTA <span style={{ color: captionHighlight }}>JUGADA</span> ÉPICA!
          </div>
        );
      case "classic-outline":
        return (
          <div style={{ color: captionHighlight, fontFamily: "'Arial Black', Impact, sans-serif", fontWeight: 900, fontSize: "1.02rem", textTransform: "uppercase", letterSpacing: "0.03em", textShadow: "-3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 3px 3px 0 #000, 0 3px 6px #000" }}>
            ESTA JUGADA ÉPICA!
          </div>
        );
      case "minimal-shadow":
        return (
          <div style={{ color: captionColor, fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 600, fontSize: "0.92rem", textShadow: "0 2px 6px rgba(0, 0, 0, 0.9)", letterSpacing: "0.02em" }}>
            Esta jugada épica!
          </div>
        );
      case "tiktok-karaoke":
      default:
        return (
          <div style={{ textAlign: "center", fontFamily: "'Arial Black', Impact, sans-serif", fontSize: "1.02rem", textTransform: "uppercase", letterSpacing: "0.03em", userSelect: "none" }}>
            <span style={{ color: captionColor, textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px rgba(0,0,0,0.8)", marginRight: "6px" }}>
              ESTA
            </span>
            <span
              style={{
                display: "inline-block",
                color: captionHighlight,
                transform: "scale(1.16)",
                transformOrigin: "center bottom",
                textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 8px rgba(0,0,0,0.9)",
                fontWeight: 900,
                marginRight: "6px",
              }}
            >
              JUGADA
            </span>
            <span style={{ color: captionColor, textShadow: "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px rgba(0,0,0,0.8)" }}>
              ÉPICA!
            </span>
          </div>
        );
    }
  };

  return (
    <div className="style-modal-overlay" onClick={onClose}>
      <div className="clip-studio-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header con Hook y Metadatos */}
        <div className="clip-studio-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Clip #{candidate.rank}
              </span>
              <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 700, color: "var(--text-primary)" }}>
                "{cleanHook(candidate.hook)}"
              </h3>
              <span
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                Score IA: {Math.round(candidate.score * 10)}/100
              </span>
            </div>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.76rem",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTime(trimStart)} - {formatTime(trimEnd)} ({clipDuration.toFixed(1)}s de duración)
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={isExporting ? undefined : onClose}
            disabled={isExporting}
            title={isExporting ? "Exportación en curso..." : "Cerrar modal"}
            style={{ opacity: isExporting ? 0.35 : 1, cursor: isExporting ? "not-allowed" : "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Cuerpo Principal Dividido en 2 Columnas de Estudio */}
        <div className="clip-studio-body">
          {/* COLUMNA IZQUIERDA: LIENZO EN VIVO (SMARTPHONE 9:16) & CONTROLES VLC */}
          <div className="clip-studio-preview-col">
            {isExported && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.4rem 0.75rem",
                  background: "var(--color-success-bg)",
                  border: "1px solid var(--color-success-border)",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  color: "var(--color-success-text)",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                <span>Mostrando Clip Exportado (Incrustado)</span>
                <span style={{ fontSize: "0.66rem", opacity: 0.85, fontFamily: "var(--font-mono)" }}>
                  {exportedPath ? exportedPath.split(/[\\/]/).pop() : ""}
                </span>
              </div>
            )}

            {/* Barra de Formato / Aspect Ratio */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", padding: "0 2px" }}>
              <div style={{ display: "flex", gap: "3px", background: "var(--bg-surface)", padding: "2px", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                {[
                  { id: "original", label: "Original", title: "Mantiene la relación nativa original de la fuente" },
                  { id: "16:9", label: "16:9", title: "Formato Horizontal YouTube (1920x1080)" },
                  { id: "9:16", label: "9:16", title: "Formato Vertical Shorts/TikTok (1080x1920 con auto-crop)" },
                ].map((ar) => {
                  const active = exportAspectRatio === ar.id;
                  return (
                    <button
                      key={ar.id}
                      type="button"
                      onClick={() => setExportAspectRatio(ar.id as any)}
                      title={ar.title}
                      style={{
                        padding: "0.22rem 0.55rem",
                        fontSize: "0.72rem",
                        fontWeight: active ? 700 : 500,
                        borderRadius: "4px",
                        border: active ? "1px solid #fafafa" : "1px solid transparent",
                        background: active ? "#fafafa" : "transparent",
                        color: active ? "#09090b" : "var(--text-secondary)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {ar.label}
                    </button>
                  );
                })}
              </div>

              <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                Lienzo: {canvasWidth}x{canvasHeight}
              </span>
            </div>

            {/* Pantalla del Reproductor (Adaptativa Vertical 9:16 u Horizontal 16:9) con Overlays en Vivo */}
            <div
              ref={phoneStageRef}
              className={`clip-phone-stage ${isEffectiveVertical ? "stage-vertical" : "stage-horizontal"}`}
              onClick={togglePlayPause}
              style={{
                cursor: "pointer",
                aspectRatio: isEffectiveVertical ? "9 / 16" : "16 / 9",
                position: "relative",
                userSelect: "none",
              }}
            >
              <video
                ref={videoRef}
                key={`${candidate.id}_${isExported ? 'exported_' + exportedPath : 'source'}`}
                src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(
                  exportedPath || detail.project.sourcePath
                )}`}
                loop={isExported}
                playsInline
                preload="auto"
                onLoadedMetadata={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  const target = isExported ? 0 : trimStart;
                  const startCoordinated = () => {
                    syncBgVideo("seek");
                    syncBgm("seek");
                    v.play()
                      .then(() => {
                        setIsPlaying(true);
                        syncBgm("play");
                        syncBgVideo("play");
                      })
                      .catch(() => setIsPlaying(false));
                  };
                  if (Math.abs(v.currentTime - target) < 0.05) {
                    initialSeekDoneRef.current = true;
                    startCoordinated();
                  } else {
                    v.currentTime = target;
                  }
                }}
                onEnded={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = isExported ? 0 : trimStart;
                    videoRef.current.play().catch(() => {});
                  }
                }}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => { setIsPlaying(true); syncBgm("play"); syncBgVideo("play"); }}
                onPlaying={() => { setIsPlaying(true); syncBgm("play"); syncBgVideo("play"); }}
                onPause={() => { setIsPlaying(false); syncBgm("pause"); syncBgVideo("pause"); }}
                onWaiting={() => { setIsPlaying(false); syncBgm("pause"); syncBgVideo("pause"); }}
                onSeeked={() => {
                  const v = videoRef.current;
                  if (v && !initialSeekDoneRef.current) {
                    initialSeekDoneRef.current = true;
                    syncBgVideo("seek");
                    syncBgm("seek");
                    v.play()
                      .then(() => {
                        setIsPlaying(true);
                        syncBgm("play");
                        syncBgVideo("play");
                      })
                      .catch(() => setIsPlaying(false));
                    return;
                  }
                  syncBgm("seek");
                  syncBgVideo("seek");
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  position: "relative",
                  zIndex: videoLayout === "gaming_split" && isEffectiveVertical && !isExported ? 0 : 1,
                  opacity: videoLayout === "gaming_split" && isEffectiveVertical && !isExported ? 0 : 1,
                }}
              />

              {/* Fondo Cinemático Real con el Mismo Video Difuminado (9:16) */}
              {(videoLayout === "blur" || videoLayout === "gaming_split") && isEffectiveVertical && !isExported && (
                <video
                  ref={bgVideoRef}
                  key={`${candidate.id}_bg_blur`}
                  src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(
                    detail.project.sourcePath
                  )}`}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    const master = videoRef.current;
                    const t = master ? master.currentTime : trimStart;
                    if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t;
                    if (master && !master.paused) el.play().catch(() => {});
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "blur(22px) brightness(0.65)",
                    transform: "scale(1.18)",
                    zIndex: 0,
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Capas Gaming Split Interactivas en Vivo (Facecam Arriba + Gameplay al Centro) */}
              {videoLayout === "gaming_split" && isEffectiveVertical && !isExported && (
                <>
                  {/* Facecam Streamer (Capa Superior - Al Frente e Interactiva con Mouse 2D) */}
                  <div
                    onPointerDown={(e) => handleStagePointerDown(e, "camera", "move")}
                    onClick={(e) => { e.stopPropagation(); setActiveCropTarget("camera"); }}
                    style={{
                      position: "absolute",
                      top: `${(camOutY / 1920) * 100}%`,
                      left: `${(camOutX / 1080) * 100}%`,
                      width: `${(camOutWidth / 1080) * 100}%`,
                      height: `${(camOutHeight / 1920) * 100}%`,
                      overflow: "hidden",
                      border: activeCropTarget === "camera" ? "2px solid #f43f5e" : "1px dashed rgba(244, 63, 94, 0.7)",
                      boxShadow: activeCropTarget === "camera" ? "0 0 12px rgba(244, 63, 94, 0.5)" : "0 2px 10px rgba(0,0,0,0.6)",
                      zIndex: 4,
                      cursor: "move",
                      touchAction: "none",
                    }}
                    title="Facecam: Arrastra para mover en el lienzo 9:16. Usa la manija inferior derecha para redimensionar ancho y alto."
                  >
                    <video
                      ref={camVideoRef}
                      src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(detail.project.sourcePath)}`}
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget;
                        const master = videoRef.current;
                        const t = master ? master.currentTime : trimStart;
                        if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t;
                        if (master && !master.paused) el.play().catch(() => {});
                      }}
                      style={{
                        position: "absolute",
                        width: `${(1920 / cameraCrop.width) * 100}%`,
                        height: `${(1080 / cameraCrop.height) * 100}%`,
                        left: `-${(cameraCrop.x / cameraCrop.width) * 100}%`,
                        top: `-${(cameraCrop.y / cameraCrop.height) * 100}%`,
                        objectFit: "fill",
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: "4px",
                        left: "4px",
                        background: "rgba(244, 63, 94, 0.9)",
                        color: "#fff",
                        fontSize: "0.58rem",
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: "2px",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    >
                      Facecam
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "4px",
                        background: "rgba(0, 0, 0, 0.75)",
                        color: "#f43f5e",
                        fontSize: "0.55rem",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: "2px",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    >
                      {camOutWidth}x{camOutHeight}px
                    </span>
                    {/* Manija de Redimensión Facecam */}
                    <div
                      onPointerDown={(e) => handleStagePointerDown(e, "camera", "resize_br")}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        right: "2px",
                        width: "12px",
                        height: "12px",
                        background: "#ffffff",
                        border: "2px solid #f43f5e",
                        borderRadius: "2px",
                        cursor: "nwse-resize",
                        zIndex: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      }}
                      title="Arrastra para redimensionar ancho y alto de la Facecam"
                    />
                  </div>

                  {/* Gameplay Centrado (Capa Central e Interactiva con Mouse 2D) */}
                  <div
                    onPointerDown={(e) => handleStagePointerDown(e, "gameplay", "move")}
                    onClick={(e) => { e.stopPropagation(); setActiveCropTarget("gameplay"); }}
                    style={{
                      position: "absolute",
                      top: `${(gameOutY / 1920) * 100}%`,
                      left: `${(gameOutX / 1080) * 100}%`,
                      width: `${(gameOutWidth / 1080) * 100}%`,
                      height: `${(gameOutHeight / 1920) * 100}%`,
                      overflow: "hidden",
                      border: activeCropTarget === "gameplay" ? "2px solid #3b82f6" : "1px dashed rgba(59, 130, 246, 0.7)",
                      boxShadow: activeCropTarget === "gameplay" ? "0 0 12px rgba(59, 130, 246, 0.5)" : "0 2px 12px rgba(0,0,0,0.6)",
                      zIndex: 3,
                      cursor: "move",
                      touchAction: "none",
                    }}
                    title="Gameplay: Arrastra para mover en el lienzo 9:16. Usa la manija inferior derecha para redimensionar ancho y alto."
                  >
                    <video
                      ref={gameVideoRef}
                      src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(detail.project.sourcePath)}`}
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(e) => {
                        const el = e.currentTarget;
                        const master = videoRef.current;
                        const t = master ? master.currentTime : trimStart;
                        if (Math.abs(el.currentTime - t) > 0.05) el.currentTime = t;
                        if (master && !master.paused) el.play().catch(() => {});
                      }}
                      style={{
                        position: "absolute",
                        width: `${(1920 / gameplayCrop.width) * 100}%`,
                        height: `${(1080 / gameplayCrop.height) * 100}%`,
                        left: `-${(gameplayCrop.x / gameplayCrop.width) * 100}%`,
                        top: `-${(gameplayCrop.y / gameplayCrop.height) * 100}%`,
                        objectFit: "fill",
                        pointerEvents: "none",
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: "4px",
                        left: "4px",
                        background: "rgba(59, 130, 246, 0.9)",
                        color: "#fff",
                        fontSize: "0.58rem",
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: "2px",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    >
                      Gameplay
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        top: "4px",
                        right: "4px",
                        background: "rgba(0, 0, 0, 0.75)",
                        color: "#3b82f6",
                        fontSize: "0.55rem",
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        padding: "1px 4px",
                        borderRadius: "2px",
                        zIndex: 4,
                        pointerEvents: "none",
                      }}
                    >
                      {gameOutWidth}x{gameOutHeight}px
                    </span>
                    {/* Manija de Redimensión Gameplay */}
                    <div
                      onPointerDown={(e) => handleStagePointerDown(e, "gameplay", "resize_br")}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        right: "2px",
                        width: "12px",
                        height: "12px",
                        background: "#ffffff",
                        border: "2px solid #3b82f6",
                        borderRadius: "2px",
                        cursor: "nwse-resize",
                        zIndex: 10,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      }}
                      title="Arrastra para redimensionar ancho y alto del Gameplay"
                    />
                  </div>
                </>
              )}

              {/* Pista de Audio BGM en Vivo */}
              {(bgmPath || bgmBlobUrl) && !isExported && (
                <audio
                  ref={bgmAudioRef}
                  src={bgmBlobUrl || (bgmPath ? `http://127.0.0.1:1422/stream?file=${encodeURIComponent(bgmPath)}` : undefined)}
                  preload="auto"
                  loop
                  onLoadedMetadata={() => {
                    if (bgmAudioRef.current && videoRef.current) {
                      const offset = Math.max(0, videoRef.current.currentTime - trimStart);
                      bgmAudioRef.current.currentTime = bgmStartSec + offset;
                      bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
                    }
                  }}
                />
              )}

              {/* Botón Central de Play cuando está pausado */}
              {!isPlaying && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    background: "rgba(0, 0, 0, 0.75)",
                    backdropFilter: "blur(4px)",
                    color: "#ffffff",
                    borderRadius: "50%",
                    width: "54px",
                    height: "54px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.6)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <Play size={24} style={{ marginLeft: "3px" }} />
                </div>
              )}

              {/* Lienzo Dinámico sobre el Video: Subtítulos y CTA en Tiempo Real (solo en fuente original) */}
              {!isExported && (burnSubtitles || ctaEnabled) && (
                <div
                  className="clip-phone-overlay-container"
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    overflow: "hidden",
                  }}
                >
                  {/* Insignia CTA con coordenadas absolutas exactas relativas al lienzo */}
                  {ctaEnabled && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${(ctaX / canvasWidth) * 100}%`,
                        top: `${(ctaY / canvasHeight) * 100}%`,
                        transform: `translate(-50%, -50%) scale(${(ctaScale / 100).toFixed(2)})`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                        zIndex: 2,
                      }}
                    >
                      {renderCtaBadgePreview()}
                    </div>
                  )}

                  {/* Subtítulos con coordenadas absolutas exactas y escala de tamaño */}
                  {burnSubtitles && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${(captionX / canvasWidth) * 100}%`,
                        top: `${(captionY / canvasHeight) * 100}%`,
                        transform:
                          captionAlignH === "left"
                            ? "translate(0, -50%)"
                            : captionAlignH === "right"
                            ? "translate(-100%, -50%)"
                            : "translate(-50%, -50%)",
                        transformOrigin: `${captionAlignH} center`,
                        width: "max-content",
                        maxWidth: "92%",
                        pointerEvents: "none",
                        textAlign: captionAlignH,
                        zIndex: 3,
                        zoom: Number((captionFontSize / (isEffectiveVertical ? 62 : 50)).toFixed(2)),
                      }}
                    >
                      {renderCaptionPreview()}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Barra de Transporte VLC Compacta */}
            <div
              style={{
                background: "var(--bg-surface-raised)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                padding: "0.55rem 0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    padding: "4px 8px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "5px",
                  }}
                  title={isPlaying ? "Pausar" : "Reproducir"}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                </button>

                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "42px",
                  }}
                  title="Tiempo actual del clip"
                >
                  {formatTime(currentPlayTime)}
                </span>

                <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                  <input
                    type="range"
                    min={0}
                    max={clipDuration}
                    step={0.1}
                    value={Math.min(currentPlayTime, clipDuration)}
                    onChange={handleSeek}
                    style={{
                      width: "100%",
                      height: "5px",
                      borderRadius: "3px",
                      accentColor: "#fafafa",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  />
                </div>

                <span
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontVariantNumeric: "tabular-nums",
                    minWidth: "42px",
                    textAlign: "right",
                  }}
                  title="Duración del clip"
                >
                  {formatTime(clipDuration)}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  paddingLeft: "4px",
                }}
              >
                <span>
                  Clip: <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{currentPlayTime.toFixed(1)}s</strong> / {clipDuration.toFixed(1)}s
                </span>
                <span>
                  Original: <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{formatTime(absoluteCurrentTime)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: HERRAMIENTAS ORGANIZADAS EN PESTAÑAS */}
          <div className="clip-studio-tools-col">
            {/* Barra de Pestañas Superior */}
            <div className="studio-tabs-bar">
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "trim" ? "active" : ""}`}
                onClick={() => setActiveTab("trim")}
              >
                <Clock size={13} />
                <span>Recorte</span>
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "subs" ? "active" : ""}`}
                onClick={() => setActiveTab("subs")}
              >
                <Type size={13} />
                <span>Subtítulos</span>
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "cta" ? "active" : ""}`}
                onClick={() => setActiveTab("cta")}
              >
                <Heart size={13} />
                <span>CTA</span>
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "format" ? "active" : ""}`}
                onClick={() => setActiveTab("format")}
              >
                <Layout size={13} />
                <span>Formato</span>
              </button>
              <button
                type="button"
                className={`studio-tab-btn ${activeTab === "export" ? "active" : ""}`}
                onClick={() => setActiveTab("export")}
              >
                <Sliders size={13} />
                <span>Audio & Export</span>
              </button>
            </div>

            {/* PESTAÑA 1: RECORTE Y TIEMPOS */}
            {activeTab === "trim" && (
              <div className="studio-tab-pane">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Ajuste Fino de Tiempos
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Extiende o acorta el clip con precisión quirúrgica de décimas de segundo.
                    </p>
                  </div>
                  <span
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                      background: "var(--bg-surface)",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    Duración: <strong style={{ color: "var(--text-primary)" }}>{clipDuration.toFixed(1)}s</strong>
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                  {/* Inicio */}
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600 }}>Punto de Inicio</span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {formatTime(trimStart)} ({trimStart.toFixed(1)}s)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimStart(-5)}
                        title="Retroceder inicio 5s"
                      >
                        -5s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimStart(-1)}
                        title="Retroceder inicio 1s"
                      >
                        -1s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimStart(1)}
                        title="Avanzar inicio 1s"
                      >
                        +1s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimStart(5)}
                        title="Avanzar inicio 5s"
                      >
                        +5s
                      </button>
                    </div>
                  </div>

                  {/* Fin */}
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600 }}>Punto de Fin</span>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {formatTime(trimEnd)} ({trimEnd.toFixed(1)}s)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem" }}>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimEnd(-5)}
                        title="Acortar fin 5s"
                      >
                        -5s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimEnd(-1)}
                        title="Acortar fin 1s"
                      >
                        -1s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimEnd(1)}
                        title="Extender fin 1s"
                      >
                        +1s
                      </button>
                      <button
                        type="button"
                        className="btn-cancel"
                        style={{ flex: 1, padding: 0, height: "28px", minHeight: "28px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                        onClick={() => handleUpdateTrimEnd(5)}
                        title="Extender fin 5s"
                      >
                        +5s
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "0.25rem" }}>
                  {trimStart !== candidate.startSec || trimEnd !== candidate.endSec ? (
                    <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      Original IA: {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)}
                    </span>
                  ) : (
                    <div />
                  )}
                </div>

                {/* SECCIÓN CORTES INTERNOS / CAPCUT TIMELINE */}
                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.85rem",
                    background: "var(--bg-surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Scissors size={15} style={{ color: "var(--accent-primary, #6366f1)" }} />
                        Cortes Internos y Jump Cuts (Estilo CapCut)
                      </h4>
                      <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Haz clic en Dividir para partir el clip en el cabezal actual y elimina fragmentos no deseados.
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "var(--font-mono)",
                        color: totalRemovedDuration > 0 ? "#f43f5e" : "var(--text-muted)",
                        background: "var(--bg-base)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      {totalRemovedDuration > 0
                        ? `Recortado: -${totalRemovedDuration.toFixed(1)}s (Quedan ${totalKeptDuration.toFixed(1)}s)`
                        : `Sin cortes internos (${clipDuration.toFixed(1)}s)`}
                    </span>
                  </div>

                  {/* Barra interactiva visual de segmentos */}
                  <div
                    style={{
                      height: "36px",
                      background: "rgba(0, 0, 0, 0.4)",
                      borderRadius: "6px",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {segments.map((seg, idx) => {
                      const totalSpan = Math.max(0.1, trimEnd - trimStart);
                      const widthPct = Math.max(2, ((seg.end - seg.start) / totalSpan) * 100);
                      const isSelected = selectedSegmentId === seg.id;
                      return (
                        <div
                          key={seg.id}
                          onClick={() => {
                            setSelectedSegmentId(seg.id);
                            if (videoRef.current) {
                              videoRef.current.currentTime = seg.start;
                            }
                          }}
                          title={`Segmento ${idx + 1}: ${formatTime(seg.start)} - ${formatTime(seg.end)} (${(seg.end - seg.start).toFixed(1)}s)${seg.deleted ? " [ELIMINADO]" : ""}`}
                          style={{
                            width: `${widthPct}%`,
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.68rem",
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            borderRight: idx < segments.length - 1 ? "2px solid #09090b" : "none",
                            outline: isSelected ? "2px solid #fafafa" : "none",
                            outlineOffset: "-2px",
                            background: seg.deleted
                              ? "repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.25) 6px, rgba(239, 68, 68, 0.4) 6px, rgba(239, 68, 68, 0.4) 12px)"
                              : isSelected
                              ? "rgba(99, 102, 241, 0.65)"
                              : "rgba(99, 102, 241, 0.35)",
                            color: seg.deleted ? "#fca5a5" : "#ffffff",
                            textDecoration: seg.deleted ? "line-through" : "none",
                            userSelect: "none",
                          }}
                        >
                          {seg.deleted ? "✕" : `${(seg.end - seg.start).toFixed(1)}s`}
                        </div>
                      );
                    })}

                    {/* Cabezal de reproducción en la barra */}
                    {trimEnd > trimStart && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          width: "2px",
                          background: "#ffffff",
                          boxShadow: "0 0 6px rgba(255, 255, 255, 0.8)",
                          pointerEvents: "none",
                          left: `${Math.max(0, Math.min(100, ((absoluteCurrentTime - trimStart) / (trimEnd - trimStart)) * 100))}%`,
                          zIndex: 10,
                        }}
                      />
                    )}
                  </div>

                  {/* Acciones de división y eliminación */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={handleSplitAtPlayhead}
                      style={{
                        minHeight: "32px",
                        padding: "0 14px",
                        fontSize: "0.78rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#4f46e5",
                        color: "#ffffff",
                        border: "1px solid #6366f1",
                        borderRadius: "6px",
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#4338ca")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#4f46e5")}
                      title="Divide el segmento actual en el segundo exacto donde está pausado el video"
                    >
                      <Split size={14} />
                      <span>Dividir en cabezal ({absoluteCurrentTime.toFixed(1)}s)</span>
                    </button>

                    {selectedSegmentId && (
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={() => toggleDeleteSegment(selectedSegmentId)}
                        style={{
                          minHeight: "30px",
                          padding: "0 12px",
                          fontSize: "0.76rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          color: segments.find((s) => s.id === selectedSegmentId)?.deleted ? "#10b981" : "#ef4444",
                          borderColor: segments.find((s) => s.id === selectedSegmentId)?.deleted ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)",
                        }}
                      >
                        {segments.find((s) => s.id === selectedSegmentId)?.deleted ? (
                          <>
                            <RotateCcw size={13} />
                            Restaurar fragmento
                          </>
                        ) : (
                          <>
                            <Trash2 size={13} />
                            Eliminar fragmento
                          </>
                        )}
                      </button>
                    )}

                    {segments.length > 1 && (
                      <button
                        type="button"
                        className="btn-cancel"
                        onClick={handleResetSegments}
                        style={{ minHeight: "30px", padding: "0 10px", fontSize: "0.74rem" }}
                        title="Elimina todos los cortes y vuelve al clip continuo"
                      >
                        Restablecer todos los cortes
                      </button>
                    )}
                  </div>

                  {/* Opciones de exportación: Transición suave y FPS */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "0.4rem",
                      borderTop: "1px solid var(--border-default)",
                      fontSize: "0.76rem",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={hasTransition}
                        onChange={(e) => setHasTransition(e.target.checked)}
                        style={{ cursor: "pointer" }}
                      />
                      <span>Transición suave entre cortes</span>
                    </label>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Film size={13} style={{ color: "var(--text-muted)" }} />
                      <span style={{ color: "var(--text-muted)" }}>FPS:</span>
                      <select
                        value={selectedFps}
                        onChange={(e) => setSelectedFps(e.target.value)}
                        style={{
                          background: "var(--bg-base)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontSize: "0.74rem",
                          cursor: "pointer",
                        }}
                      >
                        <option value="auto">Auto / Nativo</option>
                        <option value="120">120 FPS (Ultra Smooth)</option>
                        <option value="60">60 FPS</option>
                        <option value="30">30 FPS</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* BOTONES UNIFICADOS DE GUARDAR Y RESTABLECER AJUSTE (TIEMPOS Y CORTES) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "0.85rem",
                    marginTop: "0.4rem",
                    borderTop: "1px solid var(--border-default)",
                  }}
                >
                  <div>
                    {trimStart !== candidate.startSec || trimEnd !== candidate.endSec || segments.length > 1 || segments[0]?.deleted ? (
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        Original IA: {formatTime(candidate.startSec)} - {formatTime(candidate.endSec)}
                      </span>
                    ) : (
                      <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                        Clip con valores sugeridos por IA
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn-cancel"
                      style={{ minHeight: "34px", fontSize: "0.78rem", padding: "0 14px" }}
                      onClick={() => {
                        setTrimStart(candidate.startSec);
                        setTrimEnd(candidate.endSec);
                        setSegments([{ id: "seg-1", start: candidate.startSec, end: candidate.endSec, deleted: false }]);
                        setSelectedSegmentId("seg-1");
                        try {
                          localStorage.removeItem("autoshorts_candidate_segments_" + candidate.id);
                        } catch {}
                      }}
                      disabled={trimStart === candidate.startSec && trimEnd === candidate.endSec && segments.length <= 1 && !segments[0]?.deleted}
                    >
                      Restablecer Original
                    </button>
                    <button
                      type="button"
                      className="btn-confirm"
                      style={{
                        minHeight: "34px",
                        fontSize: "0.78rem",
                        padding: "0 18px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      onClick={async () => {
                        try {
                          localStorage.setItem("autoshorts_candidate_segments_" + candidate.id, JSON.stringify(segments));
                          const activeSubRanges = segments.filter((s) => !s.deleted);
                          let newStart = trimStart;
                          let newEnd = trimEnd;
                          if (activeSubRanges.length > 0) {
                            newStart = activeSubRanges[0].start;
                            newEnd = activeSubRanges[activeSubRanges.length - 1].end;
                            setTrimStart(newStart);
                            setTrimEnd(newEnd);
                          }
                          await onSaveTrim(newStart, newEnd);
                          setSaveFeedback(true);
                          setTimeout(() => setSaveFeedback(false), 2500);
                        } catch (e) {
                          console.error("Error guardando ajuste:", e);
                        }
                      }}
                      disabled={isSavingTrim || trimStart >= trimEnd}
                    >
                      {isSavingTrim ? (
                        <>
                          <Loader2 size={13} className="spin" />
                          <span>Guardando...</span>
                        </>
                      ) : saveFeedback ? (
                        <>
                          <Sparkles size={13} style={{ color: "#10b981" }} />
                          <span style={{ color: "#10b981", fontWeight: 700 }}>¡Ajuste Guardado!</span>
                        </>
                      ) : (
                        "Guardar Ajuste"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 2: SUBTÍTULOS DINÁMICOS */}
            {activeTab === "subs" && (
              <div className="studio-tab-pane">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Subtítulos Dinámicos (Motionmaxxing)
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Renderizado en vivo con tipografías hiper-legibles y resaltado por palabra.
                    </p>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
                    <input
                      type="checkbox"
                      checked={burnSubtitles}
                      onChange={(e) => setBurnSubtitles(e.target.checked)}
                      style={{ accentColor: "#fafafa", cursor: "pointer" }}
                    />
                    <span style={{ color: burnSubtitles ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: burnSubtitles ? 700 : 500 }}>
                      Incrustar Subtítulos
                    </span>
                  </label>
                </div>

                {burnSubtitles ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "0.85rem", paddingTop: "0.25rem" }}>
                      {/* Estilo */}
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>
                          Estilo de animación:
                        </label>
                        <select
                          value={captionStyle}
                          onChange={(e) => setCaptionStyle(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.45rem 0.6rem",
                            borderRadius: "6px",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: "0.78rem",
                            cursor: "pointer",
                          }}
                        >
                          <option value="loud-viral">Loud Viral (3D Impact)</option>
                          <option value="arcade-retro">Arcade Retro (Gaming Neón)</option>
                          <option value="cyber-terminal">Cyber Terminal (Monospace)</option>
                          <option value="clean-editorial">Clean Editorial (Elegante & Suave)</option>
                          <option value="tiktok-karaoke">TikTok Karaoke (Palabra Resaltada)</option>
                          <option value="modern-box">Caja Moderna (Fondo Oscuro)</option>
                          <option value="classic-outline">Clásico Contorno (Amarillo y Negro)</option>
                          <option value="minimal-shadow">Minimalista (Blanco con Sombra)</option>
                        </select>
                      </div>

                      {/* Posición Rápida */}
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>
                          Posición rápida:
                        </label>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setCaptionPosition("top");
                              setCaptionY(presetTopY);
                            }}
                            title={`Arriba (Y=${presetTopY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: captionY <= (isEffectiveVertical ? 400 : 200) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: captionY <= (isEffectiveVertical ? 400 : 200) ? "#fafafa" : "var(--bg-surface)",
                              color: captionY <= (isEffectiveVertical ? 400 : 200) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: captionY <= (isEffectiveVertical ? 400 : 200) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyStart size={12} />
                            Arriba
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCaptionPosition("center");
                              setCaptionY(presetCenterY);
                            }}
                            title={`Centro (Y=${presetCenterY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: captionY > (isEffectiveVertical ? 400 : 200) && captionY < (isEffectiveVertical ? 1300 : 750) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: captionY > (isEffectiveVertical ? 400 : 200) && captionY < (isEffectiveVertical ? 1300 : 750) ? "#fafafa" : "var(--bg-surface)",
                              color: captionY > (isEffectiveVertical ? 400 : 200) && captionY < (isEffectiveVertical ? 1300 : 750) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: captionY > (isEffectiveVertical ? 400 : 200) && captionY < (isEffectiveVertical ? 1300 : 750) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyCenter size={12} />
                            Centro
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCaptionPosition("bottom");
                              setCaptionY(presetBottomY);
                            }}
                            title={`Abajo (Y=${presetBottomY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: captionY >= (isEffectiveVertical ? 1300 : 750) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: captionY >= (isEffectiveVertical ? 1300 : 750) ? "#fafafa" : "var(--bg-surface)",
                              color: captionY >= (isEffectiveVertical ? 1300 : 750) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: captionY >= (isEffectiveVertical ? 1300 : 750) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyEnd size={12} />
                            Abajo
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* PANEL DE TRANSFORMACIÓN Y COORDENADAS PREMIERE / OBS */}
                    <div
                      style={{
                        background: "var(--bg-surface)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.65rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                          <Move size={13} style={{ color: "var(--accent-primary, #6366f1)" }} />
                          Posición Exacta y Transformación (Lienzo {canvasWidth}x{canvasHeight})
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="btn-cancel"
                            style={{ height: "24px", minHeight: "24px", padding: "0 8px", fontSize: "0.7rem" }}
                            onClick={() => {
                              setCaptionPosition("bottom");
                              setCaptionY(presetStreamerY);
                            }}
                            title="Posiciona los subtítulos arriba de los overlays/HUDs de la parte inferior"
                          >
                            Streamer Elevado ({presetStreamerY})
                          </button>
                          <button
                            type="button"
                            className="btn-cancel"
                            style={{ height: "24px", minHeight: "24px", padding: "0 8px", fontSize: "0.7rem" }}
                            onClick={() => setCaptionX(presetCenterX)}
                            title={`Centra los subtítulos horizontalmente en X=${presetCenterX}`}
                          >
                            Centrar X ({presetCenterX})
                          </button>
                        </div>
                      </div>

                      {/* Coordenadas X e Y */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                        {/* Coordenada X */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Posición X (0-{canvasWidth}):</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{captionX}px</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="range"
                              min={10}
                              max={canvasWidth - 10}
                              step={5}
                              value={captionX}
                              onChange={(e) => setCaptionX(Number(e.target.value))}
                              style={{ flex: 1, height: "4px", accentColor: "#6366f1", cursor: "pointer" }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={canvasWidth}
                              value={captionX}
                              onChange={(e) => setCaptionX(Math.max(0, Math.min(canvasWidth, Number(e.target.value))))}
                              style={{
                                width: "54px",
                                padding: "2px 4px",
                                fontSize: "0.74rem",
                                fontFamily: "var(--font-mono)",
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        </div>

                        {/* Coordenada Y */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Posición Y (0-{canvasHeight}):</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{captionY}px</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="range"
                              min={20}
                              max={canvasHeight - 20}
                              step={10}
                              value={captionY}
                              onChange={(e) => setCaptionY(Number(e.target.value))}
                              style={{ flex: 1, height: "4px", accentColor: "#6366f1", cursor: "pointer" }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={canvasHeight}
                              value={captionY}
                              onChange={(e) => setCaptionY(Math.max(0, Math.min(canvasHeight, Number(e.target.value))))}
                              style={{
                                width: "54px",
                                padding: "2px 4px",
                                fontSize: "0.74rem",
                                fontFamily: "var(--font-mono)",
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Tamaño de fuente y Alineación horizontal */}
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.85rem", alignItems: "center", paddingTop: "0.3rem" }}>
                        {/* Tamaño de fuente */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Tamaño de Fuente:</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{captionFontSize}px</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="range"
                              min={36}
                              max={88}
                              step={2}
                              value={captionFontSize}
                              onChange={(e) => setCaptionFontSize(Number(e.target.value))}
                              style={{ flex: 1, height: "4px", accentColor: "#6366f1", cursor: "pointer" }}
                            />
                            <input
                              type="number"
                              min={36}
                              max={88}
                              value={captionFontSize}
                              onChange={(e) => setCaptionFontSize(Math.max(36, Math.min(88, Number(e.target.value))))}
                              style={{
                                width: "46px",
                                padding: "2px 4px",
                                fontSize: "0.74rem",
                                fontFamily: "var(--font-mono)",
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        </div>

                        {/* Alineación Horizontal */}
                        <div>
                          <span style={{ display: "block", fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "3px" }}>
                            Alineación:
                          </span>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={() => setCaptionAlignH("left")}
                              style={{
                                flex: 1,
                                height: "26px",
                                borderRadius: "4px",
                                border: captionAlignH === "left" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                                background: captionAlignH === "left" ? "#fafafa" : "var(--bg-base)",
                                color: captionAlignH === "left" ? "#09090b" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              title="Alinear texto a la Izquierda"
                            >
                              <AlignLeft size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCaptionAlignH("center")}
                              style={{
                                flex: 1,
                                height: "26px",
                                borderRadius: "4px",
                                border: captionAlignH === "center" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                                background: captionAlignH === "center" ? "#fafafa" : "var(--bg-base)",
                                color: captionAlignH === "center" ? "#09090b" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              title="Centrar texto"
                            >
                              <AlignCenter size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCaptionAlignH("right")}
                              style={{
                                flex: 1,
                                height: "26px",
                                borderRadius: "4px",
                                border: captionAlignH === "right" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                                background: captionAlignH === "right" ? "#fafafa" : "var(--bg-base)",
                                color: captionAlignH === "right" ? "#09090b" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                              title="Alinear texto a la Derecha"
                            >
                              <AlignRight size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Paletas de Colores */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.85rem",
                        background: "var(--bg-surface)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            marginBottom: "0.4rem",
                            fontWeight: 600,
                          }}
                        >
                          <Palette size={12} color="var(--text-secondary)" />
                          Color de texto:
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {[
                              { color: "#ffffff", name: "Blanco" },
                              { color: "#fef08a", name: "Crema" },
                              { color: "#e0f2fe", name: "Celeste" },
                              { color: "#fce7f3", name: "Rosa" },
                              { color: "#d4d4d8", name: "Plata" },
                            ].map((swatch) => (
                              <button
                                key={swatch.color}
                                type="button"
                                onClick={() => setCaptionColor(swatch.color)}
                                title={swatch.name}
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "4px",
                                  background: swatch.color,
                                  border: captionColor.toLowerCase() === swatch.color.toLowerCase() ? "2px solid #fafafa" : "1px solid rgba(255,255,255,0.2)",
                                  boxShadow: captionColor.toLowerCase() === swatch.color.toLowerCase() ? "0 0 0 1px #000" : "none",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              />
                            ))}
                          </div>
                          <input
                            type="color"
                            value={captionColor}
                            onChange={(e) => setCaptionColor(e.target.value)}
                            title="Personalizar color de texto"
                            style={{
                              width: "26px",
                              height: "22px",
                              padding: "0 1px",
                              borderRadius: "4px",
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface-raised)",
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            marginBottom: "0.4rem",
                            fontWeight: 600,
                          }}
                        >
                          <Sparkles size={12} color="#facc15" />
                          Resaltado (Karaoke):
                        </label>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {[
                              { color: "#facc15", name: "Amarillo" },
                              { color: "#38bdf8", name: "Cyan" },
                              { color: "#4ade80", name: "Verde Neón" },
                              { color: "#f43f5e", name: "Rojo Fresa" },
                              { color: "#fb923c", name: "Naranja" },
                              { color: "#c084fc", name: "Púrpura" },
                            ].map((swatch) => (
                              <button
                                key={swatch.color}
                                type="button"
                                onClick={() => setCaptionHighlight(swatch.color)}
                                title={swatch.name}
                                style={{
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "4px",
                                  background: swatch.color,
                                  border: captionHighlight.toLowerCase() === swatch.color.toLowerCase() ? "2px solid #fafafa" : "1px solid rgba(255,255,255,0.2)",
                                  boxShadow: captionHighlight.toLowerCase() === swatch.color.toLowerCase() ? "0 0 0 1px #000" : "none",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              />
                            ))}
                          </div>
                          <input
                            type="color"
                            value={captionHighlight}
                            onChange={(e) => setCaptionHighlight(e.target.value)}
                            title="Personalizar color de resaltado"
                            style={{
                              width: "26px",
                              height: "22px",
                              padding: "0 1px",
                              borderRadius: "4px",
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-surface-raised)",
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Distribución de Líneas */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "var(--bg-surface)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <div>
                        <label style={{ display: "block", fontSize: "0.76rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Distribución de líneas:
                        </label>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {captionLines === "1" ? "1 sola línea fija (estilo TikTok / Shorts)" : "Dividir en hasta 2 líneas"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.3rem" }}>
                        <button
                          type="button"
                          onClick={() => setCaptionLines("1")}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "5px",
                            border: captionLines === "1" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                            background: captionLines === "1" ? "#fafafa" : "var(--bg-surface)",
                            color: captionLines === "1" ? "#09090b" : "var(--text-secondary)",
                            fontSize: "0.74rem",
                            fontWeight: captionLines === "1" ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          1 Sola Línea
                        </button>
                        <button
                          type="button"
                          onClick={() => setCaptionLines("2")}
                          style={{
                            padding: "0.35rem 0.75rem",
                            borderRadius: "5px",
                            border: captionLines === "2" ? "1px solid #fafafa" : "1px solid var(--border-default)",
                            background: captionLines === "2" ? "#fafafa" : "var(--bg-surface)",
                            color: captionLines === "2" ? "#09090b" : "var(--text-secondary)",
                            fontSize: "0.74rem",
                            fontWeight: captionLines === "2" ? 700 : 500,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          2 Líneas
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      background: "var(--bg-surface)",
                      borderRadius: "8px",
                      border: "1px dashed var(--border-default)",
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                    }}
                  >
                    Los subtítulos incrustados están desactivados. El video se exportará limpio y se creará un archivo .srt sincronizado por separado.
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 3: CTA ANIMADO */}
            {activeTab === "cta" && (
              <div className="studio-tab-pane">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      Llamado a la Acción (CTA Animado)
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                      Insignia flotante dinámica para maximizar likes, comentarios y suscripciones.
                    </p>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "0.78rem" }}>
                    <input
                      type="checkbox"
                      checked={ctaEnabled}
                      onChange={(e) => setCtaEnabled(e.target.checked)}
                      style={{ accentColor: "#fafafa", cursor: "pointer" }}
                    />
                    <span style={{ color: ctaEnabled ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: ctaEnabled ? 700 : 500 }}>
                      Incrustar Insignia
                    </span>
                  </label>
                </div>

                {ctaEnabled ? (
                  <>
                    <div
                      style={{
                        background: "var(--bg-surface)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                        <label style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Texto del llamado:
                        </label>
                        <select
                          onChange={(e) => {
                            if (e.target.value) setCtaText(e.target.value);
                          }}
                          defaultValue=""
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-secondary)",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          <option value="" disabled>Elegir sugerencia rápida...</option>
                          <option value="¡Sígueme y dale like!">¡Sígueme y dale like!</option>
                          <option value="¡Apóyame con tu follow!">¡Apóyame con tu follow!</option>
                          <option value="¡Suscríbete para más clips!">¡Suscríbete para más clips!</option>
                          <option value="¡Comenta qué opinas!">¡Comenta qué opinas!</option>
                          <option value="¡Guarda este video!">¡Guarda este video!</option>
                        </select>
                      </div>
                      <input
                        type="text"
                        value={ctaText}
                        onChange={(e) => setCtaText(e.target.value)}
                        placeholder="Ej. ¡Sígueme y dale like!"
                        style={{
                          width: "100%",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "6px",
                          background: "var(--bg-surface-raised)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          fontSize: "0.78rem",
                        }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "0.85rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>
                          Estilo de animación:
                        </label>
                        <select
                          value={ctaAnimation}
                          onChange={(e) => setCtaAnimation(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "0.45rem 0.6rem",
                            borderRadius: "6px",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                            fontSize: "0.76rem",
                            cursor: "pointer",
                          }}
                        >
                          <option value="bounce-land">Impacto Dinámico (Bounce Land)</option>
                          <option value="slide-up">Deslizamiento Suave (Slide Up)</option>
                          <option value="pulse-glow">Latido Neón (Pulse Glow)</option>
                          <option value="fade-smooth">Fundido Suave (Fade Smooth)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem", fontWeight: 600 }}>
                          Posición rápida:
                        </label>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setCtaPosition("top");
                              setCtaY(presetCtaTopY);
                            }}
                            title={`Arriba (Y=${presetCtaTopY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: ctaY <= (isEffectiveVertical ? 400 : 200) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: ctaY <= (isEffectiveVertical ? 400 : 200) ? "#fafafa" : "var(--bg-surface)",
                              color: ctaY <= (isEffectiveVertical ? 400 : 200) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: ctaY <= (isEffectiveVertical ? 400 : 200) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyStart size={12} />
                            Arriba
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCtaPosition("center");
                              setCtaY(presetCtaCenterY);
                            }}
                            title={`Medio (Y=${presetCtaCenterY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: ctaY > (isEffectiveVertical ? 400 : 200) && ctaY < (isEffectiveVertical ? 1300 : 750) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: ctaY > (isEffectiveVertical ? 400 : 200) && ctaY < (isEffectiveVertical ? 1300 : 750) ? "#fafafa" : "var(--bg-surface)",
                              color: ctaY > (isEffectiveVertical ? 400 : 200) && ctaY < (isEffectiveVertical ? 1300 : 750) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: ctaY > (isEffectiveVertical ? 400 : 200) && ctaY < (isEffectiveVertical ? 1300 : 750) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyCenter size={12} />
                            Medio
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCtaPosition("bottom");
                              setCtaY(presetCtaBottomY);
                            }}
                            title={`Abajo (Y=${presetCtaBottomY})`}
                            style={{
                              flex: 1,
                              padding: "0.42rem 0.2rem",
                              borderRadius: "5px",
                              border: ctaY >= (isEffectiveVertical ? 1300 : 750) ? "1px solid #fafafa" : "1px solid var(--border-default)",
                              background: ctaY >= (isEffectiveVertical ? 1300 : 750) ? "#fafafa" : "var(--bg-surface)",
                              color: ctaY >= (isEffectiveVertical ? 1300 : 750) ? "#09090b" : "var(--text-secondary)",
                              fontSize: "0.72rem",
                              fontWeight: ctaY >= (isEffectiveVertical ? 1300 : 750) ? 700 : 500,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "3px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <AlignVerticalJustifyEnd size={12} />
                            Abajo
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* PANEL DE COORDENADAS Y ESCALA PARA INSIGNIA CTA */}
                    <div
                      style={{
                        background: "var(--bg-surface)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-default)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.65rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                          <Move size={13} style={{ color: "#f43f5e" }} />
                          Posición Exacta y Escala de Insignia (Lienzo {canvasWidth}x{canvasHeight})
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="btn-cancel"
                            style={{ height: "24px", minHeight: "24px", padding: "0 8px", fontSize: "0.7rem" }}
                            onClick={() => setCtaX(presetCtaCenterX)}
                            title={`Centra la insignia horizontalmente en X=${presetCtaCenterX}`}
                          >
                            Centrar X ({presetCtaCenterX})
                          </button>
                          <button
                            type="button"
                            className="btn-cancel"
                            style={{ height: "24px", minHeight: "24px", padding: "0 8px", fontSize: "0.7rem" }}
                            onClick={() => setCtaScale(100)}
                            title="Restablece la escala al 100%"
                          >
                            100% Escala
                          </button>
                        </div>
                      </div>

                      {/* Coordenadas X e Y */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                        {/* Coordenada X */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Posición X (0-{canvasWidth}):</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{ctaX}px</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="range"
                              min={10}
                              max={canvasWidth - 10}
                              step={5}
                              value={ctaX}
                              onChange={(e) => setCtaX(Number(e.target.value))}
                              style={{ flex: 1, height: "4px", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={canvasWidth}
                              value={ctaX}
                              onChange={(e) => setCtaX(Math.max(0, Math.min(canvasWidth, Number(e.target.value))))}
                              style={{
                                width: "54px",
                                padding: "2px 4px",
                                fontSize: "0.74rem",
                                fontFamily: "var(--font-mono)",
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        </div>

                        {/* Coordenada Y */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                            <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Posición Y (0-{canvasHeight}):</span>
                            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{ctaY}px</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input
                              type="range"
                              min={10}
                              max={canvasHeight - 10}
                              step={10}
                              value={ctaY}
                              onChange={(e) => setCtaY(Number(e.target.value))}
                              style={{ flex: 1, height: "4px", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                            <input
                              type="number"
                              min={0}
                              max={canvasHeight}
                              value={ctaY}
                              onChange={(e) => setCtaY(Math.max(0, Math.min(canvasHeight, Number(e.target.value))))}
                              style={{
                                width: "54px",
                                padding: "2px 4px",
                                fontSize: "0.74rem",
                                fontFamily: "var(--font-mono)",
                                background: "var(--bg-base)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "4px",
                                color: "var(--text-primary)",
                                textAlign: "center",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Escala de la Insignia */}
                      <div style={{ paddingTop: "0.2rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                          <span style={{ fontSize: "0.73rem", color: "var(--text-secondary)", fontWeight: 600 }}>Escala de Insignia (%):</span>
                          <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontWeight: 700 }}>{ctaScale}%</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="range"
                            min={70}
                            max={140}
                            step={5}
                            value={ctaScale}
                            onChange={(e) => setCtaScale(Number(e.target.value))}
                            style={{ flex: 1, height: "4px", accentColor: "#f43f5e", cursor: "pointer" }}
                          />
                          <input
                            type="number"
                            min={70}
                            max={140}
                            value={ctaScale}
                            onChange={(e) => setCtaScale(Math.max(70, Math.min(140, Number(e.target.value))))}
                            style={{
                              width: "54px",
                              padding: "2px 4px",
                              fontSize: "0.74rem",
                              fontFamily: "var(--font-mono)",
                              background: "var(--bg-base)",
                              border: "1px solid var(--border-default)",
                              borderRadius: "4px",
                              color: "var(--text-primary)",
                              textAlign: "center",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: "1.5rem",
                      textAlign: "center",
                      background: "var(--bg-surface)",
                      borderRadius: "8px",
                      border: "1px dashed var(--border-default)",
                      color: "var(--text-muted)",
                      fontSize: "0.8rem",
                    }}
                  >
                    El CTA animado está desactivado para este clip.
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 4: FORMATO Y GAMING SPLIT */}
            {activeTab === "format" && (
              <div className="studio-tab-pane">
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Formato Vertical & Encuadre Gaming
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    Transforma gameplay horizontal (16:9) a formato vertical (9:16) con desenfoque cinematográfico o encuadre de cámara.
                  </p>
                </div>

                {/* Selector de Layout */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => setVideoLayout("crop")}
                    style={{
                      background: videoLayout === "crop" ? "rgba(255, 255, 255, 0.08)" : "var(--bg-surface)",
                      border: videoLayout === "crop" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                      borderRadius: "6px",
                      padding: "10px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Recorte 9:16
                      </span>
                      {videoLayout === "crop" && <Check size={14} color="#3b82f6" />}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Corta los laterales centrando la acción en 1080x1920.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoLayout("blur")}
                    style={{
                      background: videoLayout === "blur" ? "rgba(255, 255, 255, 0.08)" : "var(--bg-surface)",
                      border: videoLayout === "blur" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                      borderRadius: "6px",
                      padding: "10px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Fondo Blur
                      </span>
                      {videoLayout === "blur" && <Check size={14} color="#3b82f6" />}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Video 16:9 completo al centro con fondo difuminado suave.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVideoLayout("gaming_split")}
                    style={{
                      background: videoLayout === "gaming_split" ? "rgba(255, 255, 255, 0.08)" : "var(--bg-surface)",
                      border: videoLayout === "gaming_split" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                      borderRadius: "6px",
                      padding: "10px 8px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        Gaming Split
                      </span>
                      {videoLayout === "gaming_split" && <Check size={14} color="#3b82f6" />}
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      Facecam del streamer arriba + gameplay en el centro.
                    </span>
                  </button>
                </div>

                {/* Opciones Específicas de Gaming Split */}
                {videoLayout === "gaming_split" && (
                  <div
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      marginTop: "0.5rem",
                    }}
                  >
                    {/* CANVAS INTERACTIVO 16:9: Arrastre y redimensión con Mouse */}
                    <div
                      style={{
                        background: "#09090b",
                        border: "1px solid var(--border-default)",
                        borderRadius: "8px",
                        padding: "10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Move size={14} color="#38bdf8" />
                          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-primary)" }}>
                            Lienzo de Encuadre Interactivo (Arrastra con el mouse)
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            onClick={() => setActiveCropTarget("camera")}
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "4px",
                              border: activeCropTarget === "camera" ? "1px solid #f43f5e" : "1px solid var(--border-default)",
                              background: activeCropTarget === "camera" ? "rgba(244, 63, 94, 0.2)" : "var(--bg-base)",
                              color: activeCropTarget === "camera" ? "#f43f5e" : "var(--text-muted)",
                              cursor: "pointer",
                            }}
                          >
                            ● Facecam
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCropTarget("gameplay")}
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "4px",
                              border: activeCropTarget === "gameplay" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                              background: activeCropTarget === "gameplay" ? "rgba(59, 130, 246, 0.2)" : "var(--bg-base)",
                              color: activeCropTarget === "gameplay" ? "#3b82f6" : "var(--text-muted)",
                              cursor: "pointer",
                            }}
                          >
                            ● Gameplay
                          </button>
                        </div>
                      </div>

                      <div
                        ref={cropCanvasRef}
                        onPointerDown={handleCanvasPointerDown}
                        style={{
                          position: "relative",
                          width: "100%",
                          aspectRatio: "16 / 9",
                          background: "#18181b",
                          borderRadius: "6px",
                          overflow: "hidden",
                          border: "1px solid #27272a",
                          userSelect: "none",
                          touchAction: "none",
                        }}
                      >
                        {/* Video de Referencia 16:9 */}
                        <video
                          ref={mappingVideoRef}
                          src={`http://127.0.0.1:1422/stream?file=${encodeURIComponent(detail.project.sourcePath)}`}
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "fill",
                            pointerEvents: "none",
                          }}
                        />

                        {/* Recuadro de Gameplay (#3b82f6) */}
                        <div
                          onPointerDown={(e) => handleBoxPointerDown(e, "gameplay", "move")}
                          style={{
                            position: "absolute",
                            left: `${(gameplayCrop.x / 1920) * 100}%`,
                            top: `${(gameplayCrop.y / 1080) * 100}%`,
                            width: `${(gameplayCrop.width / 1920) * 100}%`,
                            height: `${(gameplayCrop.height / 1080) * 100}%`,
                            border: activeCropTarget === "gameplay" ? "2px solid #3b82f6" : "1px dashed rgba(59, 130, 246, 0.7)",
                            background: activeCropTarget === "gameplay" ? "rgba(59, 130, 246, 0.22)" : "rgba(59, 130, 246, 0.10)",
                            boxShadow: activeCropTarget === "gameplay" ? "0 0 10px rgba(59, 130, 246, 0.4)" : "none",
                            cursor: "move",
                            zIndex: activeCropTarget === "gameplay" ? 10 : 5,
                            display: "flex",
                            alignItems: "flex-start",
                            padding: "4px",
                          }}
                        >
                          <span style={{ fontSize: "0.62rem", background: "#3b82f6", color: "#fff", fontWeight: 700, padding: "1px 4px", borderRadius: "2px", pointerEvents: "none" }}>
                            Gameplay {gameplayCrop.width}x{gameplayCrop.height}
                          </span>
                          <div
                            onPointerDown={(e) => handleBoxPointerDown(e, "gameplay", "resize_br")}
                            style={{
                              position: "absolute",
                              right: "-5px",
                              bottom: "-5px",
                              width: "10px",
                              height: "10px",
                              background: "#ffffff",
                              border: "2px solid #3b82f6",
                              borderRadius: "2px",
                              cursor: "nwse-resize",
                            }}
                          />
                        </div>

                        {/* Recuadro de Facecam (#f43f5e) */}
                        <div
                          onPointerDown={(e) => handleBoxPointerDown(e, "camera", "move")}
                          style={{
                            position: "absolute",
                            left: `${(cameraCrop.x / 1920) * 100}%`,
                            top: `${(cameraCrop.y / 1080) * 100}%`,
                            width: `${(cameraCrop.width / 1920) * 100}%`,
                            height: `${(cameraCrop.height / 1080) * 100}%`,
                            border: activeCropTarget === "camera" ? "2px solid #f43f5e" : "1px dashed rgba(244, 63, 94, 0.7)",
                            background: activeCropTarget === "camera" ? "rgba(244, 63, 94, 0.28)" : "rgba(244, 63, 94, 0.12)",
                            boxShadow: activeCropTarget === "camera" ? "0 0 10px rgba(244, 63, 94, 0.45)" : "none",
                            cursor: "move",
                            zIndex: activeCropTarget === "camera" ? 10 : 5,
                            display: "flex",
                            alignItems: "flex-start",
                            padding: "4px",
                          }}
                        >
                          <span style={{ fontSize: "0.62rem", background: "#f43f5e", color: "#fff", fontWeight: 700, padding: "1px 4px", borderRadius: "2px", pointerEvents: "none" }}>
                            Facecam {cameraCrop.width}x{cameraCrop.height}
                          </span>
                          <div
                            onPointerDown={(e) => handleBoxPointerDown(e, "camera", "resize_br")}
                            style={{
                              position: "absolute",
                              right: "-5px",
                              bottom: "-5px",
                              width: "10px",
                              height: "10px",
                              background: "#ffffff",
                              border: "2px solid #f43f5e",
                              borderRadius: "2px",
                              cursor: "nwse-resize",
                            }}
                          />
                        </div>
                      </div>
                      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                        💡 Arrastra cualquier recuadro sobre el video para moverlo. Arrastra el punto blanco de la esquina para redimensionarlo.
                      </span>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f43f5e", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Tv size={14} /> 1. Encuadre de Cámara (Facecam)
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={() => setCameraCrop({ x: 1280, y: 0, width: 640, height: 360 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Sup. Der
                          </button>
                          <button
                            type="button"
                            onClick={() => setCameraCrop({ x: 0, y: 0, width: 640, height: 360 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Sup. Izq
                          </button>
                          <button
                            type="button"
                            onClick={() => setCameraCrop({ x: 1280, y: 720, width: 640, height: 360 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Inf. Der
                          </button>
                          <button
                            type="button"
                            onClick={() => setCameraCrop({ x: 0, y: 720, width: 640, height: 360 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Inf. Izq
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "8px" }}>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Pos X:</span>
                          <input
                            type="number"
                            value={cameraCrop.x}
                            onChange={(e) => setCameraCrop({ ...cameraCrop, x: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Pos Y:</span>
                          <input
                            type="number"
                            value={cameraCrop.y}
                            onChange={(e) => setCameraCrop({ ...cameraCrop, y: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Ancho:</span>
                          <input
                            type="number"
                            value={cameraCrop.width}
                            onChange={(e) => setCameraCrop({ ...cameraCrop, width: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Alto:</span>
                          <input
                            type="number"
                            value={cameraCrop.height}
                            onChange={(e) => setCameraCrop({ ...cameraCrop, height: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#3b82f6", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Film size={14} /> 2. Encuadre de Gameplay
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            onClick={() => setGameplayCrop({ x: 0, y: 0, width: 1920, height: 1080 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            16:9 Completo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const newX = Math.round(Math.max(0, (1920 - gameplayCrop.width) / 2) / 2) * 2;
                              const newY = Math.round(Math.max(0, (1080 - gameplayCrop.height) / 2) / 2) * 2;
                              setGameplayCrop({ ...gameplayCrop, x: newX, y: newY });
                            }}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Centrar
                          </button>
                          <button
                            type="button"
                            onClick={() => setGameplayCrop({ x: 240, y: 0, width: 1440, height: 1080 })}
                            style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                          >
                            Centro de Acción
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginTop: "8px" }}>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Pos X:</span>
                          <input
                            type="number"
                            value={gameplayCrop.x}
                            onChange={(e) => setGameplayCrop({ ...gameplayCrop, x: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Pos Y:</span>
                          <input
                            type="number"
                            value={gameplayCrop.y}
                            onChange={(e) => setGameplayCrop({ ...gameplayCrop, y: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Ancho:</span>
                          <input
                            type="number"
                            value={gameplayCrop.width}
                            onChange={(e) => setGameplayCrop({ ...gameplayCrop, width: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Alto:</span>
                          <input
                            type="number"
                            value={gameplayCrop.height}
                            onChange={(e) => setGameplayCrop({ ...gameplayCrop, height: Number(e.target.value) })}
                            style={{ width: "100%", background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.76rem" }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECCIÓN 3: COMPOSICIÓN LIBRE 2D EN LIENZO VERTICAL 9:16 */}
                    <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Sliders size={14} /> 3. Composición en Lienzo 9:16 (Salida Renderizada 2D)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCamOutWidth(1080);
                            setCamOutHeight(340);
                            setCamOutX(0);
                            setCamOutY(0);
                            setGameOutWidth(1080);
                            setGameOutHeight(720);
                            setGameOutX(0);
                            setGameOutY(360);
                          }}
                          style={{ fontSize: "0.68rem", padding: "2px 6px", background: "var(--bg-base)", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "3px", cursor: "pointer" }}
                        >
                          Restablecer Composición
                        </button>
                      </div>
                      <p style={{ margin: "2px 0 8px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        Controla el tamaño (ancho y alto) y la posición (X e Y) de la cámara y del gameplay en el video final vertical 9:16.
                      </p>

                      {/* Controles Facecam */}
                      <div style={{ marginBottom: "8px", background: "rgba(244, 63, 94, 0.05)", border: "1px solid rgba(244, 63, 94, 0.25)", borderRadius: "6px", padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.74rem", color: "#f43f5e", fontWeight: 700 }}>Facecam (Cámara Streamer)</span>
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => setLockOutputAspectRatio((v) => !v)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "0.65rem",
                                padding: "1px 6px",
                                background: lockOutputAspectRatio ? "rgba(244, 63, 94, 0.16)" : "var(--bg-base)",
                                border: "1px solid rgba(244, 63, 94, 0.55)",
                                color: "#f43f5e",
                                borderRadius: "3px",
                                cursor: "pointer",
                              }}
                              title="Mantener relación de aspecto al redimensionar (Shift invierte temporalmente)"
                            >
                              {lockOutputAspectRatio ? <Lock size={10} /> : <Unlock size={10} />}
                              <span>Proporción</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCamOutX(makeEvenCoord((1080 - camOutWidth) / 2))}
                              style={{ fontSize: "0.65rem", padding: "1px 6px", background: "var(--bg-base)", border: "1px solid #f43f5e", color: "#f43f5e", borderRadius: "3px", cursor: "pointer" }}
                              title="Centrar Facecam horizontalmente"
                            >
                              Centrar X
                            </button>
                            <button
                              type="button"
                              onClick={() => setCamOutY(makeEvenCoord((1920 - camOutHeight) / 2))}
                              style={{ fontSize: "0.65rem", padding: "1px 6px", background: "var(--bg-base)", border: "1px solid #f43f5e", color: "#f43f5e", borderRadius: "3px", cursor: "pointer" }}
                              title="Centrar Facecam verticalmente"
                            >
                              Centrar Y
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Ancho:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{camOutWidth}px</strong>
                            </div>
                            <input
                              type="range"
                              min={180}
                              max={1080}
                              step={10}
                              value={camOutWidth}
                              onChange={(e) => {
                                const w = Number(e.target.value);
                                setCamOutWidth(w);
                                if (camOutX + w > 1080) setCamOutX(makeEvenCoord(1080 - w));
                              }}
                              style={{ width: "100%", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Alto:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{camOutHeight}px</strong>
                            </div>
                            <input
                              type="range"
                              min={180}
                              max={1920}
                              step={10}
                              value={camOutHeight}
                              onChange={(e) => {
                                const h = Number(e.target.value);
                                setCamOutHeight(h);
                                if (camOutY + h > 1920) setCamOutY(makeEvenCoord(1920 - h));
                              }}
                              style={{ width: "100%", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Posición X:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{camOutX}px</strong>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1080 - camOutWidth)}
                              step={10}
                              value={camOutX}
                              onChange={(e) => setCamOutX(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Posición Y:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{camOutY}px</strong>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1920 - camOutHeight)}
                              step={10}
                              value={camOutY}
                              onChange={(e) => setCamOutY(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#f43f5e", cursor: "pointer" }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Controles Gameplay */}
                      <div style={{ background: "rgba(59, 130, 246, 0.05)", border: "1px solid rgba(59, 130, 246, 0.25)", borderRadius: "6px", padding: "8px 10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", gap: "6px" }}>
                          <span style={{ fontSize: "0.74rem", color: "#3b82f6", fontWeight: 700 }}>Gameplay</span>
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick={() => setGameOutX(makeEvenCoord((1080 - gameOutWidth) / 2))}
                              style={{ fontSize: "0.65rem", padding: "1px 6px", background: "var(--bg-base)", border: "1px solid #3b82f6", color: "#3b82f6", borderRadius: "3px", cursor: "pointer" }}
                              title="Centrar Gameplay horizontalmente"
                            >
                              Centrar X
                            </button>
                            <button
                              type="button"
                              onClick={() => setGameOutY(makeEvenCoord((1920 - gameOutHeight) / 2))}
                              style={{ fontSize: "0.65rem", padding: "1px 6px", background: "var(--bg-base)", border: "1px solid #3b82f6", color: "#3b82f6", borderRadius: "3px", cursor: "pointer" }}
                              title="Centrar Gameplay verticalmente"
                            >
                              Centrar Y
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Ancho:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{gameOutWidth}px</strong>
                            </div>
                            <input
                              type="range"
                              min={360}
                              max={1080}
                              step={10}
                              value={gameOutWidth}
                              onChange={(e) => {
                                const w = Number(e.target.value);
                                setGameOutWidth(w);
                                if (gameOutX + w > 1080) setGameOutX(makeEvenCoord(1080 - w));
                              }}
                              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Alto:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{gameOutHeight}px</strong>
                            </div>
                            <input
                              type="range"
                              min={360}
                              max={1920}
                              step={10}
                              value={gameOutHeight}
                              onChange={(e) => {
                                const h = Number(e.target.value);
                                setGameOutHeight(h);
                                if (gameOutY + h > 1920) setGameOutY(makeEvenCoord(1920 - h));
                              }}
                              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Posición X:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{gameOutX}px</strong>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1080 - gameOutWidth)}
                              step={10}
                              value={gameOutX}
                              onChange={(e) => setGameOutX(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
                            />
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", marginBottom: "2px" }}>
                              <span style={{ color: "var(--text-muted)" }}>Posición Y:</span>
                              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{gameOutY}px</strong>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, 1920 - gameOutHeight)}
                              step={10}
                              value={gameOutY}
                              onChange={(e) => setGameOutY(Number(e.target.value))}
                              style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "4px" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        💾 Guardado automáticamente para este proyecto gaming.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCameraCrop(defaultCameraCrop);
                          setGameplayCrop(defaultGameplayCrop);
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          fontSize: "0.72rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <RotateCcw size={12} /> Restablecer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PESTAÑA 5: MÚSICA & EXPORTACIÓN AVANZADA */}
            {activeTab === "export" && (
              <div className="studio-tab-pane">
                <div>
                  <h4 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    Música de Fondo & Parámetros de Exportación
                  </h4>
                  <p style={{ margin: "2px 0 0", fontSize: "0.74rem", color: "var(--text-muted)" }}>
                    Personaliza la pista musical, tasa de bits (bitrate), codificación en 2 pases y framerate.
                  </p>
                </div>

                {/* SECCIÓN MÚSICA DE FONDO (DRAG & DROP) */}
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    marginTop: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Music size={14} color="#ec4899" /> Música de Fondo (BGM)
                    </span>
                    {(bgmPath || bgmBlobUrl) && (
                      <span style={{ fontSize: "0.68rem", color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        Pista Activa
                      </span>
                    )}
                  </div>

                  {(bgmPath || bgmBlobUrl) ? (
                    <div
                      style={{
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "6px",
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <Volume2 size={16} color="#ec4899" />
                        <span style={{ fontSize: "0.78rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={bgmPath || bgmFileName}>
                          {bgmFileName || bgmPath}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBgmPath(null);
                          setBgmBlobUrl(null);
                          setBgmFileName("");
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "2px 6px",
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={handleAudioDrop}
                      onClick={handleSelectAudioFile}
                      style={{
                        border: "1px dashed var(--border-default)",
                        borderRadius: "6px",
                        padding: "16px",
                        textAlign: "center",
                        cursor: "pointer",
                        background: "var(--bg-base)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <UploadCloud size={24} style={{ margin: "0 auto 6px", color: "var(--text-muted)" }} />
                      <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        Arrastra aquí tu música (.mp3, .wav, .aac, .m4a)
                      </p>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        o haz clic para explorar en tu equipo
                      </span>
                    </div>
                  )}

                  {/* Slider de Volumen */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                        Volumen de Música:
                      </span>
                      <strong style={{ fontSize: "0.76rem", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                        {bgmVolume}%
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={bgmVolume}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setBgmVolume(val);
                        if (bgmAudioRef.current) {
                          bgmAudioRef.current.volume = Math.max(0, Math.min(1, val / 100));
                        }
                      }}
                      style={{ width: "100%", accentColor: "#ec4899", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      Recomendado 15%: no opaca la voz del creador y se masteriza con limitador digital anti-clipping.
                    </span>
                  </div>

                  {/* Selector de Inicio de Canción (Timeline BGM) */}
                  {(bgmPath || bgmBlobUrl) && (
                    <div style={{ background: "var(--bg-base)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-default)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                          <Clock size={12} color="#ec4899" /> Punto de Inicio de Música (Timeline):
                        </span>
                        <strong style={{ fontSize: "0.76rem", fontFamily: "var(--font-mono)", color: "#ec4899" }}>
                          {bgmStartSec.toFixed(1)}s ({formatTime(bgmStartSec)})
                        </strong>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={180}
                        step={0.5}
                        value={bgmStartSec}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBgmStartSec(val);
                          if (bgmAudioRef.current && videoRef.current) {
                            const offset = Math.max(0, videoRef.current.currentTime - trimStart);
                            bgmAudioRef.current.currentTime = val + offset;
                          }
                        }}
                        style={{ width: "100%", accentColor: "#ec4899", cursor: "pointer" }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                          Ajusta para saltarte la introducción instrumental y sincronizar el drop musical.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!bgmAudioRef.current) return;
                            if (isPlayingBgmPreview) {
                              bgmAudioRef.current.pause();
                              setIsPlayingBgmPreview(false);
                            } else {
                              bgmAudioRef.current.volume = Math.max(0, Math.min(1, bgmVolume / 100));
                              if (bgmAudioRef.current.readyState >= 1) {
                                const offset = videoRef.current ? Math.max(0, videoRef.current.currentTime - trimStart) : 0;
                                bgmAudioRef.current.currentTime = bgmStartSec + offset;
                              }
                              bgmAudioRef.current.play().then(() => setIsPlayingBgmPreview(true)).catch(() => {});
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            background: isPlayingBgmPreview ? "rgba(236, 72, 153, 0.2)" : "var(--bg-surface)",
                            border: isPlayingBgmPreview ? "1px solid #ec4899" : "1px solid var(--border-default)",
                            color: isPlayingBgmPreview ? "#ec4899" : "var(--text-primary)",
                            borderRadius: "4px",
                            padding: "3px 8px",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {isPlayingBgmPreview ? <Pause size={12} /> : <Play size={12} />}
                          <span>{isPlayingBgmPreview ? "Pausar" : "Probar Música"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECCIÓN BITRATE & 2-PASS */}
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "8px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Sliders size={14} color="#3b82f6" /> Tasa de Bits (Bitrate) & Pases
                    </span>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        color: origBitrateMbps ? "#93c5fd" : "var(--text-muted)",
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-default)",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      Original: {origBitrateMbps ? `${origBitrateMbps} Mbps` : "No detectado"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setBitrateMode("recommended")}
                      style={{
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.72rem",
                        fontWeight: bitrateMode === "recommended" ? 700 : 500,
                        border: bitrateMode === "recommended" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                        background: bitrateMode === "recommended" ? "rgba(59, 130, 246, 0.12)" : "var(--bg-base)",
                        color: bitrateMode === "recommended" ? "#3b82f6" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      10 Mbps (TikTok)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBitrateMode("original")}
                      style={{
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.72rem",
                        fontWeight: bitrateMode === "original" ? 700 : 500,
                        border: bitrateMode === "original" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                        background: bitrateMode === "original" ? "rgba(59, 130, 246, 0.12)" : "var(--bg-base)",
                        color: bitrateMode === "original" ? "#3b82f6" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      {origBitrateMbps ? `${origBitrateMbps} Mbps (Original)` : "Original"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBitrateMode("custom")}
                      style={{
                        padding: "6px",
                        borderRadius: "4px",
                        fontSize: "0.72rem",
                        fontWeight: bitrateMode === "custom" ? 700 : 500,
                        border: bitrateMode === "custom" ? "1px solid #3b82f6" : "1px solid var(--border-default)",
                        background: bitrateMode === "custom" ? "rgba(59, 130, 246, 0.12)" : "var(--bg-base)",
                        color: bitrateMode === "custom" ? "#3b82f6" : "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      Personalizado
                    </button>
                  </div>

                  {bitrateMode === "custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>Mbps:</span>
                      <input
                        type="number"
                        min={1}
                        max={80}
                        step={1}
                        value={customBitrateMbps}
                        onChange={(e) => setCustomBitrateMbps(Math.max(1, Math.min(80, Number(e.target.value))))}
                        style={{
                          width: "70px",
                          background: "var(--bg-base)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "4px",
                          color: "var(--text-primary)",
                          padding: "3px 6px",
                          fontSize: "0.76rem",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        ({customBitrateMbps * 1000} kbps)
                      </span>
                    </div>
                  )}

                  {/* Switch 2 Pases */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: bitrateMode === "original" && !origBitrateMbps ? "not-allowed" : "pointer",
                      opacity: bitrateMode === "original" && !origBitrateMbps ? 0.55 : 1,
                      fontSize: "0.76rem",
                      color: "var(--text-secondary)",
                      paddingTop: "4px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={twoPass && !(bitrateMode === "original" && !origBitrateMbps)}
                      disabled={bitrateMode === "original" && !origBitrateMbps}
                      onChange={(e) => setTwoPass(e.target.checked)}
                      style={{ cursor: bitrateMode === "original" && !origBitrateMbps ? "not-allowed" : "pointer" }}
                    />
                    <span>Codificación en 2 Pases (Estilo Premiere Pro - VBR 2-Pass)</span>
                  </label>

                  {bitrateMode === "original" && !origBitrateMbps && (
                    <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                      Sin metadata de bitrate original: se usará calidad adaptativa (-crf 19).
                    </span>
                  )}

                  {twoPass && !(bitrateMode === "original" && !origBitrateMbps) && (
                    <div
                      style={{
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                          Rango VBR 2-Pass (Mbps)
                        </span>
                        {origBitrateMbps && (
                          <button
                            type="button"
                            onClick={() => {
                              const ref = Math.max(1, Math.min(80, Math.round(origBitrateMbps)));
                              setBitrateMode("custom");
                              setCustomBitrateMbps(ref);
                              setVbrMinMbps(Math.max(1, Math.round(ref * 0.6)));
                              setVbrMaxMbps(Math.min(80, Math.round(ref * 1.4)));
                            }}
                            style={{
                              fontSize: "0.65rem",
                              padding: "1px 6px",
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-default)",
                              color: "#93c5fd",
                              borderRadius: "3px",
                              cursor: "pointer",
                            }}
                          >
                            Ref. Original ({origBitrateMbps} Mbps)
                          </button>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                        {(() => {
                          const effTarget =
                            bitrateMode === "recommended"
                              ? 10
                              : bitrateMode === "original" && origBitrateMbps
                              ? origBitrateMbps
                              : customBitrateMbps;
                          return (
                            <>
                              <div>
                                <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Mínimo</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={80}
                                  step={1}
                                  value={vbrMinMbps}
                                  onChange={(e) => setVbrMinMbps(Number(e.target.value))}
                                  onBlur={() => setVbrMinMbps((v) => Math.max(1, Math.min(effTarget, Number.isFinite(v) && v > 0 ? Math.round(v) : 1)))}
                                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                                />
                              </div>
                              <div>
                                <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Objetivo</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={80}
                                  step={1}
                                  value={effTarget}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(80, Number(e.target.value) || 1));
                                    setBitrateMode("custom");
                                    setCustomBitrateMbps(val);
                                  }}
                                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid #3b82f6", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                                />
                              </div>
                              <div>
                                <span style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Máximo</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={80}
                                  step={1}
                                  value={vbrMaxMbps}
                                  onChange={(e) => setVbrMaxMbps(Number(e.target.value))}
                                  onBlur={() => setVbrMaxMbps((v) => Math.max(effTarget, Math.min(80, Number.isFinite(v) && v > 0 ? Math.round(v) : Math.min(80, Math.round(effTarget * 1.4)))))}
                                  style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "4px", color: "var(--text-primary)", padding: "3px 6px", fontSize: "0.74rem", fontFamily: "var(--font-mono)" }}
                                />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2.5 TIMELINE NLE PERSISTENTE (JUMP CUTS + PISTA BGM) */}
        {!isExported && (
          <div className="clip-studio-timeline-dock">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Scissors size={14} style={{ color: "var(--accent-primary, #6366f1)" }} />
                <span style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Timeline NLE
                </span>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontFamily: "var(--font-mono)",
                    color: totalRemovedDuration > 0 ? "#f43f5e" : "var(--text-muted)",
                    background: "var(--bg-base)",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {totalRemovedDuration > 0
                    ? `-${totalRemovedDuration.toFixed(1)}s | Neto: ${totalKeptDuration.toFixed(1)}s`
                    : `Duración: ${clipDuration.toFixed(1)}s`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  type="button"
                  onClick={handleSplitAtPlayhead}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    border: "1px solid rgba(99, 102, 241, 0.5)",
                    background: "rgba(99, 102, 241, 0.14)",
                    color: "#a5b4fc",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Dividir segmento en el cabezal actual"
                >
                  <Split size={12} />
                  <span>Dividir ({absoluteCurrentTime.toFixed(1)}s)</span>
                </button>
                {selectedSegmentId && segments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleDeleteSegment(selectedSegmentId)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      border: "1px solid rgba(244, 63, 94, 0.45)",
                      background: "rgba(244, 63, 94, 0.12)",
                      color: "#fda4af",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Trash2 size={12} />
                    <span>{segments.find((s) => s.id === selectedSegmentId)?.deleted ? "Restaurar" : "Eliminar tramo"}</span>
                  </button>
                )}
                {segments.length > 1 && (
                  <button
                    type="button"
                    onClick={handleResetSegments}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 7px",
                      borderRadius: "4px",
                      border: "1px solid var(--border-default)",
                      background: "var(--bg-base)",
                      color: "var(--text-secondary)",
                      fontSize: "0.7rem",
                      cursor: "pointer",
                    }}
                    title="Restablecer cortes del timeline"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Pista de Video / Segmentos Click-to-Seek */}
            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (rect.width <= 0 || !videoRef.current) return;
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const newRel = ratio * clipDuration;
                setCurrentPlayTime(newRel);
                videoRef.current.currentTime = trimStart + newRel;
                syncBgm("seek");
                syncBgVideo("seek");
              }}
              style={{
                position: "relative",
                height: "26px",
                background: "var(--bg-base)",
                borderRadius: "5px",
                border: "1px solid var(--border-default)",
                display: "flex",
                overflow: "hidden",
                cursor: "pointer",
              }}
              title="Haz clic para mover el cabezal en el timeline"
            >
              {segments.map((seg) => {
                const segDur = Math.max(0.1, seg.end - seg.start);
                const widthPct = (segDur / Math.max(0.1, clipDuration)) * 100;
                const isSelected = seg.id === selectedSegmentId;
                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSegmentId(seg.id);
                      if (videoRef.current) {
                        const rel = Math.max(0, seg.start - trimStart);
                        setCurrentPlayTime(rel);
                        videoRef.current.currentTime = seg.start;
                        syncBgm("seek");
                        syncBgVideo("seek");
                      }
                    }}
                    style={{
                      width: `${widthPct}%`,
                      height: "100%",
                      background: seg.deleted ? "rgba(244, 63, 94, 0.2)" : isSelected ? "rgba(99, 102, 241, 0.65)" : "rgba(99, 102, 241, 0.38)",
                      borderRight: "1px solid rgba(0, 0, 0, 0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.66rem",
                      fontFamily: "var(--font-mono)",
                      color: seg.deleted ? "#fda4af" : "#eef2ff",
                      textDecoration: seg.deleted ? "line-through" : "none",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {segDur.toFixed(1)}s
                  </div>
                );
              })}
              {/* Cabezal de reproducción */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${Math.max(0, Math.min(100, (currentPlayTime / Math.max(0.1, clipDuration)) * 100))}%`,
                  width: "2px",
                  background: "#ffffff",
                  boxShadow: "0 0 6px rgba(255,255,255,0.9)",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Pista BGM Activa */}
            {(bgmPath || bgmBlobUrl) && (
              <div
                style={{
                  height: "18px",
                  borderRadius: "4px",
                  background: "rgba(236, 72, 153, 0.14)",
                  border: "1px solid rgba(236, 72, 153, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 8px",
                  fontSize: "0.65rem",
                  color: "#f9a8d4",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Music size={10} /> BGM: {(bgmPath ? bgmPath.split(/[\\/]/).pop() : null) || "Pista de audio"}
                </span>
                <span>Vol {bgmVolume}% · Inicio {bgmStartSec.toFixed(1)}s</span>
              </div>
            )}
          </div>
        )}

        {/* 3. FOOTER DEL ESTUDIO */}
        <div className="clip-studio-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <span
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
              }}
            >
              Score IA: {Math.round(candidate.score * 10)}/100
            </span>
            <p
              style={{
                margin: 0,
                fontSize: "0.76rem",
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={candidate.rationale}
            >
              {candidate.rationale}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
            {exportError && (
              <span
                style={{
                  fontSize: "0.76rem",
                  color: "#ef4444",
                  background: "rgba(239, 68, 68, 0.12)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  maxWidth: "240px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={exportError}
              >
                Error: {exportError}
              </span>
            )}
            {isExporting && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "180px", maxWidth: "260px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.74rem" }}>
                  <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {renderProgress?.stage || "Exportando clip..."}
                  </span>
                  <strong style={{ color: "#38bdf8", fontFamily: "var(--font-mono)" }}>
                    {renderProgress ? `${renderProgress.percent}%` : "0%"}
                  </strong>
                </div>
                <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${renderProgress?.percent || 0}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                      transition: "width 0.25s ease",
                      boxShadow: "0 0 8px rgba(56, 189, 248, 0.6)",
                    }}
                  />
                </div>
              </div>
            )}
            {isExporting && (
              <button
                type="button"
                onClick={async () => {
                  isCancellingRef.current = true;
                  try {
                    await invoke("cancel_render");
                  } catch (e) {
                    console.error("Error al cancelar exportación:", e);
                  }
                }}
                style={{
                  minHeight: "36px",
                  padding: "0 12px",
                  fontSize: "0.8rem",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.4)",
                  color: "#ef4444",
                  fontWeight: 700,
                  borderRadius: "6px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                title="Detener inmediatamente el renderizado de FFmpeg"
              >
                <XCircle size={15} />
                <span>Cancelar</span>
              </button>
            )}
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isExporting}
              style={{
                minHeight: "36px",
                padding: "0 16px",
                fontSize: "0.82rem",
                opacity: isExporting ? 0.4 : 1,
                cursor: isExporting ? "not-allowed" : "pointer",
              }}
            >
              Cerrar
            </button>
            {onToggleDismissed && (
              <button
                type="button"
                className="btn-cancel"
                onClick={async () => {
                  try {
                    await onToggleDismissed(candidate.id, true);
                    onClose();
                  } catch (e) {
                    console.error("Error descartando momento:", e);
                  }
                }}
                disabled={isExporting}
                style={{
                  minHeight: "36px",
                  padding: "0 14px",
                  fontSize: "0.82rem",
                  color: "#f87171",
                  borderColor: "rgba(239, 68, 68, 0.35)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: isExporting ? 0.4 : 1,
                  cursor: isExporting ? "not-allowed" : "pointer",
                }}
                title="Descarta este momento para que no aparezca en la lista activa"
              >
                <Trash2 size={14} />
                <span>Descartar Momento</span>
              </button>
            )}
            <button
              type="button"
              className="btn-confirm"
              onClick={async () => {
                const id = candidate.id;
                const activeSubRanges = segments
                  .filter((s) => !s.deleted)
                  .map((s) => ({ start: s.start, end: s.end }));
                setIsExporting(true);
                setExportError(null);
                setRenderProgress({ percent: 0, stage: "Iniciando codificación..." });
                isCancellingRef.current = false;
                try {
                  await onCutCandidate(id, {
                    burnSubtitles,
                    captionStyle,
                    captionPosition,
                    captionColor,
                    captionHighlight,
                    captionLines,
                    captionX,
                    captionY,
                    captionFontSize,
                    captionAlignH,
                    ctaEnabled,
                    ctaText,
                    ctaPosition,
                    ctaAnimation,
                    ctaX,
                    ctaY,
                    ctaScale: ctaScale / 100,
                    aspectRatio: exportAspectRatio,
                    startSec: activeSubRanges[0]?.start ?? trimStart,
                    endSec: activeSubRanges[activeSubRanges.length - 1]?.end ?? trimEnd,
                    subRanges: activeSubRanges.length > 1 ? activeSubRanges : undefined,
                    transition: hasTransition ? "crossfade" : undefined,
                    fps: selectedFps !== "auto" ? Number(selectedFps) : undefined,
                    layout: isEffectiveVertical ? videoLayout : "crop",
                    cameraCrop: videoLayout === "gaming_split" ? { ...cameraCrop, outWidth: camOutWidth, outHeight: camOutHeight, outX: camOutX, outY: camOutY } : undefined,
                    gameplayCrop: videoLayout === "gaming_split" ? { ...gameplayCrop, outWidth: gameOutWidth, outHeight: gameOutHeight, outX: gameOutX, outY: gameOutY } : undefined,
                    bgmPath: bgmPath || undefined,
                    bgmVolume: bgmPath ? bgmVolume / 100 : undefined,
                    bgmStartSec: bgmPath ? bgmStartSec : undefined,
                    targetBitrateK:
                      bitrateMode === "recommended"
                        ? 10000
                        : bitrateMode === "original" && origBitrateMbps
                        ? Math.round(origBitrateMbps * 1000)
                        : bitrateMode === "custom"
                        ? Math.max(1000, Math.round(customBitrateMbps * 1000))
                        : undefined,
                    minBitrateK:
                      twoPass && !(bitrateMode === "original" && !origBitrateMbps)
                        ? Math.max(1000, Math.round(vbrMinMbps * 1000))
                        : undefined,
                    maxBitrateK:
                      twoPass && !(bitrateMode === "original" && !origBitrateMbps)
                        ? Math.max(1000, Math.round(vbrMaxMbps * 1000))
                        : undefined,
                    twoPass: twoPass && !(bitrateMode === "original" && !origBitrateMbps),
                  });
                  bgmAudioRef.current?.pause();
                  setIsPlayingBgmPreview(false);
                  setIsExporting(false);
                  onClose();
                } catch (err: any) {
                  if (isCancellingRef.current) {
                    setExportError("Exportación cancelada.");
                  } else {
                    setExportError(err?.message || String(err));
                  }
                  setIsExporting(false);
                }
              }}
              disabled={isExporting || busy !== "idle"}
              style={{
                minHeight: "36px",
                padding: "0 18px",
                fontSize: "0.82rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                background: isExporting ? "#27272a" : "#fafafa",
                color: isExporting ? "#a1a1aa" : "#09090b",
                border: isExporting ? "1px solid #3f3f46" : "1px solid #fafafa",
                fontWeight: 700,
                borderRadius: "6px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
                cursor: isExporting || busy !== "idle" ? "not-allowed" : "pointer",
                opacity: isExporting || busy !== "idle" ? 0.7 : 1,
              }}
            >
              {isExporting ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Exportando video...</span>
                </>
              ) : (
                <>
                  <Scissors size={15} />
                  <span>Cortar y Exportar Clip</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
