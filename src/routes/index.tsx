import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUp,
  Bell,
  Brush,
  CloudRain,
  Crosshair,
  Flag,
  Image as ImageIcon,
  Lock,
  MapPin,
  MapPinOff,
  MessageSquare,
  Minimize2,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { QUEUE_STICKERS } from "@/lib/queue-stickers";
import { useStalls, useTick, type Stall } from "@/lib/stalls";
import { useNativeStatusPanel } from "@/lib/native-status-panel";
import { cn } from "@/lib/utils";
import { Badge, FloodAlert, StallCard } from "@/components/stalls-ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tá Ocupado? - Status do banheiro em tempo real" },
      {
        name: "description",
        content:
          "Veja em tempo real se o Vaso 1 e o Vaso 2 estão livres, ocupados, em limpeza ou sem papel.",
      },
      { property: "og:title", content: "Tá Ocupado? - Status do banheiro em tempo real" },
      {
        property: "og:description",
        content: "Painel ao vivo dos boxes, papel higiênico, limpeza e fila de espera.",
      },
    ],
  }),
  component: Index,
});

function iconButtonClass(active = false) {
  return cn(
    "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold uppercase tracking-wide transition-colors",
    active
      ? "bg-free text-background hover:opacity-90"
      : "border border-border bg-card text-muted-foreground hover:text-foreground",
  );
}

function LiveBadge({ live }: { live: boolean }) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold uppercase tracking-wide">
      <span
        className={cn(
          "size-2 rounded-full",
          live ? "animate-pulse bg-free" : "bg-muted-foreground",
        )}
      />
      {live ? "ao vivo" : "conectando"}
    </div>
  );
}

