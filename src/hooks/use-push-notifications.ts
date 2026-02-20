import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
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
  } catch (e) {
    console.error("Failed to fetch VAPID key:", e);
    return "";
  }
}

async function getOrRegisterSW(): Promise<ServiceWorkerRegistration> {
  // Use existing SW registration if available, otherwise register
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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
      // Step 1: Get VAPID key FIRST — required for Chrome/FCM
      const vapidPublicKey = await fetchVapidPublicKey();
      if (!vapidPublicKey) {
        toast.error("Configuração de notificações não encontrada. Contate o suporte.");
        return false;
      }

      // Step 2: Register / get SW
      const registration = await getOrRegisterSW();
      await navigator.serviceWorker.ready;

      // Step 3: Request notification permission
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada. Habilite nas configurações do navegador.");
        return false;
      }

      // Step 4: Unsubscribe any existing subscription (may be without VAPID key)
      const pm = (registration as any).pushManager as PushManager;
      const existing = await pm.getSubscription();
      if (existing) {
        await existing.unsubscribe();
        // Remove old subscription from DB too
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", existing.endpoint);
      }

      // Step 5: Create new subscription with VAPID key (REQUIRED for Chrome/FCM)
      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      if (!p256dh || !auth) {
        toast.error("Falha ao obter chaves de criptografia da subscription. Tente em outro navegador.");
        return false;
      }

      // Step 6: Verify user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sessão expirada. Faça login novamente.");
        return false;
      }

      // Step 7: Save subscription to DB
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
      // Common errors with friendly messages
      if (err?.message?.includes("applicationServerKey")) {
        toast.error("Erro de configuração VAPID. Recarregue a página e tente novamente.");
      } else if (err?.message?.includes("permission")) {
        toast.error("Permissão bloqueada. Habilite nas configurações do navegador.");
      } else {
        toast.error("Erro ao ativar notificações: " + (err.message || "tente novamente"));
      }
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [supporterAccountId, clientId, isPushSupported]);

  const unsubscribe = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const pm2 = (reg as any).pushManager as PushManager | undefined;
      const sub = pm2 ? await pm2.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", endpoint);
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
