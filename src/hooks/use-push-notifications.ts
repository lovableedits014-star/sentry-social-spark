import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSWRegistration } from "./use-sw-registration";

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
      // Step 1: Get VAPID key FIRST
      const vapidPublicKey = await fetchVapidPublicKey();
      if (!vapidPublicKey) {
        toast.error("Configuração de notificações não encontrada. Contate o suporte.");
        return false;
      }

      // Step 2: Register our sw.js (guaranteed to have push handler)
      const registration = await getSWRegistration();
      await navigator.serviceWorker.ready;

      // Step 3: Request notification permission
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);
      if (permission !== "granted") {
        toast.error("Permissão de notificação negada. Habilite nas configurações do navegador.");
        return false;
      }

      // Step 4: Check for existing subscription — reuse if still valid
      const pm = (registration as any).pushManager as PushManager;
      const existing = await pm.getSubscription();

      // If there's already a valid subscription, just save it to DB again (re-sync)
      if (existing) {
        const subJson = existing.toJSON();
        const existingP256dh = (subJson as any).keys?.p256dh || "";
        const existingAuth = (subJson as any).keys?.auth || "";

        if (existingP256dh && existingAuth) {
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
                endpoint: existing.endpoint,
                p256dh: existingP256dh,
                auth: existingAuth,
              },
              { onConflict: "endpoint" }
            );
          if (!error) {
            setIsSubscribed(true);
            toast.success("🔔 Notificações ativadas!");
            return true;
          }
        }
        // If reuse failed, unsubscribe and create fresh
        await existing.unsubscribe();
        await supabase
          .from("push_subscriptions" as any)
          .delete()
          .eq("endpoint", existing.endpoint);
      }

      // Step 5: Create new subscription with VAPID key
      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await pm.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const p256dh = (subJson as any).keys?.p256dh || "";
      const auth = (subJson as any).keys?.auth || "";

      if (!p256dh || !auth) {
        toast.error("Falha ao obter chaves de criptografia. Tente em outro navegador.");
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
