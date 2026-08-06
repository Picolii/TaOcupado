import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

const FLOOD_WINDOW_MS = 6000;
const FLOOD_LIMIT = 5;
const COOLDOWN_MS = 10000;

const FLOOD_MESSAGES = [
  "Calma no clique! O vaso não vai a lugar nenhum.",
  "Isso aí é botão, não tambor. Respira.",
  "Detectamos flood de dedo. O banheiro pede paz.",
  "Você tá fazendo stress test em um vaso sanitário. Sério?",
  "Cada clique seu acorda todas as abas abertas. Tenha misericórdia.",
];

export const PAPER_ORDER: PaperLevel[] = ["cheio", "acabando", "acabou"];

export function nextPaper(level: PaperLevel): PaperLevel {
  const i = PAPER_ORDER.indexOf(level);
  return PAPER_ORDER[(i + 1) % PAPER_ORDER.length]!;
}

/* -------------------------------------------------- localização */

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
  status: "off" | "pedindo" | "perto" | "longe" | "erro";
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
  }, []);

  return useMemo(() => {
    const fenced =
      bathroom?.lat != null && bathroom?.lng != null
        ? { lat: bathroom.lat, lng: bathroom.lng }
        : null;

    if (!fenced)
      return {
        status: "off",
        distance: null,
        coords,
        allowed: true,
        message: "Perímetro do banheiro ainda não definido.",
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
    const radius = bathroom?.radius_m ?? 80;
    return distance <= radius
      ? {
          status: "perto",
          distance,
          coords,
          allowed: true,
          message: `Você está a ${distance} m do banheiro. Liberado.`,
        }
      : {
          status: "longe",
          distance,
          coords,
          allowed: false,
          message: `Você está a ${distance} m do banheiro (limite ${radius} m). De longe não dá palpite.`,
        };
  }, [bathroom?.lat, bathroom?.lng, bathroom?.radius_m, coords, error]);
}

/* -------------------------------------------------- fila */

function getTicket() {
  if (typeof window === "undefined") return "";
  let t = window.localStorage.getItem("tao-ticket");
  if (!t) {
    t = Math.random().toString(36).slice(2, 8).toUpperCase();
    window.localStorage.setItem("tao-ticket", t);
  }
  return t;
}

/* -------------------------------------------------- hook principal */

