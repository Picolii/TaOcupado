import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QUEUE_STICKERS } from "@/lib/queue-stickers";

export type PaperLevel = "cheio" | "acabando" | "acabou";

export type Stall = {
  id: string;
  label: string;
  occupied: boolean;
  changed_at: string;
  paper_1: PaperLevel;
  paper_2: PaperLevel;
};

export type BathroomState = {
  id: string;
  cleaning: boolean;
  cleaning_since: string | null;
  lat: number | null;
  lng: number | null;
  location_required: boolean;
  poop_rain_enabled: boolean;
  radius_m: number;
  changed_at: string;
};

export type QueueTicket = { id: string; ticket: string; created_at: string };
export type QueueEmote = {
  id: string;
  sticker_url: string;
  created_at: string;
  sender_position: number;
};
export type StallReport = {
  id: string;
  stall_id: string;
  stall_label: string;
  reporter_ticket: string;
  message: string;
  image_data_url: string | null;
  created_at: string;
  updated_at: string | null;
};
export type StallReportComment = {
  id: string;
  report_id: string;
  commenter_ticket: string;
  message: string;
  image_data_url: string | null;
  created_at: string;
};
export type StallReportReaction = {
  id: string;
  report_id: string;
  reactor_ticket: string;
  emoji: string;
  created_at: string;
};
type QueueEmotePayload = {
  id?: string;
  sticker_url?: string;
  created_at?: string;
  sender_position?: number;
};

const FLOOD_WINDOW_MS = 6000;
const FLOOD_LIMIT = 5;
const COOLDOWN_MS = 10000;
const PAPER_DEBOUNCE_MS = 450;
const EMOTE_WINDOW_MS = 9000;
const REPORT_DEBOUNCE_MS = 2500;
const REPORT_LIMIT = 24;
const COMMENT_DEBOUNCE_MS = 1200;
const COMMENT_LIMIT = 120;
const REACTION_LIMIT = 240;
const STALL_REPORT_SELECT =
  "id,stall_id,stall_label,reporter_ticket,message,image_data_url,created_at,updated_at";

export const STALL_REPORT_REACTIONS = [
  "🔥",
  "💀",
  "🤢",
  "🧻",
  "🚨",
  "👏",
  "😱",
  "🤮",
  "😭",
  "🫡",
  "🧼",
  "👀",
  "⚠️",
  "🏆",
] as const;

export const FIXED_BATHROOM_LOCATION = {
  lat: -27.124368,
  lng: -48.604723,
  radius_m: 5,
  label: "Andorinha, Itapema - SC",
};

type BathroomPayload = Omit<BathroomState, "location_required" | "poop_rain_enabled"> &
  Partial<Pick<BathroomState, "location_required" | "poop_rain_enabled">>;

function hasLocationRequiredColumn(row: BathroomPayload | null | undefined) {
  return !!row && Object.prototype.hasOwnProperty.call(row, "location_required");
}

function normalizeBathroomState(row: BathroomPayload | null | undefined): BathroomState | null {
  if (!row) return null;
  const radius_m = row.radius_m ?? FIXED_BATHROOM_LOCATION.radius_m;
  return {
    ...row,
    radius_m,
    location_required: row.location_required ?? radius_m !== 0,
    poop_rain_enabled: row.poop_rain_enabled ?? true,
  };
}

const FLOOD_MESSAGES = [
  "Calma no clique! O vaso não vai a lugar nenhum.",
  "Isso aí é botão, não tambor. Respira.",
  "Detectamos flood de dedo. O banheiro pede paz.",
  "Você está fazendo stress test em um vaso sanitário. Sério?",
  "Cada clique seu acorda todas as abas abertas. Tenha misericórdia.",
];

export const PAPER_ORDER: PaperLevel[] = ["cheio", "acabando", "acabou"];

