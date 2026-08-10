import { useCallback, useEffect, useMemo, useState } from "react";
import type { BathroomState, Stall } from "@/lib/stalls";

const STATUS_CHANNEL_ID = "bathroom-status";
const STORAGE_KEY = "tao-native-status-panel";

type NativeStallStatus = {
  label: string;
  occupied: boolean;
  noPaper: boolean;
};

type NativeStatusPanelPlugin = {
  update(options: {
    cleaning: boolean;
    summary: string;
    footer: string;
    stallOne: NativeStallStatus;
    stallTwo: NativeStallStatus;
  }): Promise<void>;
  cancel(): Promise<void>;
};

async function getNativePlatform() {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.getPlatform();
}

async function getNativeStatusPanelPlugin() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<NativeStatusPanelPlugin>("NativeStatusPanel");
}

async function ensureStatusChannel() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");

  await LocalNotifications.createChannel({
    id: STATUS_CHANNEL_ID,
    name: "Status do banheiro",
    description: "Painel fixo com o status dos vasos.",
    importance: 2,
    visibility: 1,
    lights: false,
    vibration: false,
  });
}

async function requestNotificationPermission() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const next = await LocalNotifications.requestPermissions();
  return next.display === "granted";
}

function toNativeStall(stall: Stall | undefined, index: number): NativeStallStatus {
  return {
    label: stall?.label ?? `Vaso ${index}`,
    occupied: stall?.occupied ?? false,
    noPaper: stall ? stall.paper_1 === "acabou" && stall.paper_2 === "acabou" : false,
  };
}

function getSummary(stalls: Stall[] | null, bathroom: BathroomState | null) {
  if (bathroom?.cleaning) return "Área interditada para limpeza";
  if (!stalls?.length) return "Carregando status ao vivo";

  const freeCount = stalls.filter((stall) => !stall.occupied).length;
  return `${freeCount}/${stalls.length} livres agora`;
}

function getFooter(queueLength: number) {
  return queueLength > 0 ? `Fila: ${queueLength} esperando` : "Fila vazia";
}

async function showStatusNotification(
  stalls: Stall[] | null,
  bathroom: BathroomState | null,
  queueLength: number,
) {
  await ensureStatusChannel();

  const NativeStatusPanel = await getNativeStatusPanelPlugin();
  await NativeStatusPanel.update({
    cleaning: bathroom?.cleaning ?? false,
    summary: getSummary(stalls, bathroom),
    footer: getFooter(queueLength),
    stallOne: toNativeStall(stalls?.[0], 1),
    stallTwo: toNativeStall(stalls?.[1], 2),
  });
}

async function cancelStatusNotification() {
  const NativeStatusPanel = await getNativeStatusPanelPlugin();
  await NativeStatusPanel.cancel();
}

export function useNativeStatusPanel(
  stalls: Stall[] | null,
  bathroom: BathroomState | null,
  queueLength: number,
) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const snapshot = useMemo(
    () => ({ stalls, bathroom, queueLength }),
    [stalls, bathroom, queueLength],
  );

  useEffect(() => {
    let active = true;

    getNativePlatform()
      .then((platform) => {
        if (!active) return;
        setAvailable(platform === "android");
        setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
      })
      .catch(() => {
        if (active) setAvailable(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!available || !enabled) return;
    showStatusNotification(snapshot.stalls, snapshot.bathroom, snapshot.queueLength).catch(
      (error) => {
        console.warn("Não foi possível atualizar o painel nativo.", error);
      },
    );
  }, [available, enabled, snapshot]);

  const enable = useCallback(async () => {
    if (!available) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    window.localStorage.setItem(STORAGE_KEY, "1");
    setEnabled(true);
    await showStatusNotification(snapshot.stalls, snapshot.bathroom, snapshot.queueLength);
    return true;
  }, [available, snapshot]);

  const disable = useCallback(async () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setEnabled(false);
    await cancelStatusNotification();
  }, []);

  return {
    available,
    enabled,
    enable,
    disable,
  };
}
