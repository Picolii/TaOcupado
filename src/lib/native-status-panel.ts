import { useCallback, useEffect, useMemo, useState } from "react";
import type { BathroomState, Stall } from "@/lib/stalls";

const STATUS_NOTIFICATION_ID = 7001;
const STATUS_CHANNEL_ID = "bathroom-status";
const STORAGE_KEY = "tao-native-status-panel";

async function getNativePlatform() {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.getPlatform();
}

function formatStatus(stalls: Stall[] | null, bathroom: BathroomState | null, queueLength: number) {
  if (bathroom?.cleaning) return "Banheiro em limpeza. Boxes ocultos.";
  if (!stalls?.length) return "Carregando status dos vasos...";

  const stallLines = stalls.map((stall) => {
    const state = stall.occupied ? "ocupado" : "livre";
    const paper = stall.paper_1 === "acabou" && stall.paper_2 === "acabou" ? " · sem papel" : "";
    return `${stall.label}: ${state}${paper}`;
  });
  const queueLine = queueLength > 0 ? `Fila: ${queueLength}` : "Fila vazia";
  return [...stallLines, queueLine].join("\n");
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

async function showStatusNotification(body: string) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");

  await ensureStatusChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: STATUS_NOTIFICATION_ID,
        title: "Tá Ocupado?",
        body,
        largeBody: body,
        summaryText: "Status ao vivo",
        channelId: STATUS_CHANNEL_ID,
        ongoing: true,
        autoCancel: false,
        silent: true,
      },
    ],
  });
}

async function cancelStatusNotification() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({ notifications: [{ id: STATUS_NOTIFICATION_ID }] });
}

export function useNativeStatusPanel(
  stalls: Stall[] | null,
  bathroom: BathroomState | null,
  queueLength: number,
) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const body = useMemo(
    () => formatStatus(stalls, bathroom, queueLength),
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
    showStatusNotification(body).catch((error) => {
      console.warn("Não foi possível atualizar o painel nativo.", error);
    });
  }, [available, body, enabled]);

  const enable = useCallback(async () => {
    if (!available) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    window.localStorage.setItem(STORAGE_KEY, "1");
    setEnabled(true);
    await showStatusNotification(body);
    return true;
  }, [available, body]);

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