export function nextPaper(level: PaperLevel): PaperLevel {
  const i = PAPER_ORDER.indexOf(level);
  return PAPER_ORDER[(i + 1) % PAPER_ORDER.length]!;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type GeoGate = {
  status: "desligado" | "pedindo" | "perto" | "longe" | "erro";
  distance: number | null;
  message: string;
  coords: { lat: number; lng: number } | null;
  allowed: boolean;
};

function useGeoGate(bathroom: BathroomState | null): GeoGate {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bathroom?.location_required === false) {
      setError(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este navegador não tem GPS disponível.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => setError("Sem permissão de localização."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [bathroom?.location_required]);

  return useMemo(() => {
    if (bathroom?.location_required === false) {
      return {
        status: "desligado",
        distance: null,
        coords,
        allowed: true,
        message: "Localização desativada pelo ADM.",
      };
    }

    const fenced = {
      lat: bathroom?.lat ?? FIXED_BATHROOM_LOCATION.lat,
      lng: bathroom?.lng ?? FIXED_BATHROOM_LOCATION.lng,
    };

    if (error)
      return {
        status: "erro",
        distance: null,
        coords,
        allowed: false,
        message: `${error} Libere o GPS para poder marcar.`,
      };
    if (!coords)
      return {
        status: "pedindo",
        distance: null,
        coords,
        allowed: false,
        message: "Confirmando se você está no banheiro...",
      };

    const distance = Math.round(haversine(coords, fenced));
    const radius = bathroom?.radius_m ?? FIXED_BATHROOM_LOCATION.radius_m;
    return distance <= radius
      ? {
          status: "perto",
          distance,
          coords,
          allowed: true,
          message: "Você está no banheiro. Liberado.",
        }
      : {
          status: "longe",
          distance,
          coords,
          allowed: false,
          message: "Você está fora do banheiro. De longe não dá palpite.",
        };
  }, [
    bathroom?.lat,
    bathroom?.lng,
    bathroom?.location_required,
    bathroom?.radius_m,
    coords,
    error,
  ]);
}

function getTicket() {
  if (typeof window === "undefined") return "";
  let t = window.localStorage.getItem("tao-ticket");
  if (!t) {
    t = Math.random().toString(36).slice(2, 8).toUpperCase();
    window.localStorage.setItem("tao-ticket", t);
  }
  return t;
}

function getOwnerSecret() {
  if (typeof window === "undefined") return "";
  let secret = window.localStorage.getItem("tao-owner-secret");
  if (!secret) {
    secret =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
            .toString(36)
            .slice(2)}`;
    window.localStorage.setItem("tao-owner-secret", secret);
  }
  return secret;
}

function canUseServiceWorkerNotifications() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" ||
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname))
  );
}

async function getNotificationRegistration() {
  if (!canUseServiceWorkerNotifications()) return null;

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

async function showSystemNotification(title: string, options: NotificationOptions) {
  const notificationOptions: NotificationOptions = {
    icon: "/pwa-icon.svg",
    badge: "/pwa-icon.svg",
    requireInteraction: true,
    silent: false,
    ...options,
    tag: `${options.tag ?? "taocupado"}-${Date.now()}`,
    data: {
      url: "/",
      ...(typeof options.data === "object" && options.data ? options.data : {}),
    },
  };

  try {
    const registration = await getNotificationRegistration();
    if (registration) {
      await registration.showNotification(title, notificationOptions);
      return true;
    }
  } catch {
    /* Fall through to the page Notification API below. */
  }

  try {
    new Notification(title, notificationOptions);
    return true;
  } catch {
    return false;
  }
}

export function useStalls() {
  const [stalls, setStalls] = useState<Stall[] | null>(null);
  const [bathroom, setBathroom] = useState<BathroomState | null>(null);
  const [queue, setQueue] = useState<QueueTicket[]>([]);
  const [queueEmotes, setQueueEmotes] = useState<QueueEmote[]>([]);
  const [reports, setReports] = useState<StallReport[]>([]);
  const [reportComments, setReportComments] = useState<StallReportComment[]>([]);
  const [reportReactions, setReportReactions] = useState<StallReportReaction[]>([]);
  const [reportStatus, setReportStatus] = useState<"idle" | "sent" | "failed">("idle");
  const [ticket, setTicket] = useState("");
  const [ownerSecret, setOwnerSecret] = useState("");
  const [live, setLive] = useState(false);
  const [floodAlert, setFloodAlert] = useState<string | null>(null);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [locationTogglePending, setLocationTogglePending] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "ready" | "sent" | "blocked" | "unsupported" | "failed"
  >("idle");
  const cooldownUntil = useRef(0);
  const clicks = useRef<number[]>([]);
  const paperTouches = useRef<Record<string, number>>({});
  const lastReportAt = useRef(0);
  const lastCommentAt = useRef<Record<string, number>>({});
  const floodCount = useRef(0);
  const notified = useRef(false);
  const liveChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const bathroomRef = useRef<BathroomState | null>(null);
  const pendingLocationRequired = useRef<boolean | null>(null);
  const supportsLocationRequiredColumn = useRef(true);

  useEffect(() => {
    setTicket(getTicket());
    setOwnerSecret(getOwnerSecret());
  }, []);

  useEffect(() => {
    bathroomRef.current = bathroom;
  }, [bathroom]);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      setNotificationStatus("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  const loadQueue = useCallback(async () => {
    const { data } = await supabase.from("queue_tickets").select("*").order("created_at");
    if (data) setQueue(data as QueueTicket[]);
  }, []);

  const loadReports = useCallback(async () => {
    const { data, error } = await supabase
      .from("stall_reports")
      .select(STALL_REPORT_SELECT)
      .order("created_at", { ascending: false })
      .limit(REPORT_LIMIT);
    if (error) {
      console.warn("Não foi possível carregar o mural de ocorrências.", error.message);
      return;
    }
    if (data) setReports(data as StallReport[]);
  }, []);

  const loadReportComments = useCallback(async () => {
    const { data, error } = await supabase
      .from("stall_report_comments")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(COMMENT_LIMIT);
    if (error) {
      console.warn("Não foi possível carregar os comentários do mural.", error.message);
      return;
    }
    if (data) setReportComments(data as StallReportComment[]);
  }, []);

  const loadReportReactions = useCallback(async () => {
    const { data, error } = await supabase
      .from("stall_report_reactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(REACTION_LIMIT);
    if (error) {
      console.warn("Não foi possível carregar as reações do mural.", error.message);
      return;
    }
    if (data) setReportReactions(data as StallReportReaction[]);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("stalls").select("*").order("id"),
        supabase.from("bathroom_state").select("*").eq("id", "main").maybeSingle(),
      ]);
      if (!active) return;
      if (s) setStalls(s as Stall[]);
      if (b) {
        supportsLocationRequiredColumn.current = hasLocationRequiredColumn(b as BathroomPayload);
        setBathroom(normalizeBathroomState(b as BathroomPayload));
      }
      loadQueue();
      loadReports();
      loadReportComments();
      loadReportReactions();
    })();

    const channel = supabase
      .channel("stalls-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stalls" }, (payload) => {
        const row = payload.new as Stall;
        setStalls((prev) => (prev ? prev.map((s) => (s.id === row.id ? row : s)) : prev));
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bathroom_state" },
        (payload) => {
          const row = normalizeBathroomState(payload.new as BathroomPayload);
          if (!row) return;
          if (hasLocationRequiredColumn(payload.new as BathroomPayload)) {
            supportsLocationRequiredColumn.current = true;
          }
          const currentChangedAt = bathroomRef.current?.changed_at;
          if (currentChangedAt && row.changed_at < currentChangedAt) return;
          if (
            pendingLocationRequired.current !== null &&
            row.location_required !== pendingLocationRequired.current
          ) {
            return;
          }
          bathroomRef.current = row;
          setBathroom(row);
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () =>
        loadQueue(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "stall_reports" }, () =>
        loadReports(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stall_report_comments" },
        () => loadReportComments(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stall_report_reactions" },
        () => loadReportReactions(),
      )
      .on("broadcast", { event: "queue-emote" }, ({ payload }: { payload: QueueEmotePayload }) => {
        if (!payload.sticker_url) return;
        if (!QUEUE_STICKERS.includes(payload.sticker_url as (typeof QUEUE_STICKERS)[number])) {
          return;
        }
        const senderPosition =
          typeof payload.sender_position === "number" && Number.isFinite(payload.sender_position)
            ? Math.max(0, Math.floor(payload.sender_position))
            : 0;
        const row: QueueEmote = {
          id: payload.id ?? `remote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          sticker_url: payload.sticker_url,
          created_at: payload.created_at ?? new Date().toISOString(),
          sender_position: senderPosition,
        };
        setQueueEmotes((prev) => [...prev.filter((emote) => emote.id !== row.id), row]);
      })
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });
    liveChannel.current = channel;

    return () => {
      active = false;
      liveChannel.current = null;
      supabase.removeChannel(channel);
    };
  }, [loadQueue, loadReportComments, loadReportReactions, loadReports]);

  const geo = useGeoGate(bathroom);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left === 0) {
        setBlockNote(null);
        setFloodAlert(null);
      }
    }, 250);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  const guard = () => {
    const now = Date.now();

    if (now < cooldownUntil.current) {
      setBlockNote("Bloqueado por flood. Espere o contador zerar antes de tocar de novo.");
      return false;
    }

    clicks.current = [...clicks.current, now].filter((t) => now - t < FLOOD_WINDOW_MS);
    if (clicks.current.length >= FLOOD_LIMIT) {
      const msg = FLOOD_MESSAGES[floodCount.current % FLOOD_MESSAGES.length] ?? FLOOD_MESSAGES[0]!;
      floodCount.current += 1;
      clicks.current = [];
      setFloodAlert(msg);
      setBlockNote(null);
      cooldownUntil.current = now + COOLDOWN_MS;
      setCooldownLeft(Math.ceil(COOLDOWN_MS / 1000));
      return false;
    }
    return true;
  };

  const paperGuard = (stallId: string, roll: 1 | 2) => {
    const now = Date.now();
    const key = `${stallId}:${roll}`;
    if (now - (paperTouches.current[key] ?? 0) < PAPER_DEBOUNCE_MS) return false;
    paperTouches.current[key] = now;
    return true;
  };

  const patchStall = (id: string, patch: Partial<Stall>) =>
    setStalls((prev) => (prev ? prev.map((s) => (s.id === id ? { ...s, ...patch } : s)) : prev));

  const actionsAllowed = geo.allowed && !bathroom?.cleaning;

  const toggle = async (stall: Stall, admin = false) => {
    if (!admin) {
      if (!geo.allowed || bathroom?.cleaning) return;
      if (!guard()) return;
    }
    const next = !stall.occupied;
    const changed_at = new Date().toISOString();
    patchStall(stall.id, { occupied: next, changed_at });
    await supabase.from("stalls").update({ occupied: next, changed_at }).eq("id", stall.id);
  };

  const cyclePaper = async (stall: Stall, roll: 1 | 2, admin = false) => {
    if (!admin) {
      if (!geo.allowed || bathroom?.cleaning) return;
      if (!paperGuard(stall.id, roll)) return;
    }
    const key = roll === 1 ? "paper_1" : "paper_2";
    const value = nextPaper(stall[key]);
    patchStall(stall.id, { [key]: value } as Partial<Stall>);
    const patch = roll === 1 ? { paper_1: value as string } : { paper_2: value as string };
    await supabase.from("stalls").update(patch).eq("id", stall.id);
  };

  const toggleCleaning = async (admin = false) => {
    if (!bathroom) return;
    if (!admin && !geo.allowed) return;
    const cleaning = !bathroom.cleaning;
    const patch = {
      cleaning,
      cleaning_since: cleaning ? new Date().toISOString() : null,
      changed_at: new Date().toISOString(),
    };
    setBathroom({ ...bathroom, ...patch });
    await supabase.from("bathroom_state").update(patch).eq("id", "main");
  };

  const setBathroomLocation = async (lat: number, lng: number, radius_m: number) => {
    if (!bathroom) return;
    const patch = {
      lat,
      lng,
      radius_m,
      changed_at: new Date().toISOString(),
    };
    setBathroom({ ...bathroom, ...patch });
    await supabase.from("bathroom_state").update(patch).eq("id", "main");
  };

  const setPoopRainEnabled = async (poop_rain_enabled?: boolean) => {
    const current = bathroomRef.current;
    if (!current) return false;

    const nextEnabled = poop_rain_enabled ?? !current.poop_rain_enabled;
    const patch = {
      poop_rain_enabled: nextEnabled,
      changed_at: new Date().toISOString(),
    };
    const optimistic = { ...current, ...patch };
    bathroomRef.current = optimistic;
    setBathroom(optimistic);

    const { data, error } = await supabase
      .from("bathroom_state")
      .update(patch)
      .eq("id", "main")
      .select("*")
      .maybeSingle();

    if (error?.code === "42703" || error?.code === "PGRST204") {
      console.warn(
        "A coluna poop_rain_enabled ainda nÃ£o existe no banco. Mantendo ajuste nesta aba.",
        error.message,
      );
      return true;
    }

    if (error) {
      bathroomRef.current = current;
      setBathroom(current);
      console.warn("NÃ£o foi possÃ­vel atualizar a chuva de coco.", error.message);
      return false;
    }

    const saved = normalizeBathroomState(data as BathroomPayload | null) ?? optimistic;
    bathroomRef.current = saved;
    setBathroom(saved);
    return true;
  };

  const updateLocationRequiredFallback = async (
    previous: BathroomState,
    optimistic: BathroomState,
    nextRequired: boolean,
    changed_at: string,
  ) => {
    const fallbackPatch = {
      radius_m: nextRequired ? FIXED_BATHROOM_LOCATION.radius_m : 0,
      changed_at,
    };
    const fallbackOptimistic = { ...optimistic, ...fallbackPatch };
    bathroomRef.current = fallbackOptimistic;
    setBathroom(fallbackOptimistic);

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("bathroom_state")
      .update(fallbackPatch)
      .eq("id", "main")
      .select("*")
      .maybeSingle();

    if (pendingLocationRequired.current === nextRequired) {
      pendingLocationRequired.current = null;
      setLocationTogglePending(false);
    }

    if (fallbackError) {
      bathroomRef.current = previous;
      setBathroom(previous);
      console.warn("Não foi possível atualizar a trava de localização.", fallbackError.message);
      return false;
    }

    const saved =
      normalizeBathroomState(fallbackData as BathroomPayload | null) ?? fallbackOptimistic;
    bathroomRef.current = saved;
    setBathroom(saved);
    return true;
  };

  const setLocationRequired = async (location_required?: boolean) => {
    const current = bathroomRef.current;
    if (!current || locationTogglePending) return false;
    const nextRequired = location_required ?? !current.location_required;
    const changed_at = new Date().toISOString();
    const patch = {
      location_required: nextRequired,
      changed_at,
    };
    const optimistic = { ...current, ...patch };
    pendingLocationRequired.current = nextRequired;
    setLocationTogglePending(true);
    bathroomRef.current = optimistic;
    setBathroom(optimistic);

    if (!supportsLocationRequiredColumn.current) {
      const saved = await updateLocationRequiredFallback(
        current,
        optimistic,
        nextRequired,
        changed_at,
      );
      return saved;
    }

    const { data, error } = await supabase
      .from("bathroom_state")
      .update(patch)
      .eq("id", "main")
      .select("*")
      .maybeSingle();

    if (error?.code === "42703" || error?.code === "PGRST204") {
      supportsLocationRequiredColumn.current = false;
      return updateLocationRequiredFallback(current, optimistic, nextRequired, changed_at);
    }

    if (pendingLocationRequired.current === nextRequired) {
      pendingLocationRequired.current = null;
      setLocationTogglePending(false);
    }

    if (error) {
      bathroomRef.current = current;
      setBathroom(current);
      console.warn("Não foi possível atualizar a trava de localização.", error.message);
      return false;
    }

    const saved = normalizeBathroomState(data as BathroomPayload | null) ?? optimistic;
    bathroomRef.current = saved;
    setBathroom(saved);
    return true;
  };

  const setBathroomLocationHere = async () => {
    if (!geo.coords) return;
    await setBathroomLocation(
      geo.coords.lat,
      geo.coords.lng,
      bathroom?.radius_m ?? FIXED_BATHROOM_LOCATION.radius_m,
    );
  };

  const requestQueueNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      setNotificationStatus("unsupported");
      return "unsupported" as const;
    }
    await getNotificationRegistration();
    if (Notification.permission === "default") {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        setNotificationStatus(permission === "granted" ? "ready" : "blocked");
        return permission;
      } catch {
        setNotificationPermission(Notification.permission);
        setNotificationStatus(Notification.permission === "granted" ? "ready" : "blocked");
        return Notification.permission;
      }
    }
    setNotificationPermission(Notification.permission);
    setNotificationStatus(Notification.permission === "granted" ? "ready" : "blocked");
    return Notification.permission;
  }, []);

  const notifyMyTurn = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      setNotificationStatus("unsupported");
      return false;
    }
    setNotificationPermission(Notification.permission);
    if (Notification.permission !== "granted") {
      setNotificationStatus("blocked");
      return false;
    }

    const sent = await showSystemNotification("É a sua vez!", {
      body: "Um vaso liberou e você é o próximo da fila.",
      renotify: true,
      tag: "taocupado-fila",
      vibrate: [150, 80, 150],
    });
    setNotificationStatus(sent ? "sent" : "failed");
    return sent;
  }, []);

  const enableQueueNotifications = useCallback(async () => {
    const permission = await requestQueueNotifications();
    if (permission !== "granted") return false;

    const sent = await showSystemNotification("Avisos ativados", {
      body: "Quando chegar sua vez na fila, o aviso aparece aqui.",
      tag: "taocupado-teste",
      vibrate: [120, 60, 120],
    });
    setNotificationStatus(sent ? "sent" : "failed");
    return sent;
  }, [requestQueueNotifications]);

  const testQueueNotification = useCallback(async () => {
    const permission = await requestQueueNotifications();
    if (permission !== "granted") {
      setNotificationStatus(permission === "unsupported" ? "unsupported" : "blocked");
      return false;
    }
    return notifyMyTurn();
  }, [notifyMyTurn, requestQueueNotifications]);

  const verifyAdminPassword = async (password: string) => {
    const { data, error } = await supabase.rpc("verify_admin", { admin_password: password });
    if (error || !data) {
      console.warn("Nao foi possivel liberar o ADM.", error?.message ?? "sem token");
      return null;
    }
    return data;
  };

  const position = queue.findIndex((q) => q.ticket === ticket);
  const inQueue = position >= 0;

  const joinQueue = async () => {
    if (!ticket || inQueue) return;
    await requestQueueNotifications();
    notified.current = false;
    await supabase.from("queue_tickets").insert({ ticket });
    loadQueue();
  };

  const leaveQueue = async () => {
    if (!ticket) return;
    await supabase.from("queue_tickets").delete().eq("ticket", ticket);
    loadQueue();
  };

  const removeQueueTicket = async (ticketId: string) => {
    await supabase.from("queue_tickets").delete().eq("id", ticketId);
    loadQueue();
  };

  const submitStallReport = async (
    stallId: string,
    rawMessage: string,
    imageDataUrl?: string | null,
  ) => {
    const stall = stalls?.find((item) => item.id === stallId);
    const message = rawMessage.replace(/\s+/g, " ").trim();
    const image_data_url = imageDataUrl ?? null;
    if (!stall || !ticket || !ownerSecret || message.length > 220) return false;
    if (message.length < 2 && !image_data_url) return false;

    const now = Date.now();
    if (now - lastReportAt.current < REPORT_DEBOUNCE_MS) return false;
    lastReportAt.current = now;
    setReportStatus("idle");

    const { data, error } = await supabase
      .from("stall_reports")
      .insert({
        stall_id: stall.id,
        stall_label: stall.label,
        reporter_ticket: ticket,
        owner_secret: ownerSecret,
        message,
        image_data_url,
      })
      .select(STALL_REPORT_SELECT)
      .single();

    if (error) {
      setReportStatus("failed");
      console.warn("Não foi possível publicar a ocorrência.", error.message);
      return false;
    }

    if (data) {
      setReports((prev) =>
        [data as StallReport, ...prev.filter((report) => report.id !== data.id)].slice(
          0,
          REPORT_LIMIT,
        ),
      );
    }
    setReportStatus("sent");
    return true;
  };

  const submitStallReportComment = async (
    reportId: string,
    rawMessage: string,
    imageDataUrl?: string | null,
  ) => {
    const message = rawMessage.replace(/\s+/g, " ").trim();
    const image_data_url = imageDataUrl ?? null;
    if (!ticket || !reports.some((report) => report.id === reportId)) return false;
    if (message.length > 180) return false;
    if (message.length < 1 && !image_data_url) return false;

    const now = Date.now();
    if (now - (lastCommentAt.current[reportId] ?? 0) < COMMENT_DEBOUNCE_MS) return false;
    lastCommentAt.current[reportId] = now;

    const { data, error } = await supabase
      .from("stall_report_comments")
      .insert({
        report_id: reportId,
        commenter_ticket: ticket,
        message,
        image_data_url,
      })
      .select("*")
      .single();

    if (error) {
      console.warn("Não foi possível comentar no mural.", error.message);
      return false;
    }

    if (data) {
      setReportComments((prev) =>
        [...prev.filter((comment) => comment.id !== data.id), data as StallReportComment].slice(
          -COMMENT_LIMIT,
        ),
      );
    }
    return true;
  };

  const updateStallReport = async (
    reportId: string,
    rawMessage: string,
    imageDataUrl?: string | null,
    adminToken?: string,
  ) => {
    const report = reports.find((item) => item.id === reportId);
    const message = rawMessage.replace(/\s+/g, " ").trim();
    const image_data_url = imageDataUrl ?? null;
    if (!ownerSecret || !report) return false;
    if (!adminToken && report.reporter_ticket !== ticket) return false;
    if (message.length > 220) return false;
    if (message.length < 2 && !image_data_url) return false;

    const { data, error } = await supabase.rpc("update_stall_report", {
      report_id: reportId,
      actor_owner_secret: ownerSecret,
      admin_token: adminToken ?? "",
      next_message: message,
      next_image_data_url: image_data_url,
    });

    if (error) {
      console.warn("Nao foi possivel editar a ocorrencia.", error.message);
      return false;
    }
    if (!data) return false;

    setReports((prev) => prev.map((item) => (item.id === reportId ? (data as StallReport) : item)));
    return true;
  };

  const removeStallReport = async (reportId: string, adminToken?: string) => {
    const report = reports.find((item) => item.id === reportId);
    if (!ownerSecret || !report) return false;
    if (!adminToken && report.reporter_ticket !== ticket) return false;

    const { data, error } = await supabase.rpc("delete_stall_report", {
      report_id: reportId,
      actor_owner_secret: ownerSecret,
      admin_token: adminToken ?? "",
    });

    if (error) {
      console.warn("Nao foi possivel remover a ocorrencia.", error.message);
      return false;
    }
    if (!data) return false;

    setReports((prev) => prev.filter((item) => item.id !== reportId));
    setReportComments((prev) => prev.filter((comment) => comment.report_id !== reportId));
    setReportReactions((prev) => prev.filter((reaction) => reaction.report_id !== reportId));
    return true;
  };

  const reactToStallReport = async (reportId: string, emoji: string) => {
    if (
      !ticket ||
      !reports.some((report) => report.id === reportId) ||
      !STALL_REPORT_REACTIONS.includes(emoji as (typeof STALL_REPORT_REACTIONS)[number])
    ) {
      return false;
    }

    const { error } = await supabase.from("stall_report_reactions").upsert(
      {
        report_id: reportId,
        reactor_ticket: ticket,
        emoji,
      },
      { onConflict: "report_id,reactor_ticket,emoji", ignoreDuplicates: true },
    );

    if (error) {
      console.warn("Não foi possível reagir ao mural.", error.message);
      return false;
    }

    const optimisticReaction: StallReportReaction = {
      id: `local-${reportId}-${ticket}-${emoji}`,
      report_id: reportId,
      reactor_ticket: ticket,
      emoji,
      created_at: new Date().toISOString(),
    };
    setReportReactions((prev) => {
      const exists = prev.some(
        (reaction) =>
          reaction.report_id === reportId &&
          reaction.reactor_ticket === ticket &&
          reaction.emoji === emoji,
      );
      return exists ? prev : [optimisticReaction, ...prev].slice(0, REACTION_LIMIT);
    });
    return true;
  };

  const sendQueueEmote = async (stickerUrl: string) => {
    if (!inQueue) return false;
    if (!QUEUE_STICKERS.includes(stickerUrl as (typeof QUEUE_STICKERS)[number])) return false;

    const now = Date.now();
    const optimisticEmote: QueueEmote = {
      id: `local-${now}-${Math.random().toString(36).slice(2, 7)}`,
      sticker_url: stickerUrl,
      created_at: new Date(now).toISOString(),
      sender_position: position,
    };
    setQueueEmotes((prev) => [...prev, optimisticEmote]);

    const result = await liveChannel.current?.send({
      type: "broadcast",
      event: "queue-emote",
      payload: {
        id: optimisticEmote.id,
        sticker_url: stickerUrl,
        created_at: optimisticEmote.created_at,
        sender_position: position,
      },
    });
    if (result === "error") console.warn("Não foi possível transmitir o emote da fila.");
    return true;
  };

  useEffect(() => {
    if (queueEmotes.length === 0) return;
    const t = setInterval(() => {
      const cutoff = Date.now() - EMOTE_WINDOW_MS;
      setQueueEmotes((prev) =>
        prev.filter((emote) => new Date(emote.created_at).getTime() >= cutoff),
      );
    }, 1000);
    return () => clearInterval(t);
  }, [queueEmotes.length]);

  const freeCount = stalls?.filter((s) => !s.occupied).length ?? 0;
  const myTurn = inQueue && position === 0 && freeCount > 0 && !bathroom?.cleaning;

  useEffect(() => {
    if (!myTurn) {
      if (!inQueue) notified.current = false;
      return;
    }
    if (notified.current) return;
    notified.current = true;
    notifyMyTurn();
  }, [myTurn, inQueue, notifyMyTurn]);

  return {
    stalls,
    bathroom,
    live,
    geo,
    actionsAllowed,
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
    blocked: cooldownLeft > 0,
    dismissFlood: () => {
      setFloodAlert(null);
      setBlockNote(null);
    },
    queue,
    queueEmotes,
    reports,
    reportComments,
    reportReactions,
    reportStatus,
    reportReactionsList: STALL_REPORT_REACTIONS,
    ticket,
    inQueue,
    position,
    myTurn,
    notificationPermission,
    notificationStatus,
    requestQueueNotifications,
    enableQueueNotifications,
    testQueueNotification,
    verifyAdminPassword,
    joinQueue,
    leaveQueue,
    removeQueueTicket,
    submitStallReport,
    submitStallReportComment,
    updateStallReport,
    removeStallReport,
    reactToStallReport,
    sendQueueEmote,
  };
}

