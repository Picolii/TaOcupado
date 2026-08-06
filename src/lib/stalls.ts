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

export const FIXED_BATHROOM_LOCATION = {
  lat: -27.124368,
  lng: -48.604723,
  radius_m: 5,
  label: "Andorinha, Itapema - SC",
};

const FLOOD_MESSAGES = [
  "Calma no clique! O vaso nao vai a lugar nenhum.",
  "Isso ai e botao, nao tambor. Respira.",
  "Detectamos flood de dedo. O banheiro pede paz.",
  "Voce esta fazendo stress test em um vaso sanitario. Serio?",
  "Cada clique seu acorda todas as abas abertas. Tenha misericordia.",
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
  status: "pedindo" | "perto" | "longe" | "erro";
  distance: number | null;
  message: string;
  coords: { lat: number; lng: number } | null;
  allowed: boolean;
};

function useGeoGate(bathroom: BathroomState | null): GeoGate {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este navegador nao tem GPS disponivel.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null);
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => setError("Sem permissao de localizacao."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return useMemo(() => {
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
        message: "Confirmando se voce esta no banheiro...",
      };

    const distance = Math.round(haversine(coords, fenced));
    const radius = bathroom?.radius_m ?? FIXED_BATHROOM_LOCATION.radius_m;
    return distance <= radius
      ? {
          status: "perto",
          distance,
          coords,
          allowed: true,
          message: "Voce esta no banheiro. Liberado.",
        }
      : {
          status: "longe",
          distance,
          coords,
          allowed: false,
          message: "Voce esta fora do banheiro. De longe nao da palpite.",
        };
  }, [bathroom?.lat, bathroom?.lng, bathroom?.radius_m, coords, error]);
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
  const [ticket, setTicket] = useState("");
  const [live, setLive] = useState(false);
  const [floodAlert, setFloodAlert] = useState<string | null>(null);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [notificationStatus, setNotificationStatus] = useState<
    "idle" | "ready" | "sent" | "blocked" | "unsupported" | "failed"
  >("idle");
  const cooldownUntil = useRef(0);
  const clicks = useRef<number[]>([]);
  const paperTouches = useRef<Record<string, number>>({});
  const floodCount = useRef(0);
  const notified = useRef(false);
  const liveChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => setTicket(getTicket()), []);

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

  useEffect(() => {
    let active = true;

    (async () => {
      const [{ data: s }, { data: b }] = await Promise.all([
        supabase.from("stalls").select("*").order("id"),
        supabase.from("bathroom_state").select("*").eq("id", "main").maybeSingle(),
      ]);
      if (!active) return;
      if (s) setStalls(s as Stall[]);
      if (b) setBathroom(b as BathroomState);
      loadQueue();
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
        (payload) => setBathroom(payload.new as BathroomState),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () =>
        loadQueue(),
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
  }, [loadQueue]);

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
      setBlockNote("Bloqueado por flood. Espera o contador zerar antes de tocar de novo.");
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

    const sent = await showSystemNotification("E a sua vez!", {
      body: "Um vaso liberou e voce e o proximo da fila.",
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
    if (result === "error") console.warn("Nao foi possivel transmitir o emote da fila.");
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
    ticket,
    inQueue,
    position,
    myTurn,
    notificationPermission,
    notificationStatus,
    requestQueueNotifications,
    enableQueueNotifications,
    testQueueNotification,
    joinQueue,
    leaveQueue,
    removeQueueTicket,
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
  { min: 1, text: "Em plena reflexao filosofica." },
  { min: 2, text: "Script de evacuacao travou no while(true)?" },
  { min: 3, text: "O pacote ta grande demais pro buffer?" },
  { min: 4, text: "Ja deu tempo de ler o rotulo do sabonete inteiro." },
  { min: 5, text: "Suspeita de scroll infinito em andamento." },
  { min: 10, text: "Alerta de perna dormindo. Envie um resgate." },
  { min: 15, text: "Isso nao e mais uma visita, e uma mudanca." },
  { min: 20, text: "Sera que alguem esqueceu de desmarcar? Confere ai." },
  { min: 24, text: "Considerando cobrar aluguel deste box." },
  { min: 30, text: "30 minutos. Isso virou esculacho oficial." },
  {
    min: 35,
    text: "Ninguem fica tanto tempo assim: ou esqueceram de desmarcar, ou e grave.",
  },
  {
    min: 45,
    text: "Suspeita de emergencia no vaso. Alguem vai la ver se esta tudo bem.",
  },
  {
    min: 60,
    text: "Declarado monumento historico. Envie uma equipe de resgate.",
  },
];

export function useBusyMood(stall: Stall) {
  const n = useTick(5 * 60 * 1000);
  return useMemo(() => {
    const mins = Math.max(
      0,
      Math.floor((Date.now() - new Date(stall.changed_at).getTime()) / 60000),
    );
    const pool = BUSY_JOKES.filter((j) => mins >= j.min);
    const joke = pool[n % pool.length] ?? BUSY_JOKES[0]!;
    return {
      mins,
      joke: joke.text,
      stinky: mins >= 5,
      critical: mins >= 15,
      forgotten: mins >= 20,
      roast: mins >= 30,
      dead: mins >= 45,
    };
  }, [stall.changed_at, n]);
}
