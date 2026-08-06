import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Brush,
  Crosshair,
  Download,
  Lock,
  MapPin,
  MapPinOff,
  Minimize2,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  Trash2,
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
import { useInstallPrompt } from "@/lib/pwa";
import { QUEUE_STICKERS } from "@/lib/queue-stickers";
import { useStalls } from "@/lib/stalls";
import { cn } from "@/lib/utils";
import { Badge, FloodAlert, StallCard } from "@/components/stalls-ui";

const ADMIN_PASSWORD = "AchouASenhaTambem?";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ta Ocupado? - Status do banheiro em tempo real" },
      {
        name: "description",
        content:
          "Veja em tempo real se o Vaso 1 e o Vaso 2 estao livres, ocupados, em limpeza ou sem papel.",
      },
      { property: "og:title", content: "Ta Ocupado? - Status do banheiro em tempo real" },
      {
        property: "og:description",
        content: "Painel ao vivo dos boxes, papel higienico, limpeza e fila de espera.",
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

function InstallWidgetButton() {
  const { canInstall, install } = useInstallPrompt();

  if (canInstall) {
    return (
      <button type="button" onClick={install} className={iconButtonClass()}>
        <Download className="size-4" />
        Instalar widget
      </button>
    );
  }

  return (
    <Link to="/widget" className={iconButtonClass()}>
      <MonitorSmartphone className="size-4" />
      Widget
    </Link>
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

function QueueRail({
  queueLength,
  inQueue,
  position,
  myTurn,
  emotes,
  onSendEmote,
}: {
  queueLength: number;
  inQueue: boolean;
  position: number;
  myTurn: boolean;
  emotes: ReturnType<typeof useStalls>["queueEmotes"];
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
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-display text-2xl leading-none">Fila</h2>
          <p className="text-xs text-muted-foreground">
            {queueLength === 0
              ? "Sem ninguem esperando."
              : myTurn
                ? "Voce esta em primeiro."
                : `${queueLength} lugar${queueLength === 1 ? "" : "es"} ocupado${queueLength === 1 ? "" : "s"}.`}
          </p>
        </div>
        {inQueue && (
          <Badge tone={myTurn ? "free" : "neutral"} pulse={myTurn}>
            {myTurn ? "sua vez" : `${position + 1}o`}
          </Badge>
        )}
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
                    {mine ? "voce" : "anon"}
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
              aria-label={`Lancar emote ${index + 1}`}
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

function AdminAccess({
  bathroom,
  stalls,
  queue,
  geo,
  unlocked,
  onUnlockChange,
  toggle,
  toggleCleaning,
  setBathroomLocation,
  setBathroomLocationHere,
  setLocationRequired,
  removeQueueTicket,
  testQueueNotification,
  notificationPermission,
  notificationStatus,
}: {
  bathroom: ReturnType<typeof useStalls>["bathroom"];
  stalls: ReturnType<typeof useStalls>["stalls"];
  queue: ReturnType<typeof useStalls>["queue"];
  geo: ReturnType<typeof useStalls>["geo"];
  unlocked: boolean;
  onUnlockChange: (unlocked: boolean) => void;
  toggle: ReturnType<typeof useStalls>["toggle"];
  toggleCleaning: (admin?: boolean) => void;
  setBathroomLocation: (lat: number, lng: number, radius_m: number) => void;
  setBathroomLocationHere: () => void;
  setLocationRequired: ReturnType<typeof useStalls>["setLocationRequired"];
  removeQueueTicket: ReturnType<typeof useStalls>["removeQueueTicket"];
  testQueueNotification: ReturnType<typeof useStalls>["testQueueNotification"];
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

  const unlock = (event: FormEvent) => {
    event.preventDefault();
    if (password !== ADMIN_PASSWORD) {
      setError("Senha errada.");
      return;
    }
    setError("");
    setPassword("");
    onUnlockChange(true);
    window.sessionStorage.setItem("tao-admin", "1");
  };

  const lock = () => {
    onUnlockChange(false);
    window.sessionStorage.removeItem("tao-admin");
  };

  const saveLocation = () => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    const nextRadius = Number(radius);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng) || !Number.isFinite(nextRadius)) {
      setError("Lat, long e raio precisam ser numeros.");
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
                  onClick={() => setLocationRequired(!(bathroom?.location_required ?? true))}
                  className={cn(
                    iconButtonClass(bathroom?.location_required === false),
                    "col-span-2",
                  )}
                >
                  {bathroom?.location_required === false ? (
                    <MapPinOff className="size-4" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  {bathroom?.location_required === false ? "GPS desligado" : "GPS ligado"}
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
                Salvar perimetro
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
                          aria-label={`Remover posicao ${index + 1} da fila`}
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
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-4xl leading-none sm:text-5xl">Ta ocupado?</h1>
          <p className="text-sm text-muted-foreground">Banheiro temporariamente fechado.</p>
        </div>
        <LiveBadge live={live} />
      </header>

      <section className="relative overflow-hidden rounded-lg border border-orange-400/70 bg-orange-400/10 p-4 pb-20 sm:p-6 sm:pb-20">
        <div className="caution-tape absolute inset-x-0 top-0 h-10 border-b border-background/50" />
        <div className="caution-tape absolute inset-x-0 bottom-0 h-10 border-t border-background/50" />

        <div className="relative z-10 mt-14">
          <Badge tone="warn">area interditada</Badge>
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
    floodAlert,
    blockNote,
    cooldownLeft,
    blocked,
    dismissFlood,
    queue,
    queueEmotes,
    inQueue,
    position,
    myTurn,
    notificationPermission,
    notificationStatus,
    enableQueueNotifications,
    joinQueue,
    leaveQueue,
    removeQueueTicket,
    testQueueNotification,
    sendQueueEmote,
  } = useStalls();
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    setAdminUnlocked(window.sessionStorage.getItem("tao-admin") === "1");
  }, []);

  const cleaning = bathroom?.cleaning ?? false;
  const freeCount = stalls?.filter((s) => !s.occupied).length ?? 0;
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
          toggle={toggle}
          toggleCleaning={toggleCleaning}
          setBathroomLocation={setBathroomLocation}
          setBathroomLocationHere={setBathroomLocationHere}
          setLocationRequired={setLocationRequired}
          removeQueueTicket={removeQueueTicket}
          testQueueNotification={testQueueNotification}
          notificationPermission={notificationPermission}
          notificationStatus={notificationStatus}
        />
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-4 py-5">
      {floodAlert && (
        <FloodAlert
          message={floodAlert}
          note={blockNote}
          secondsLeft={cooldownLeft}
          onDismiss={dismissFlood}
        />
      )}

      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-display text-4xl leading-none sm:text-5xl">Ta ocupado?</h1>
          <p className="text-sm text-muted-foreground">Painel ao vivo dos boxes.</p>
        </div>
        <LiveBadge live={live} />
      </header>

      <section className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-border bg-card/95 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge tone={freeCount === 0 ? "busy" : "free"}>
            {stalls ? `${freeCount}/${stalls.length} livres` : "carregando"}
          </Badge>
          <GeoBadge status={geo.status} />
          {myTurn && (
            <Badge tone="free" pulse>
              sua vez
            </Badge>
          )}
          {notificationPermission === "denied" && <Badge tone="warn">notificacao bloqueada</Badge>}
          {notificationStatus === "failed" && <Badge tone="warn">aviso falhou</Badge>}
          {notificationStatus === "sent" && <Badge tone="free">aviso ok</Badge>}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => toggleCleaning(adminUnlocked)}
            disabled={!adminUnlocked && !geo.allowed}
            className={cn(
              iconButtonClass(),
              !adminUnlocked && !geo.allowed && "cursor-not-allowed opacity-50",
            )}
          >
            <Brush className="size-4" />
            Limpeza
          </button>
          <button
            type="button"
            onClick={inQueue ? leaveQueue : joinQueue}
            className={cn(iconButtonClass(!inQueue), inQueue && "bg-card")}
          >
            <Bell className="size-4" />
            {inQueue ? `Sair ${queueText}` : "Entrar fila"}
          </button>
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
          <InstallWidgetButton />
        </div>

        <div className="min-w-0 lg:col-span-2">
          <QueueRail
            queueLength={queue.length}
            inQueue={inQueue}
            position={position}
            myTurn={myTurn}
            emotes={queueEmotes}
            onSendEmote={sendQueueEmote}
          />
        </div>
      </section>

      {!stalls ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          Carregando status...
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
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
      )}

      {!geo.allowed && (
        <p className="rounded-lg border border-border bg-card/80 px-3 py-2 text-sm text-muted-foreground">
          {geo.message}
        </p>
      )}
      {adminUnlocked && (
        <p className="rounded-lg border border-free/50 bg-free/10 px-3 py-2 text-sm font-semibold text-free">
          ADM ativo: GPS, limpeza e anti-flood nao bloqueiam suas marcacoes.
        </p>
      )}
      <AdminAccess
        bathroom={bathroom}
        stalls={stalls}
        queue={queue}
        geo={geo}
        unlocked={adminUnlocked}
        onUnlockChange={setAdminUnlocked}
        toggle={toggle}
        toggleCleaning={toggleCleaning}
        setBathroomLocation={setBathroomLocation}
        setBathroomLocationHere={setBathroomLocationHere}
        setLocationRequired={setLocationRequired}
        removeQueueTicket={removeQueueTicket}
        testQueueNotification={testQueueNotification}
        notificationPermission={notificationPermission}
        notificationStatus={notificationStatus}
      />
    </main>
  );
}