export function useTick(ms = 30000) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

const BUSY_JOKES: { min: number; text: string }[] = [
  { min: 0, text: "Acabou de sentar. Respeite o momento." },
  { min: 1, text: "Em plena reflexão filosófica." },
  { min: 2, text: "Script de evacuação travou no while(true)?" },
  { min: 3, text: "O pacote tá grande demais pro buffer?" },
  { min: 4, text: "Já deu tempo de ler o rótulo do sabonete inteiro." },
  { min: 5, text: "Suspeita de scroll infinito em andamento." },
  { min: 10, text: "Alerta de perna dormindo. Envie um resgate." },
  { min: 15, text: "Isso não é mais uma visita, é uma mudança." },
  { min: 20, text: "Será que alguém esqueceu de desmarcar? Confere aí." },
  { min: 24, text: "Considerando cobrar aluguel deste box." },
  { min: 30, text: "30 minutos. Isso virou esculacho oficial." },
  {
    min: 35,
    text: "Ninguém fica tanto tempo assim: ou esqueceram de desmarcar, ou é grave.",
  },
  {
    min: 45,
    text: "Suspeita de emergência no vaso. Alguém vai lá ver se está tudo bem.",
  },
  {
    min: 60,
    text: "Declarado monumento histórico. Envie uma equipe de resgate.",
  },
];

