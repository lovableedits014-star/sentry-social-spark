// VAPID Public Key - safe to include in frontend code (public key only)
// This key must match the VAPID_PUBLIC_KEY secret configured in the backend
// To update: replace with your VAPID public key from https://vapidkeys.com
export const VAPID_PUBLIC_KEY = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY || "";