function FloatingStatusBar({ stalls }: { stalls: Stall[] | null | undefined }) {
  const [visible, setVisible] = useState(false);
  const freeCount = stalls?.filter((stall) => !stall.occupied).length ?? 0;

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 280);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!stalls || !visible) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex w-[min(94vw,36rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border/80 bg-card/90 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
        {stalls.map((stall) => (
          <span
            key={stall.id}
            className={cn(
              "inline-flex h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 text-xs font-bold uppercase tracking-wide",
              stall.occupied
                ? "border-busy/45 bg-busy/15 text-busy"
                : "border-free/45 bg-free/15 text-free",
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full shadow-[0_0_14px_currentColor]",
                  stall.occupied ? "bg-busy" : "bg-free",
                )}
              />
              <span className="truncate">{stall.label}</span>
            </span>
            <span className="shrink-0 text-[11px]">{stall.occupied ? "ocupado" : "livre"}</span>
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors",
          freeCount > 0
            ? "border-free/55 bg-free/15 text-free hover:bg-free/25"
            : "border-busy/55 bg-busy/15 text-busy hover:bg-busy/25",
        )}
        aria-label="Voltar ao topo"
        title="Voltar ao topo"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}

function GeoBadge({ status }: { status: ReturnType<typeof useStalls>["geo"]["status"] }) {
  const tone =
    status === "perto" || status === "desligado" ? "free" : status === "pedindo" ? "warn" : "busy";
  const label =
    status === "desligado"
      ? "GPS desligado"
      : status === "perto"
        ? "no banheiro"
        : status === "pedindo"
          ? "checando GPS"
          : "fora do banheiro";

  return (
    <Badge tone={tone}>
      {status === "desligado" ? <MapPinOff className="size-3" /> : <MapPin className="size-3" />}
      {label}
    </Badge>
  );
}

const POOP_RAIN_THRESHOLD_MINUTES = 7;
const POOP_EMOJI = "💩";
const POOP_STORM_LIGHTNING_MINUTES = 6;
const POOP_MAX_DROPS = 54;
const POOP_PILE_ROWS = [
  { count: 18, y: 0, width: 360, size: 38 },
  { count: 15, y: 34, width: 300, size: 37 },
  { count: 12, y: 68, width: 236, size: 36 },
  { count: 8, y: 102, width: 156, size: 34 },
  { count: 5, y: 134, width: 94, size: 32 },
  { count: 2, y: 164, width: 32, size: 30 },
];
const POOP_PILE_CAPACITY = POOP_PILE_ROWS.reduce((sum, row) => sum + row.count, 0);

type PoopDrop = {
  id: number;
  left: number;
  drift: number;
  size: number;
  duration: number;
  spin: number;
  expiresAt: number;
};

type PoopPileEmoji = {
  id: number;
  x: number;
  y: number;
  size: number;
  rotate: number;
  delay: number;
};

function getPoopMinutes(stalls: Stall[] | null | undefined, now = Date.now()) {
  if (!stalls) {
    return { activeCount: 0, overMinutes: 0 };
  }

  return stalls.reduce(
    (total, stall) => {
      if (!stall.occupied) {
        return total;
      }

      const changedAt = new Date(stall.changed_at).getTime();
      if (!Number.isFinite(changedAt)) {
        return total;
      }

      const minutes = Math.max(0, Math.floor((now - changedAt) / 60000));
      const overMinutes =
        minutes >= POOP_RAIN_THRESHOLD_MINUTES ? minutes - POOP_RAIN_THRESHOLD_MINUTES + 1 : 0;

      if (overMinutes === 0) {
        return total;
      }

      return {
        activeCount: total.activeCount + 1,
        overMinutes: total.overMinutes + overMinutes,
      };
    },
    { activeCount: 0, overMinutes: 0 },
  );
}

function makePoopDrop(id: number, boost: number, now = Date.now()): PoopDrop {
  const duration = Math.max(2.2, 4.6 - Math.random() * 0.7 - boost * 0.045);

  return {
    id,
    left: 4 + Math.random() * 92,
    drift: (Math.random() - 0.5) * (70 + boost * 4),
    size: 20 + Math.random() * Math.min(22, 10 + boost * 0.65),
    duration,
    spin: (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 360),
    expiresAt: now + duration * 1000 + 450,
  };
}

function makePoopPileEmoji(id: number, index: number): PoopPileEmoji {
  let remaining = Math.min(index, POOP_PILE_CAPACITY - 1);

  for (const row of POOP_PILE_ROWS) {
    if (remaining >= row.count) {
      remaining -= row.count;
      continue;
    }

    const midpoint = (row.count - 1) / 2;
    const spacing = row.count <= 1 ? 0 : row.width / (row.count - 1);
    const wobble = Math.sin((index + 1) * 1.91) * 8 + (Math.random() - 0.5) * 10;
    const x = (remaining - midpoint) * spacing + wobble;
    const y = row.y + Math.random() * 7;

    return {
      id,
      x,
      y,
      size: row.size + Math.random() * 7,
      rotate: (Math.random() - 0.5) * 28,
      delay: Math.random() * 0.14,
    };
  }

  return {
    id,
    x: (Math.random() - 0.5) * 260,
    y: Math.random() * 24,
    size: 34 + Math.random() * 10,
    rotate: (Math.random() - 0.5) * 30,
    delay: 0,
  };
}

function PoopStorm({ stalls, enabled }: { stalls: Stall[] | null | undefined; enabled: boolean }) {
  useTick(1000);
  const stats = enabled ? getPoopMinutes(stalls) : { activeCount: 0, overMinutes: 0 };
  const active = stats.overMinutes > 0;
  const lightning = stats.overMinutes >= POOP_STORM_LIGHTNING_MINUTES;
  const [drops, setDrops] = useState<PoopDrop[]>([]);
  const [pile, setPile] = useState<PoopPileEmoji[]>([]);
  const [flushing, setFlushing] = useState(false);
  const idRef = useRef(0);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (wasActiveRef.current && !active) {
      setFlushing(true);
      setDrops([]);

      const clearTimer = window.setTimeout(() => {
        setPile([]);
      }, 450);
      const finishTimer = window.setTimeout(() => {
        setFlushing(false);
      }, 1450);

      return () => {
        window.clearTimeout(clearTimer);
        window.clearTimeout(finishTimer);
      };
    }

    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) {
      return;
    }

    wasActiveRef.current = true;
    setFlushing(false);

    const boost = Math.min(34, stats.overMinutes);
    const intervalMs = Math.max(260, 900 - boost * 20 - stats.activeCount * 45);
    const burstSize = Math.min(5, 1 + Math.floor(boost / 7) + stats.activeCount);

    const rain = () => {
      const now = Date.now();
      const dropsToAdd = Array.from({ length: burstSize }, () =>
        makePoopDrop(++idRef.current, boost, now),
      );

      setDrops((current) =>
        [...current.filter((drop) => drop.expiresAt > now), ...dropsToAdd].slice(-POOP_MAX_DROPS),
      );
      setPile((current) => {
        const availableSlots = POOP_PILE_CAPACITY - current.length;

        if (availableSlots <= 0) {
          return current;
        }

        const pileToAdd = Array.from(
          { length: Math.min(availableSlots, Math.max(1, Math.ceil(burstSize / 2))) },
          (_, i) => makePoopPileEmoji(++idRef.current, current.length + i),
        );

        return [...current, ...pileToAdd];
      });
    };

    rain();
    const timer = window.setInterval(rain, intervalMs);

    return () => window.clearInterval(timer);
  }, [active, stats.activeCount, stats.overMinutes]);

  if (!active && !flushing && pile.length === 0 && drops.length === 0) {
    return null;
  }

  return (
    <div className="poop-storm" aria-hidden="true">
      {lightning && (
        <div className="poop-lightning">
          <span className="poop-lightning-bolt poop-lightning-bolt-left" />
          <span className="poop-lightning-bolt poop-lightning-bolt-right" />
          {stats.overMinutes >= 14 && (
            <span className="poop-lightning-bolt poop-lightning-bolt-center" />
          )}
        </div>
      )}

      {drops.map((drop) => (
        <span
          key={drop.id}
          className="poop-rain-drop"
          style={
            {
              "--poop-left": `${drop.left}%`,
              "--poop-drift": `${drop.drift}px`,
              "--poop-size": `${drop.size}px`,
              "--poop-duration": `${drop.duration}s`,
              "--poop-spin": `${drop.spin}deg`,
            } as CSSProperties
          }
        >
          {POOP_EMOJI}
        </span>
      ))}

      <div className={cn("poop-pile", flushing && "poop-pile-flushing")}>
        {pile.map((emoji) => (
          <span
            key={emoji.id}
            className="poop-pile-emoji"
            style={
              {
                "--poop-x": `${emoji.x}px`,
                "--poop-y": `${emoji.y}px`,
                "--poop-size": `${emoji.size}px`,
                "--poop-rotate": `${emoji.rotate}deg`,
                "--poop-delay": `${emoji.delay}s`,
              } as CSSProperties
            }
          >
            {POOP_EMOJI}
          </span>
        ))}
      </div>

      {flushing && (
        <div className="poop-flush">
          <div className="poop-flush-fixture">
            <span className="poop-flush-cord">
              <span className="poop-flush-pull" />
            </span>
            <span className="poop-flush-tank" />
            <span className="poop-flush-bowl">
              <span className="poop-flush-water" />
              <span className="poop-flush-vortex" />
              <span className="poop-flush-vortex poop-flush-vortex-soft" />
            </span>
            <span className="poop-flush-base" />
          </div>
          <span className="poop-flush-splash poop-flush-splash-left" />
          <span className="poop-flush-splash poop-flush-splash-right" />
          <span className="poop-flush-rush" />
        </div>
      )}
    </div>
  );
}