BUSY_JOKES.push(
  { min: 0, text: "Entrada recente. O sistema segue civilizado." },
  { min: 1, text: "Possível leitura rápida de embalagem em andamento." },
  { min: 2, text: "Primeiros sinais de operação demorada detectados." },
  { min: 3, text: "Sessão já passou do tutorial." },
  { min: 4, text: "Começou o modo concentração suspeita." },
  { min: 5, text: "O box começou a emitir sinais administrativos." },
  { min: 7, text: "A reunião com o vaso já poderia ter ata." },
  { min: 7, text: "Tempo suficiente para rever decisões pessoais." },
  { min: 10, text: "A operação saiu do casual e entrou no corporativo." },
  { min: 12, text: "O vaso pediu atualização de status no Jira." },
  { min: 12, text: "Já cabe uma retrospectiva do sprint intestinal." },
  { min: 15, text: "O box entrou em contrato de permanência mínima." },
  { min: 18, text: "A porta deveria cobrar condomínio." },
  { min: 18, text: "O silêncio ficou juridicamente preocupante." },
  { min: 20, text: "O sistema considera enviar uma equipe de auditoria." },
  { min: 24, text: "O vaso já reconhece o usuário pelo CPF emocional." },
  { min: 28, text: "O banheiro mudou de status para novela das nove." },
  { min: 28, text: "A descarga está olhando para o relógio." },
  { min: 30, text: "A permanência passou do aceitável para o lendário." },
  { min: 32, text: "O box abriu chamado para entender o que está acontecendo." },
  { min: 32, text: "Isso deixou de ser necessidade e virou projeto." },
  { min: 35, text: "O RH do banheiro abriu investigação interna." },
  { min: 38, text: "A ocupação passou no compliance por pura teimosia." },
  { min: 38, text: "A pia está evitando contato visual." },
  { min: 40, text: "O box entrou em modo documentário investigativo." },
  { min: 40, text: "Já tem gente chamando isso de patrimônio local." },
  { min: 45, text: "O ocupante virou entidade administrativa do banheiro." },
  { min: 48, text: "A porta pediu demissão e ninguém julgou." },
  { min: 48, text: "O app recomenda verificar sinais vitais e dignidade." },
  { min: 50, text: "A fila já formou uma comissão parlamentar de inquérito." },
  { min: 50, text: "O vaso pediu férias depois dessa." },
  { min: 55, text: "A situação saiu do banheiro e entrou para a mitologia da firma." },
  { min: 55, text: "O tempo aqui já é medido em eras sanitárias." },
  { min: 60, text: "Uma hora. O botão de ocupado precisa de terapia." },
  { min: 65, text: "A descarga está negociando termos de rendição." },
  { min: 65, text: "O banheiro já considera isso uma ocupação hostil." },
  { min: 70, text: "O box adquiriu CEP próprio." },
  { min: 70, text: "A ocupação já tem lore, trilha sonora e testemunhas." },
  { min: 80, text: "O banheiro protocolou pedido de habeas corpus." },
  { min: 80, text: "Alguém verifica se isso ainda é uso ou posse." },
  { min: 90, text: "90 minutos. O vaso deixou de ser móvel e virou residência." },
  { min: 90, text: "Isso já tem cara de franquia, temporada e spin-off." },
  { min: 105, text: "O app recomenda água, coragem e uma conversa franca." },
  { min: 105, text: "A ocupação atingiu status de evento corporativo." },
  { min: 120, text: "Duas horas. Isso já precisa de ata, testemunha e perícia." },
  { min: 120, text: "O banheiro não sabe mais quem está usando quem." },
);

export function useBusyMood(stall: Stall) {
  const n = useTick(60 * 1000);
  return useMemo(() => {
    const mins = Math.max(
      0,
      Math.floor((Date.now() - new Date(stall.changed_at).getTime()) / 60000),
    );
    const pool = BUSY_JOKES.filter((j) => mins >= j.min);
    const currentMin = pool.reduce((max, jokeOption) => Math.max(max, jokeOption.min), 0);
    const currentPool = pool.filter((jokeOption) => jokeOption.min === currentMin);
    const timeBucket = Math.floor(mins / 2);
    const seed = Array.from(
      `${stall.id}:${stall.changed_at}:${currentMin}:${timeBucket}:${n}`,
    ).reduce((total, char) => (total * 31 + char.charCodeAt(0)) | 0, 0);
    const joke = currentPool[Math.abs(seed) % currentPool.length] ?? BUSY_JOKES[0]!;
    return {
      mins,
      joke: joke.text,
      stinky: mins >= 5,
      critical: mins >= 15,
      forgotten: mins >= 20,
      roast: mins >= 30,
      dead: mins >= 45,
    };
  }, [stall.changed_at, stall.id, n]);
}
