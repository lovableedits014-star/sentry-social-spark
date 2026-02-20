import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushStatus = "unsupported" | "denied" | "granted" | "default" | "loading";

let cachedVapidKey: string | null = null;

async function fetchVapidPublicKey(): Promise<string> {
  if (cachedVapidKey !== null) return cachedVapidKey;
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-public-key");
    if (error) throw error;
    cachedVapidKey = data?.vapid_public_key || "";
    return cachedVapidKey;
  } catch {
    return "";
  }
}

export function usePushNotifications(supporterAccountId?: string, clientId?: string) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  const isPushSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const checkStatus = useCallback(async () => {
    if (!isPushSupported) {
      setStatus("unsupported");
      return;
    }

    const permission = Notification.permission;
    setStatus(permission as PushStatus);

    if (permission === "granted") {
      try {
        const reg = await navigator.serviceWorker.ready;
        const pm = (reg as any).pushManager as PushManager | undefined;
        const sub = pm ? await pm.getSubscription() : null;
        setIsSubscribed(!!sub);
      } catch {
        setIsSubscribed(false);
      }
    }
  }, [isPushSupported]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const subscribe = useCallback(async () => {
    if (!supporterAccountId || !clientId) {
      toast.error("Faça login para ativar notificações");
      return false;
    }

    if (!isPushSupported) {
      toast.error("Seu navegador não suporta notificações push");
      return false;
    }

    setIsSubscribing(true);
    try {
      // Register the vite-plugin-pwa generated SW (which imports push-handler.js)
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);

      if (permission !== "granted") {
        toast.error("Permissão de notificação negada");
        return false;
      }

      const pm = (registration as any).pushManager as PushManager;
      if (!pm) {
        toast.error("PushManager não disponível neste navegador");
        return false;
      }

      // Fetch VAPID public key from backend (secret-safe)
      const vapidPublicKey = await fetchVapidPublicKey();

      let subscription: PushSubscription;
      try {
        if (vapidPublicKey) {
          subscription = await pm.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        } else {
          subscription = await pm.subscribe({ userVisibleOnly: true });
        }
      } catch {
        subscription = await pm.subscribe({ userVisibleOnly: true });
      }

      const subJson = subscription.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return false;
      }

      const { error } = await supabase
        .from("push_subscriptions" as any)
        .upsert(
          {
            supporter_account_id: supporterAccountId,
            client_id: clientId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
          },
          { onConflict: "endpoint" }
        );

      if (error) throw error;

      setIsSubscribed(true);
      toast.success("🔔 Notificações ativadas! Você será avisado sobre novas missões.");
      return true;
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      toast.error("Erro ao ativar notificações: " + (err.message || "tente novamente"));
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [supporterAccountId, clientId, isPushSupported]);

  const unsubscribe = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pm = (reg as any).pushManager as PushManager | undefined;
      const sub = pm ? await pm.getSubscription() : null;
      if (sub) {
        await sub.unsubscribe();
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", sub.endpoint);
      }
      setIsSubscribed(false);
      toast.success("Notificações desativadas");
    } catch {
      toast.error("Erro ao desativar notificações");
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  return {
    status,
    isSubscribed,
    isSubscribing,
    isPushSupported,
    subscribe,
    unsubscribe,
    checkStatus,
  };
}