function QueueRail({
  queueLength,
  inQueue,
  position,
  myTurn,
  queueText,
  emotes,
  onToggleQueue,
  onToggleCleaning,
  cleaningDisabled,
  onSendEmote,
}: {
  queueLength: number;
  inQueue: boolean;
  position: number;
  myTurn: boolean;
  queueText: string;
  emotes: ReturnType<typeof useStalls>["queueEmotes"];
  onToggleQueue: () => void;
  onToggleCleaning: () => void;
  cleaningDisabled: boolean;
  onSendEmote: (stickerUrl: string) => void;
}) {
  const spots = Array.from({ length: Math.max(queueLength, inQueue ? position + 1 : 0) });
  const anchorCount = Math.max(spots.length, 1);
  const spotRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [emoteAnchors, setEmoteAnchors] = useState<Record<number, { x: number; y: number }>>({});
  const emoteSeed = (id: string) =>
    Array.from(id).reduce((total, char) => total + char.charCodeAt(0), 0);

  const updateEmoteAnchors = useCallback(() => {
    const next: Record<number, { x: number; y: number }> = {};
    Object.entries(spotRefs.current).forEach(([key, element]) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      next[Number(key)] = {
        x: rect.left + rect.width / 2,
        y: rect.top,
      };
    });
    setEmoteAnchors(next);
  }, []);

  useLayoutEffect(() => {
    updateEmoteAnchors();
    window.addEventListener("resize", updateEmoteAnchors);
    window.addEventListener("scroll", updateEmoteAnchors, true);
    return () => {
      window.removeEventListener("resize", updateEmoteAnchors);
      window.removeEventListener("scroll", updateEmoteAnchors, true);
    };
  }, [spots.length, emotes.length, updateEmoteAnchors]);

  return (
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-lg border border-border/80 bg-background/45 p-3">
      <div className="pointer-events-none fixed inset-0 z-[100] overflow-visible">
        {emotes.map((emote, index) => {
          const senderPosition = Math.min(Math.max(emote.sender_position, 0), anchorCount - 1);
          const anchor = emoteAnchors[senderPosition] ?? {
            x: 72 + senderPosition * 92,
            y: 180,
          };
          const seed = emoteSeed(emote.id);
          return (
            <img
              key={emote.id}
              src={emote.sticker_url}
              alt=""
              className="queue-emote-pop absolute size-24 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
              style={
                {
                  left: `${anchor.x - 48}px`,
                  top: `${anchor.y - 88}px`,
                  "--queue-emote-drift-x": `${((seed + index * 17) % 121) - 60}px`,
                  "--queue-emote-drift-y": `${90 + ((seed + index * 11) % 70)}px`,
                  "--queue-emote-rotate": `${((seed + index * 7) % 61) - 30}deg`,
                  "--queue-emote-scale": `${0.82 + ((seed + index * 3) % 32) / 100}`,
                  "--queue-emote-pop-scale": `${1.08 + ((seed + index * 5) % 24) / 100}`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-display text-2xl leading-none">Fila</h2>
            <p className="text-xs text-muted-foreground">
              {queueLength === 0
                ? "Sem ninguém esperando."
                : myTurn
                  ? "Você está em primeiro."
                  : `${queueLength} lugar${queueLength === 1 ? "" : "es"} ocupado${queueLength === 1 ? "" : "s"}.`}
            </p>
          </div>
          {inQueue && (
            <Badge tone={myTurn ? "free" : "neutral"} pulse={myTurn}>
              {myTurn ? "sua vez" : `${position + 1}o`}
            </Badge>
          )}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onToggleQueue}
            className={cn(iconButtonClass(!inQueue), inQueue && "bg-card")}
          >
            <Bell className="size-4" />
            {inQueue ? `Sair ${queueText}` : "Entrar fila"}
          </button>
          <button
            type="button"
            onClick={onToggleCleaning}
            disabled={cleaningDisabled}
            className={cn(iconButtonClass(), cleaningDisabled && "cursor-not-allowed opacity-50")}
          >
            <Brush className="size-4" />
            Limpeza
          </button>
        </div>
      </div>

      <div
        onScroll={updateEmoteAnchors}
        className="scrollbar-dark relative z-10 mt-3 flex min-h-12 w-full min-w-0 max-w-full items-center gap-2 overflow-x-auto pb-1"
      >
        {spots.length === 0 ? (
          <div className="flex h-12 min-w-full items-center justify-center rounded-lg border border-dashed border-border text-xs font-bold uppercase tracking-wide text-muted-foreground">
            corredor livre
          </div>
        ) : (
          spots.map((_, index) => {
            const mine = inQueue && index === position;
            return (
              <div key={index} className="relative flex shrink-0 items-center gap-2">
                {index > 0 && <span className="h-0.5 w-5 rounded-full bg-border" />}
                <div
                  ref={(element) => {
                    spotRefs.current[index] = element;
                  }}
                  className={cn(
                    "flex h-12 w-16 flex-col items-center justify-center rounded-lg border text-center",
                    mine && "border-free bg-free/15 text-free",
                    !mine && "border-border bg-card text-muted-foreground",
                  )}
                >
                  <span className="text-display text-2xl leading-none">{index + 1}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    {mine ? "você" : "anon"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {inQueue && (
        <div className="scrollbar-dark relative z-30 mt-3 flex w-full min-w-0 max-w-full touch-pan-x select-none gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg border border-border/70 bg-card/80 p-2 [-webkit-overflow-scrolling:touch]">
          {QUEUE_STICKERS.map((stickerUrl, index) => (
            <button
              key={stickerUrl}
              type="button"
              onClick={() => onSendEmote(stickerUrl)}
              className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-background/70 transition-transform hover:scale-105 active:scale-95"
              aria-label={`Lançar emote ${index + 1}`}
            >
              <img
                src={stickerUrl}
                alt=""
                className="pointer-events-none size-11 object-contain"
                loading="lazy"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_REPORT_IMAGE_LENGTH = 220000;
const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;

async function imageFileToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Arquivo inválido.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("Imagem muito pesada.");

  const imageUrl = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = reject;
    nextImage.src = imageUrl;
  });

  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Imagem inválida.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(imageUrl);

  for (const quality of [0.68, 0.54, 0.42]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_REPORT_IMAGE_LENGTH) {
      return dataUrl;
    }
  }

  throw new Error("Imagem muito pesada.");
}

function ReportImagePicker({
  imageDataUrl,
  onChange,
  disabled,
  compact = false,
}: {
  imageDataUrl: string | null;
  onChange: (imageDataUrl: string | null) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  const [error, setError] = useState("");

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      onChange(await imageFileToDataUrl(file));
    } catch {
      setError("Imagem grande demais. Tente uma foto mais leve.");
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <ImageIcon className="size-4" />
          Câmera/galeria
          <input
            type="file"
            accept="image/*"
            aria-label="Anexar imagem da câmera ou galeria"
            disabled={disabled}
            onChange={(event) => pickImage(event.target.files?.[0])}
            className="sr-only"
          />
        </label>
        {imageDataUrl && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-busy/50 bg-busy/10 px-3 text-xs font-bold uppercase tracking-wide text-busy transition-colors hover:bg-busy/20"
          >
            <X className="size-4" />
            Remover
          </button>
        )}
        {error && <span className="text-xs font-semibold text-busy">{error}</span>}
      </div>
      {imageDataUrl && (
        <img
          src={imageDataUrl}
          alt=""
          className={cn(
            "w-full rounded-lg border border-border object-cover",
            compact ? "max-h-40" : "max-h-72",
          )}
        />
      )}
    </div>
  );
}

function SpoilerImage({ src, className }: { src: string; className?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => (revealed ? setViewerOpen(true) : setRevealed(true))}
        className={cn(
          "group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-background text-left",
          className,
        )}
        aria-label={revealed ? "Abrir imagem" : "Revelar imagem"}
      >
        <img
          src={src}
          alt=""
          className={cn(
            "w-full object-cover transition duration-300",
            !revealed && "scale-105 blur-xl brightness-75",
          )}
        />
        {!revealed ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/30 px-4 text-center text-xs font-bold uppercase tracking-wide text-foreground backdrop-blur-[1px]">
            Tocar para ver imagem
          </span>
        ) : (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            ampliar
          </span>
        )}
      </button>

      {viewerOpen && (
        <div
          className="fixed inset-0 z-[120] flex cursor-zoom-out items-center justify-center bg-black/90 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de imagem"
          onClick={() => setViewerOpen(false)}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerOpen(false);
            }}
            className="absolute right-3 top-3 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white transition-colors hover:bg-white/10"
            aria-label="Fechar imagem"
          >
            <X className="size-5" />
          </button>
          <img
            src={src}
            alt=""
            onClick={(event) => event.stopPropagation()}
            className="max-h-[92vh] max-w-[96vw] cursor-default rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

function reporterLabel(ticket: string) {
  return `anon ${ticket.slice(-4).toUpperCase()}`;
}

function formatReportTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportCommentForm({
  reportId,
  disabled,
  onSubmit,
}: {
  reportId: string;
  disabled: boolean;
  onSubmit: ReturnType<typeof useStalls>["submitStallReportComment"];
}) {
  const [message, setMessage] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || pending || (message.trim().length < 1 && !imageDataUrl)) return;
    setPending(true);
    const sent = await onSubmit(reportId, message, imageDataUrl);
    setPending(false);
    if (sent) {
      setMessage("");
      setImageDataUrl(null);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={disabled}
          maxLength={180}
          placeholder="Responder..."
          className={cn(
            "h-9 min-w-0 rounded-lg border border-input bg-card px-3 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-free",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
        <button
          type="submit"
          disabled={disabled || pending || (message.trim().length < 1 && !imageDataUrl)}
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-lg border border-free/60 bg-free/15 text-free transition-colors hover:bg-free/25",
            (disabled || pending || (message.trim().length < 1 && !imageDataUrl)) &&
              "cursor-not-allowed opacity-50",
          )}
          aria-label="Enviar comentário"
        >
          <Send className="size-4" />
        </button>
      </div>
      <ReportImagePicker
        imageDataUrl={imageDataUrl}
        onChange={setImageDataUrl}
        disabled={disabled || pending}
        compact
      />
    </form>
  );
}

function StallReports({
  stalls,
  reports,
  comments,
  reactions,
  reactionOptions,
  reportStatus,
  ticket,
  adminUnlocked,
  adminToken,
  disabled,
  onSubmit,
  onComment,
  onReact,
  onUpdate,
  onRemove,
  className,
}: {
  stalls: ReturnType<typeof useStalls>["stalls"];
  reports: ReturnType<typeof useStalls>["reports"];
  comments: ReturnType<typeof useStalls>["reportComments"];
  reactions: ReturnType<typeof useStalls>["reportReactions"];
  reactionOptions: ReturnType<typeof useStalls>["reportReactionsList"];
  reportStatus: ReturnType<typeof useStalls>["reportStatus"];
  ticket: ReturnType<typeof useStalls>["ticket"];
  adminUnlocked: boolean;
  adminToken: string;
  disabled: boolean;
  onSubmit: ReturnType<typeof useStalls>["submitStallReport"];
  onComment: ReturnType<typeof useStalls>["submitStallReportComment"];
  onReact: ReturnType<typeof useStalls>["reactToStallReport"];
  onUpdate: ReturnType<typeof useStalls>["updateStallReport"];
  onRemove: ReturnType<typeof useStalls>["removeStallReport"];
  className?: string;
}) {
  const [selectedStallId, setSelectedStallId] = useState("");
  const [message, setMessage] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editImageDataUrl, setEditImageDataUrl] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [reactionPickerReportId, setReactionPickerReportId] = useState<string | null>(null);
  const reportsScrollRef = useRef<HTMLElement | null>(null);
  const [reportsScrolled, setReportsScrolled] = useState(false);

  useEffect(() => {
    if (!selectedStallId && stalls?.[0]) setSelectedStallId(stalls[0].id);
  }, [selectedStallId, stalls]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || pending || (message.trim().length < 2 && !imageDataUrl)) return;
    setPending(true);
    const sent = await onSubmit(selectedStallId, message, imageDataUrl);
    setPending(false);
    if (sent) {
      setMessage("");
      setImageDataUrl(null);
    }
  };

  const sendReaction = async (reportId: string, emoji: string) => {
    const reacted = await onReact(reportId, emoji);
    if (reacted) setReactionPickerReportId(null);
  };

  const beginEdit = (report: ReturnType<typeof useStalls>["reports"][number]) => {
    setEditingReportId(report.id);
    setEditMessage(report.message);
    setEditImageDataUrl(report.image_data_url);
  };

  const cancelEdit = () => {
    setEditingReportId(null);
    setEditMessage("");
    setEditImageDataUrl(null);
  };

  const submitEdit = async (
    event: FormEvent,
    report: ReturnType<typeof useStalls>["reports"][number],
  ) => {
    event.preventDefault();
    if (editPending || (editMessage.trim().length < 2 && !editImageDataUrl)) return;
    setEditPending(true);
    const saved = await onUpdate(
      report.id,
      editMessage,
      editImageDataUrl,
      adminUnlocked ? adminToken : undefined,
    );
    setEditPending(false);
    if (saved) cancelEdit();
  };

  const removeReport = async (report: ReturnType<typeof useStalls>["reports"][number]) => {
    const confirmed = window.confirm("Remover este post do mural?");
    if (!confirmed) return;
    await onRemove(report.id, adminUnlocked ? adminToken : undefined);
    if (editingReportId === report.id) cancelEdit();
  };

  const handleReportsScroll = () => {
    setReportsScrolled((reportsScrollRef.current?.scrollTop ?? 0) > 80);
  };

  return (
    <section
      ref={reportsScrollRef}
      onScroll={handleReportsScroll}
      className={cn(
        "scrollbar-dark grid min-w-0 rounded-lg border border-border bg-card/95",
        className,
      )}
    >
      <div className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-3 rounded-t-lg border-b border-border/80 bg-card/95 px-3 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-display text-3xl leading-none">
            <MessageSquare className="size-5 text-free" />
            Mural
          </h2>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {reports.length} registro{reports.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {reportStatus === "sent" && <Badge tone="free">enviado</Badge>}
          {reportStatus === "failed" && <Badge tone="warn">falhou</Badge>}
          {reportsScrolled && (
            <button
              type="button"
              onClick={() => reportsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="hidden size-9 items-center justify-center rounded-lg border border-border bg-background/80 text-muted-foreground transition-colors hover:border-free/70 hover:text-free lg:inline-flex"
              aria-label="Voltar ao topo do mural"
              title="Voltar ao topo"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="mx-3 mt-3 grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          {stalls?.map((stall) => (
            <button
              key={stall.id}
              type="button"
              onClick={() => setSelectedStallId(stall.id)}
              disabled={disabled}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold uppercase tracking-wide transition-colors",
                selectedStallId === stall.id
                  ? "border-free/70 bg-free/15 text-free"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Flag className="size-4" />
              {stall.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={disabled}
            maxLength={220}
            rows={2}
            placeholder="Piso do banheiro está molhado."
            className={cn(
              "min-h-20 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-free",
              disabled && "cursor-not-allowed opacity-50",
            )}
          />
          <button
            type="submit"
            disabled={disabled || pending || (message.trim().length < 2 && !imageDataUrl)}
            className={cn(
              iconButtonClass(true),
              "h-12 sm:h-full sm:min-w-28",
              (disabled || pending || (message.trim().length < 2 && !imageDataUrl)) &&
                "cursor-not-allowed opacity-50",
            )}
          >
            <Send className="size-4" />
            {pending ? "Enviando" : "Enviar"}
          </button>
        </div>
        <ReportImagePicker
          imageDataUrl={imageDataUrl}
          onChange={setImageDataUrl}
          disabled={disabled || pending}
        />
      </form>

      <div className="mx-3 mb-3 grid gap-2">
        {reports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/35 px-3 py-4 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
            mural limpo
          </div>
        ) : (
          reports.map((report) => {
            const reportComments = comments.filter((comment) => comment.report_id === report.id);
            const reportReactions = reactions.filter(
              (reaction) => reaction.report_id === report.id,
            );
            const reactionCounts = reactionOptions
              .map((emoji) => ({
                emoji,
                count: reportReactions.filter((reaction) => reaction.emoji === emoji).length,
              }))
              .filter((reaction) => reaction.count > 0);
            const canManageReport = adminUnlocked || report.reporter_ticket === ticket;
            const isEditing = editingReportId === report.id;
            const reactionPickerOpen = reactionPickerReportId === report.id;
            return (
              <article
                key={report.id}
                className="grid gap-3 rounded-lg border border-border bg-background/45 p-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge tone="neutral">{report.stall_label}</Badge>
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {reporterLabel(report.reporter_ticket)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatReportTime(report.created_at)}
                    </span>
                    {report.updated_at && report.updated_at !== report.created_at && (
                      <span className="text-xs font-semibold text-muted-foreground">editado</span>
                    )}
                  </div>
                  {canManageReport && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (isEditing ? cancelEdit() : beginEdit(report))}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={isEditing ? "Cancelar edicao do post" : "Editar post"}
                        title={isEditing ? "Cancelar" : "Editar"}
                      >
                        {isEditing ? <X className="size-4" /> : <Pencil className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeReport(report)}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-busy/50 bg-busy/10 text-busy transition-colors hover:bg-busy/20"
                        aria-label="Remover post"
                        title="Remover"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <form
                    onSubmit={(event) => submitEdit(event, report)}
                    className="grid gap-2 rounded-lg border border-free/40 bg-free/5 p-2"
                  >
                    <textarea
                      value={editMessage}
                      onChange={(event) => setEditMessage(event.target.value)}
                      disabled={editPending}
                      maxLength={220}
                      rows={2}
                      className={cn(
                        "min-h-20 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-free",
                        editPending && "cursor-not-allowed opacity-50",
                      )}
                    />
                    <ReportImagePicker
                      imageDataUrl={editImageDataUrl}
                      onChange={setEditImageDataUrl}
                      disabled={editPending}
                      compact
                    />
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={editPending}
                        className={cn(iconButtonClass(), editPending && "cursor-not-allowed")}
                      >
                        <X className="size-4" />
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={
                          editPending || (editMessage.trim().length < 2 && !editImageDataUrl)
                        }
                        className={cn(
                          iconButtonClass(true),
                          (editPending || (editMessage.trim().length < 2 && !editImageDataUrl)) &&
                            "cursor-not-allowed opacity-50",
                        )}
                      >
                        <Save className="size-4" />
                        {editPending ? "Salvando" : "Salvar"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {report.message && (
                      <p className="break-words text-sm font-semibold text-foreground">
                        {report.message}
                      </p>
                    )}
                    {report.image_data_url && (
                      <SpoilerImage src={report.image_data_url} className="max-h-96" />
                    )}
                  </>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {reactionCounts.map(({ emoji, count }) => (
                    <span
                      key={emoji}
                      className="inline-flex h-8 min-w-12 items-center justify-center gap-1 rounded-lg border border-free/60 bg-free/15 px-2 text-sm font-bold text-free"
                      aria-label={`${count} reacoes com ${emoji}`}
                    >
                      <span>{emoji}</span>
                      <span className="text-[11px] tabular-nums">{count}</span>
                    </span>
                  ))}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setReactionPickerReportId((current) =>
                          current === report.id ? null : report.id,
                        )
                      }
                      disabled={disabled}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-free/70 hover:bg-free/10 hover:text-free",
                        reactionPickerOpen && "border-free/70 bg-free/15 text-free",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                      aria-label="Adicionar reacao"
                      title="Reagir"
                    >
                      <Plus className="size-4" />
                    </button>

                    {reactionPickerOpen && (
                      <div className="absolute bottom-10 left-0 z-30 grid w-52 grid-cols-7 gap-1 rounded-lg border border-border bg-card p-2 shadow-2xl">
                        {reactionOptions.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => sendReaction(report.id, emoji)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-base transition-colors hover:bg-free/15"
                            aria-label={`Reagir com ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border border-border/70 bg-card/45 p-2">
                  {reportComments.length > 0 && (
                    <div className="grid gap-1">
                      {reportComments.slice(-4).map((comment) => (
                        <div
                          key={comment.id}
                          className="rounded-md bg-background/55 px-2 py-1.5 text-sm"
                        >
                          <span className="mr-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            {reporterLabel(comment.commenter_ticket)}
                          </span>
                          {comment.message && (
                            <span className="break-words font-semibold">{comment.message}</span>
                          )}
                          {comment.image_data_url && (
                            <SpoilerImage src={comment.image_data_url} className="mt-2 max-h-52" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <ReportCommentForm
                    reportId={report.id}
                    disabled={disabled}
                    onSubmit={onComment}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function AdminAccess({
  bathroom,
  stalls,
  queue,
  geo,
  unlocked,
  onUnlockChange,
  onAdminTokenChange,
  toggle,
  toggleCleaning,
  setBathroomLocation,
  setBathroomLocationHere,
  setLocationRequired,
  setPoopRainEnabled,
  locationTogglePending,
  removeQueueTicket,
  testQueueNotification,
  verifyAdminPassword,
  notificationPermission,
  notificationStatus,
}: {
  bathroom: ReturnType<typeof useStalls>["bathroom"];
  stalls: ReturnType<typeof useStalls>["stalls"];
  queue: ReturnType<typeof useStalls>["queue"];
  geo: ReturnType<typeof useStalls>["geo"];
  unlocked: boolean;
  onUnlockChange: (unlocked: boolean) => void;
  onAdminTokenChange: (token: string) => void;
  toggle: ReturnType<typeof useStalls>["toggle"];
  toggleCleaning: (admin?: boolean) => void;
  setBathroomLocation: (lat: number, lng: number, radius_m: number) => void;
  setBathroomLocationHere: () => void;
  setLocationRequired: ReturnType<typeof useStalls>["setLocationRequired"];
  setPoopRainEnabled: ReturnType<typeof useStalls>["setPoopRainEnabled"];
  locationTogglePending: ReturnType<typeof useStalls>["locationTogglePending"];
  removeQueueTicket: ReturnType<typeof useStalls>["removeQueueTicket"];
  testQueueNotification: ReturnType<typeof useStalls>["testQueueNotification"];
  verifyAdminPassword: ReturnType<typeof useStalls>["verifyAdminPassword"];
  notificationPermission: ReturnType<typeof useStalls>["notificationPermission"];
  notificationStatus: ReturnType<typeof useStalls>["notificationStatus"];
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("");

  useEffect(() => {
    setLat(String(bathroom?.lat ?? ""));
    setLng(String(bathroom?.lng ?? ""));
    setRadius(String(bathroom?.radius_m ?? ""));
  }, [bathroom?.lat, bathroom?.lng, bathroom?.radius_m]);

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    const token = await verifyAdminPassword(password);
    if (!token) {
      setError("Senha errada.");
      return;
    }
    setError("");
    setPassword("");
    onAdminTokenChange(token);
    onUnlockChange(true);
    window.sessionStorage.setItem("tao-admin", "1");
    window.sessionStorage.setItem("tao-admin-token", token);
  };

  const lock = () => {
    onUnlockChange(false);
    onAdminTokenChange("");
    window.sessionStorage.removeItem("tao-admin");
    window.sessionStorage.removeItem("tao-admin-token");
  };

  const saveLocation = () => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    const nextRadius = Number(radius);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !Number.isFinite(nextRadius)) {
      setError("Lat, long e raio precisam ser números.");
      return;
    }
    if (nextRadius < 1 || nextRadius > 5) {
      setError("Use um raio entre 1m e 5m.");
      return;
    }
    setError("");
    setBathroomLocation(nextLat, nextLng, Math.round(nextRadius));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Abrir ADM"
        className={cn(
          "fixed bottom-3 right-3 z-40 flex size-5 items-center justify-center rounded-full border border-border/50 bg-card/70 text-muted-foreground opacity-15 transition-opacity hover:opacity-100 focus:opacity-100",
          unlocked && "border-free text-free opacity-80",
        )}
      >
        {unlocked ? <ShieldCheck className="size-3" /> : <Lock className="size-3" />}
      </button>

      {open && (
        <div className="scrollbar-dark fixed bottom-10 right-3 z-40 max-h-[min(82vh,44rem)] w-[min(94vw,34rem)] overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-2xl">
          {!unlocked ? (
            <form onSubmit={unlock} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-display text-2xl leading-none">ADM</h2>
                <Badge tone="neutral">bloqueado</Badge>
              </div>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-free"
                autoFocus
              />
              {error && <p className="text-xs font-semibold text-busy">{error}</p>}
              <button type="submit" className={iconButtonClass(true)}>
                <ShieldCheck className="size-4" />
                Entrar
              </button>
            </form>
          ) : (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-display text-2xl leading-none">ADM</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    <Minimize2 className="size-3" />
                    minimizar
                  </button>
                  <button
                    type="button"
                    onClick={lock}
                    className="text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    sair
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleCleaning(true)}
                  className={iconButtonClass()}
                >
                  <Brush className="size-4" />
                  {bathroom?.cleaning ? "Abrir" : "Limpeza"}
                </button>
                <button
                  type="button"
                  onClick={setBathroomLocationHere}
                  disabled={!geo.coords}
                  className={cn(iconButtonClass(), !geo.coords && "cursor-not-allowed opacity-50")}
                >
                  <Crosshair className="size-4" />
                  GPS aqui
                </button>
                <button
                  type="button"
                  onClick={testQueueNotification}
                  className={cn(iconButtonClass(), "col-span-2")}
                >
                  <Bell className="size-4" />
                  Teste aviso ({notificationStatus}/{notificationPermission})
                </button>
                <button
                  type="button"
                  onClick={() => setLocationRequired()}
                  disabled={locationTogglePending}
                  className={cn(
                    iconButtonClass(bathroom?.location_required === false),
                    "col-span-2",
                    locationTogglePending && "cursor-wait opacity-70",
                  )}
                >
                  {bathroom?.location_required === false ? (
                    <MapPinOff className="size-4" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  {locationTogglePending
                    ? "Salvando GPS"
                    : bathroom?.location_required === false
                      ? "GPS desligado"
                      : "GPS ligado"}
                </button>
                <button
                  type="button"
                  onClick={() => setPoopRainEnabled()}
                  className={cn(
                    iconButtonClass(bathroom?.poop_rain_enabled !== false),
                    "col-span-2",
                  )}
                >
                  <CloudRain className="size-4" />
                  {bathroom?.poop_rain_enabled === false ? "Chuva desligada" : "Chuva ligada"}
                </button>
              </div>

              {stalls && (
                <div className="grid grid-cols-2 gap-2">
                  {stalls.map((stall) => (
                    <button
                      key={stall.id}
                      type="button"
                      onClick={() => toggle(stall, true)}
                      className={cn(
                        "grid rounded-lg border p-2 text-left transition-colors",
                        stall.occupied
                          ? "border-busy/60 bg-busy/12 text-busy"
                          : "border-free/60 bg-free/12 text-free",
                      )}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wide">
                        {stall.label}
                      </span>
                      <span className="text-display text-2xl leading-none">
                        🚽 {stall.occupied ? "Ocupado" : "Livre"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]">
                <label className="grid min-w-0 gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Lat
                  <input
                    value={lat}
                    onChange={(event) => setLat(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-free"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Long
                  <input
                    value={lng}
                    onChange={(event) => setLng(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-free"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Raio
                  <input
                    value={radius}
                    onChange={(event) => setRadius(event.target.value)}
                    className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-free"
                  />
                </label>
              </div>
              {error && <p className="text-xs font-semibold text-busy">{error}</p>}
              <button type="button" onClick={saveLocation} className={iconButtonClass(true)}>
                <Save className="size-4" />
                Salvar perímetro
              </button>

              <div className="rounded-lg border border-border bg-background/40 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-display text-xl leading-none">Fila ADM</h3>
                  <Badge tone="neutral">{queue.length}</Badge>
                </div>
                {queue.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    fila vazia
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {queue.map((queueTicket, index) => (
                      <div
                        key={queueTicket.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border bg-card/70 px-2 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-display text-xl leading-none">#{index + 1} anon</p>
                          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            {new Date(queueTicket.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQueueTicket(queueTicket.id)}
                          className="inline-flex size-9 items-center justify-center rounded-lg border border-busy/50 bg-busy/10 text-busy transition-colors hover:bg-busy/20"
                          aria-label={`Remover posição ${index + 1} da fila`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function CleaningClosed({
  live,
  geo,
  toggleCleaning,
  adminUnlocked,
}: {
  live: boolean;
  geo: ReturnType<typeof useStalls>["geo"];
  toggleCleaning: (admin?: boolean) => void;
  adminUnlocked: boolean;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display text-4xl leading-none sm:text-5xl">Tá ocupado?</h1>
          <p className="text-sm text-muted-foreground">Banheiro temporariamente fechado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:justify-end">
          <GeoBadge status={geo.status} />
          <LiveBadge live={live} />
        </div>
      </header>

      <section className="relative overflow-hidden rounded-lg border border-orange-400/70 bg-orange-400/10 p-4 pb-20 sm:p-6 sm:pb-20">
        <div className="caution-tape absolute inset-x-0 top-0 h-10 border-b border-background/50" />
        <div className="caution-tape absolute inset-x-0 bottom-0 h-10 border-t border-background/50" />

        <div className="relative z-10 mt-14">
          <Badge tone="warn">área interditada</Badge>
          <h2 className="mt-4 text-display text-7xl leading-none text-orange-300 sm:text-8xl">
            Em limpeza
          </h2>
          <p className="mt-3 max-w-xl text-base font-semibold text-orange-100">
            Os boxes ficam ocultos enquanto a limpeza estiver rolando.
          </p>
        </div>

        <div className="relative z-10 mt-6 flex">
          <button
            type="button"
            onClick={() => toggleCleaning(adminUnlocked)}
            disabled={!adminUnlocked && !geo.allowed}
            className={cn(
              iconButtonClass(true),
              "h-13 min-w-64 px-10 text-sm shadow-lg shadow-free/20 sm:h-14 sm:min-w-80 sm:text-base",
              !adminUnlocked && !geo.allowed && "cursor-not-allowed opacity-50",
            )}
          >
            <Brush className="size-5 sm:size-6" />
            Reabrir
          </button>
        </div>
      </section>
    </main>
  );
}

function Index() {
  const {
    stalls,
    bathroom,
    live,
    geo,
    toggle,
    cyclePaper,
    toggleCleaning,
    setBathroomLocation,
    setBathroomLocationHere,
    setLocationRequired,
    setPoopRainEnabled,
    locationTogglePending,
    floodAlert,
    blockNote,
    cooldownLeft,
    blocked,
    dismissFlood,
    queue,
    queueEmotes,
    reports,
    reportComments,
    reportReactions,
    reportReactionsList,
    reportStatus,
    ticket,
    inQueue,
    position,
    myTurn,
    notificationPermission,
    notificationStatus,
    enableQueueNotifications,
    joinQueue,
    leaveQueue,
    removeQueueTicket,
    submitStallReport,
    submitStallReportComment,
    updateStallReport,
    removeStallReport,
    reactToStallReport,
    testQueueNotification,
    verifyAdminPassword,
    sendQueueEmote,
  } = useStalls();
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminToken, setAdminToken] = useState("");

  useEffect(() => {
    const token = window.sessionStorage.getItem("tao-admin-token") ?? "";
    setAdminToken(token);
    setAdminUnlocked(window.sessionStorage.getItem("tao-admin") === "1" && token.length > 0);
  }, []);

  const cleaning = bathroom?.cleaning ?? false;
  const freeCount = stalls?.filter((s) => !s.occupied).length ?? 0;
  const nativeStatusPanel = useNativeStatusPanel(stalls, bathroom, queue.length);
  const locked = !adminUnlocked && (blocked || cleaning || !geo.allowed);
  const queueText = inQueue
    ? myTurn
      ? "Sua vez"
      : `${position + 1}/${queue.length}`
    : `${queue.length} na fila`;

  if (cleaning) {
    return (
      <>
        {floodAlert && (
          <FloodAlert
            message={floodAlert}
            note={blockNote}
            secondsLeft={cooldownLeft}
            onDismiss={dismissFlood}
          />
        )}
        <CleaningClosed
          live={live}
          geo={geo}
          toggleCleaning={toggleCleaning}
          adminUnlocked={adminUnlocked}
        />
        <AdminAccess
          bathroom={bathroom}
          stalls={stalls}
          queue={queue}
          geo={geo}
          unlocked={adminUnlocked}
          onUnlockChange={setAdminUnlocked}
          onAdminTokenChange={setAdminToken}
          toggle={toggle}
          toggleCleaning={toggleCleaning}
          setBathroomLocation={setBathroomLocation}
          setBathroomLocationHere={setBathroomLocationHere}
          setLocationRequired={setLocationRequired}
          setPoopRainEnabled={setPoopRainEnabled}
          locationTogglePending={locationTogglePending}
          removeQueueTicket={removeQueueTicket}
          testQueueNotification={testQueueNotification}
          verifyAdminPassword={verifyAdminPassword}
          notificationPermission={notificationPermission}
          notificationStatus={notificationStatus}
        />
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-5 pb-24 lg:fixed lg:inset-y-0 lg:left-1/2 lg:h-dvh lg:min-h-0 lg:max-w-6xl lg:-translate-x-1/2 lg:overflow-hidden lg:pb-5">
      <PoopStorm stalls={stalls} enabled={bathroom?.poop_rain_enabled !== false} />
      <FloatingStatusBar stalls={stalls} />

      {floodAlert && (
        <FloodAlert
          message={floodAlert}
          note={blockNote}
          secondsLeft={cooldownLeft}
          onDismiss={dismissFlood}
        />
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-display text-4xl leading-none sm:text-5xl">Tá ocupado?</h1>
          <p className="text-sm text-muted-foreground">Painel ao vivo dos boxes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-end sm:justify-end">
          <Badge tone={freeCount === 0 ? "busy" : "free"}>
            {stalls ? `${freeCount}/${stalls.length} livres` : "carregando"}
          </Badge>
          <GeoBadge status={geo.status} />
          {myTurn && (
            <Badge tone="free" pulse>
              sua vez
            </Badge>
          )}
          {notificationPermission === "denied" && <Badge tone="warn">notificação bloqueada</Badge>}
          {notificationStatus === "failed" && <Badge tone="warn">aviso falhou</Badge>}
          {notificationStatus === "sent" && <Badge tone="free">aviso ok</Badge>}
          <LiveBadge live={live} />
        </div>
      </header>

      {(notificationPermission === "default" || nativeStatusPanel.available) && (
        <section className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-border bg-card/95 p-3">
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            {notificationPermission === "default" && (
              <button
                type="button"
                onClick={enableQueueNotifications}
                className={cn(iconButtonClass(), "col-span-2 sm:col-span-1")}
              >
                <Bell className="size-4" />
                Ativar aviso
              </button>
            )}
            {nativeStatusPanel.available && (
              <button
                type="button"
                onClick={
                  nativeStatusPanel.enabled ? nativeStatusPanel.disable : nativeStatusPanel.enable
                }
                className={cn(
                  iconButtonClass(nativeStatusPanel.enabled),
                  "col-span-2 sm:col-span-1",
                )}
              >
                <Bell className="size-4" />
                {nativeStatusPanel.enabled ? "Parar painel" : "Acompanhar"}
              </button>
            )}
          </div>
        </section>
      )}

      {!stalls ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          Carregando status...
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(24rem,1.08fr)]">
          <div className="scrollbar-dark grid min-w-0 gap-3 lg:min-h-0 lg:content-start lg:gap-2 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-2">
              {stalls.map((s) => (
                <StallCard
                  key={s.id}
                  stall={s}
                  blocked={locked}
                  compact
                  onToggle={() => toggle(s, adminUnlocked)}
                  onCyclePaper={(roll) => cyclePaper(s, roll, adminUnlocked)}
                />
              ))}
            </div>

            <QueueRail
              queueLength={queue.length}
              inQueue={inQueue}
              position={position}
              myTurn={myTurn}
              queueText={queueText}
              emotes={queueEmotes}
              onToggleQueue={inQueue ? leaveQueue : joinQueue}
              onToggleCleaning={() => toggleCleaning(adminUnlocked)}
              cleaningDisabled={!adminUnlocked && !geo.allowed}
              onSendEmote={sendQueueEmote}
            />

            {!geo.allowed && (
              <p className="rounded-lg border border-border bg-card/80 px-3 py-2 text-sm text-muted-foreground">
                {geo.message}
              </p>
            )}
            {adminUnlocked && (
              <p className="rounded-lg border border-free/50 bg-free/10 px-3 py-2 text-sm font-semibold text-free">
                ADM ativo: GPS, limpeza e anti-flood não bloqueiam suas marcações.
              </p>
            )}
          </div>

          <StallReports
            stalls={stalls}
            reports={reports}
            comments={reportComments}
            reactions={reportReactions}
            reactionOptions={reportReactionsList}
            reportStatus={reportStatus}
            ticket={ticket}
            adminUnlocked={adminUnlocked}
            adminToken={adminToken}
            disabled={!adminUnlocked && (blocked || !geo.allowed)}
            onSubmit={submitStallReport}
            onComment={submitStallReportComment}
            onReact={reactToStallReport}
            onUpdate={updateStallReport}
            onRemove={removeStallReport}
            className="lg:h-full lg:max-h-full lg:overflow-y-auto lg:overscroll-contain"
          />
        </div>
      )}

      <AdminAccess
        bathroom={bathroom}
        stalls={stalls}
        queue={queue}
        geo={geo}
        unlocked={adminUnlocked}
        onUnlockChange={setAdminUnlocked}
        onAdminTokenChange={setAdminToken}
        toggle={toggle}
        toggleCleaning={toggleCleaning}
        setBathroomLocation={setBathroomLocation}
        setBathroomLocationHere={setBathroomLocationHere}
        setLocationRequired={setLocationRequired}
        setPoopRainEnabled={setPoopRainEnabled}
        locationTogglePending={locationTogglePending}
        removeQueueTicket={removeQueueTicket}
        testQueueNotification={testQueueNotification}
        verifyAdminPassword={verifyAdminPassword}
        notificationPermission={notificationPermission}
        notificationStatus={notificationStatus}
      />
    </main>
  );
}