export function useStalls() {
  const [stalls, setStalls] = useState<Stall[] | null>(null);
  const [bathroom, setBathroom] = useState<BathroomState | null>(null);
  const [queue, setQueue] = useState<QueueTicket[]>([]);
  const [ticket, setTicket] = useState("");
  const [live, setLive] = useState(false);
  const [floodAlert, setFloodAlert] = useState<string | null>(null);
  const [blockNote, setBlockNote] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const cooldownUntil = useRef(0);
  const clicks = useRef<number[]>([]);
  const floodCount = useRef(0);
  const notified = useRef(false);

  useEffect(() => setTicket(getTicket()), []);

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
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  const geo = useGeoGate(bathroom);

  // Contador de espera do bloqueio anti-flood.
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
      // Não sobrescreve o aviso de flood original: entra como nota extra.
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

  const patchStall = (id: string, patch: Partial<Stall>) =>
    setStalls((prev) => (prev ? prev.map((s) => (s.id === id ? { ...s, ...patch } : s)) : prev));

  const actionsAllowed = geo.allowed && !bathroom?.cleaning;

  const toggle = async (stall: Stall) => {
    if (!geo.allowed || bathroom?.cleaning) return;
    if (!guard()) return;
    const next = !stall.occupied;
    const changed_at = new Date().toISOString();
    patchStall(stall.id, { occupied: next, changed_at });
    await supabase.from("stalls").update({ occupied: next, changed_at }).eq("id", stall.id);
  };

  const cyclePaper = async (stall: Stall, roll: 1 | 2) => {
    if (!geo.allowed || bathroom?.cleaning) return;
    if (!guard()) return;
    const key = roll === 1 ? "paper_1" : "paper_2";
    const value = nextPaper(stall[key]);
    patchStall(stall.id, { [key]: value } as Partial<Stall>);
    const patch = roll === 1 ? { paper_1: value as string } : { paper_2: value as string };
    await supabase.from("stalls").update(patch).eq("id", stall.id);
  };

  const toggleCleaning = async () => {
    if (!bathroom) return;
    if (!geo.allowed) return;
    const cleaning = !bathroom.cleaning;
    const patch = {
      cleaning,
      cleaning_since: cleaning ? new Date().toISOString() : null,
      changed_at: new Date().toISOString(),
    };
    setBathroom({ ...bathroom, ...patch });
    await supabase.from("bathroom_state").update(patch).eq("id", "main");
  };

  const setPerimeterHere = async () => {
    if (!geo.coords) return;
    const patch = { lat: geo.coords.lat, lng: geo.coords.lng };
    setBathroom((prev) => (prev ? { ...prev, ...patch } : prev));
    await supabase.from("bathroom_state").update(patch).eq("id", "main");
  };

  const clearPerimeter = async () => {
    setBathroom((prev) => (prev ? { ...prev, lat: null, lng: null } : prev));
    await supabase.from("bathroom_state").update({ lat: null, lng: null }).eq("id", "main");
  };

  /* fila */
  const position = queue.findIndex((q) => q.ticket === ticket);
  const inQueue = position >= 0;

  const joinQueue = async () => {
    if (!ticket || inQueue) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* ignora */
      }
    }
    notified.current = false;
    await supabase.from("queue_tickets").insert({ ticket });
    loadQueue();
  };

  const leaveQueue = async () => {
    if (!ticket) return;
    await supabase.from("queue_tickets").delete().eq("ticket", ticket);
    loadQueue();
  };

  const freeCount = stalls?.filter((s) => !s.occupied).length ?? 0;
  const myTurn = inQueue && position === 0 && freeCount > 0 && !bathroom?.cleaning;

  useEffect(() => {
    if (!myTurn) {
      if (!inQueue) notified.current = false;
      return;
    }
    if (notified.current) return;
    notified.current = true;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("É a sua vez! 🚽", {
        body: "Um vaso liberou e você é o próximo da fila. Corre!",
      });
    }
  }, [myTurn, inQueue]);

  return {
    stalls,
    bathroom,
    live,
    geo,
    actionsAllowed,
    toggle,
    cyclePaper,
    toggleCleaning,
    setPerimeterHere,
    clearPerimeter,
    floodAlert,
    blockNote,
    cooldownLeft,
    blocked: cooldownLeft > 0,
    dismissFlood: () => {
      setFloodAlert(null);
      setBlockNote(null);
    },
    queue,
    ticket,
    inQueue,
    position,
    myTurn,
    joinQueue,
    leaveQueue,
  };
}

/** Ticker que re-renderiza periodicamente para as piadinhas de tempo. */
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
  { min: 5, text: "Jogou um Cemitério direto na base?" },
  { min: 6, text: "Suspeita de scroll infinito em andamento." },
  { min: 8, text: "Deixou a bomba do Esqueleto Gigante?" },
  { min: 10, text: "Alerta de perna dormindo. Envie um resgate." },
  { min: 12, text: "Invocou o Megacavaleiro?" },
  { min: 15, text: "Isso não é mais uma visita, é uma mudança." },
  { min: 18, text: "Dropou uma P.E.K.K.A. aí dentro?" },
  { min: 20, text: "Será que alguém esqueceu de desmarcar? Confere aí." },
  { min: 24, text: "Considerando cobrar aluguel deste box." },
  { min: 27, text: "HEHEHEHAW!" },
  { min: 30, text: "30 minutos. Isso virou esculacho oficial." },
  {
    min: 35,
    text: "Ninguém fica tanto tempo assim: ou esqueceram de desmarcar, ou é grave.",
  },
  {
    min: 45,
    text: "Suspeita de óbito no vaso. Alguém vai lá ver se está tudo bem.",
  },
  {
    min: 60,
    text: "Declarado monumento histórico. Envie uma equipe de resgate.",
  },
];

export function useBusyMood(stall: Stall) {
  // Piadas trocam a cada 5 minutos.
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
