export interface Me { configured: boolean; clientId?: string; consentVersion?: string; user: { handle: string | null; consented: boolean; consentVersion: string } | null }

export async function getMe(): Promise<Me> {
  try {
    const r = await fetch("/api/account", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as Me;
  } catch { return { configured: false, user: null }; }   // offline or no server: behave as signed out, nothing breaks
}

export async function act(action: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; body: any }> {
  try {
    const r = await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { ok: false, status: 0, body: { error: "offline" } }; }
}

// Google Identity Services, loaded only when the account screen opens so it costs nothing on a normal visit.
type Gsi = { accounts: { id: { initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void } } };
let gsi: Promise<Gsi> | null = null;
export function loadGoogle(): Promise<Gsi> {
  gsi ??= new Promise((res, rej) => {
    const w = window as unknown as { google?: Gsi };
    if (w.google) return res(w.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => (w.google ? res(w.google) : rej(new Error("google")));
    s.onerror = () => { gsi = null; rej(new Error("google blocked")); };
    document.head.appendChild(s);
  });
  return gsi;
}
