import { useEffect, useRef, useState } from "preact/hooks";
import { act, getMe, loadGoogle, type Me } from "./api";
import { detectLang, LANGS, setLang, t, type Lang } from "./i18n";

/** Full-screen account sheet: sign in, pick a name, read and accept the notice, see/withdraw/delete your data, report. */
export function AccountPanel({ onClose, onChange }: { onClose: () => void; onChange: (me: Me) => void }) {
  const [lang, setL] = useState<Lang>(detectLang());
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [handle, setHandle] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const btn = useRef<HTMLDivElement>(null);
  const T = (k: Parameters<typeof t>[1]) => t(lang, k) as string;

  const refresh = async () => { const m = await getMe(); setMe(m); onChange(m); return m; };
  useEffect(() => { void refresh(); }, []);

  useEffect(() => {          // draw Google's own button when signed out
    if (!me?.configured || me.user || !me.clientId || !btn.current) return;
    let dead = false;
    loadGoogle().then((g) => {
      if (dead || !btn.current) return;
      g.accounts.id.initialize({
        client_id: me.clientId!,
        callback: async ({ credential }) => {
          setBusy(true); const r = await act("login", { credential }); setBusy(false);
          setMsg(r.ok ? "" : T("error")); if (r.ok) await refresh();
        },
      });
      g.accounts.id.renderButton(btn.current, { theme: "outline", size: "large", text: "signin_with", shape: "pill" });
    }).catch(() => setMsg(T("error")));
    return () => { dead = true; };
  }, [me?.configured, me?.user, me?.clientId, lang]);

  const run = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(""); const r = await act(action, extra); setBusy(false);
    if (!r.ok) { setMsg(r.status === 409 ? T("taken") : (r.body?.error as string) || T("error")); return r; }
    return r;
  };

  const u = me?.user;
  const notice = t(lang, "notice") as string[];
  return (
    <div class="acct" role="dialog" aria-modal="true">
      <div class="acct-head">
        <b>{T("account")}</b>
        <select value={lang} aria-label={T("language")} onChange={(e) => { const l = (e.target as HTMLSelectElement).value as Lang; setLang(l); setL(l); }}>
          {LANGS.map((l) => <option value={l.code}>{l.label}</option>)}
        </select>
        <button onClick={onClose}>{T("close")}</button>
      </div>
      <div class="acct-body">
        {!me && <p>{T("working")}</p>}
        {me && !me.configured && <p>{T("notEnabled")}</p>}

        {me?.configured && !u && (<>
          <p>{T("signInWhy")}</p>
          <div ref={btn} class="gbtn" />
        </>)}

        {u && !u.handle && (<>
          <label>{T("pickHandle")}</label>
          <input value={handle} maxLength={20} autocapitalize="off" onInput={(e) => setHandle((e.target as HTMLInputElement).value)} />
          <small>{T("handleHelp")}</small>
          <button disabled={busy || handle.length < 3} onClick={async () => { if (await run("handle", { handle })) await refresh(); }}>{T("save")}</button>
        </>)}

        {u && u.handle && !u.consented && (<>
          <h3>{T("noticeTitle")}</h3>
          <ul>{notice.map((p) => <li>{p}</li>)}</ul>
          <button class="primary" disabled={busy} onClick={async () => { if (await run("consent", { accept: true, version: me!.consentVersion })) await refresh(); }}>{T("accept")}</button>
        </>)}

        {u && u.handle && u.consented && (<>
          <p>{T("signedInAs")} <b>{u.handle}</b></p>
          <details><summary>{T("noticeTitle")}</summary><ul>{notice.map((p) => <li>{p}</li>)}</ul></details>
          <h3>{T("yourData")}</h3>
          <div class="acct-row">
            <button disabled={busy} onClick={async () => {
              const r = await run("export"); if (!r) return;
              const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(r.body, null, 2)], { type: "application/json" })); a.download = "fogfoot-my-data.json"; a.click();
            }}>{T("download")}</button>
            <button disabled={busy} onClick={async () => { if (await run("withdraw")) { setMsg(T("withdrawn")); await refresh(); } }}>{T("withdraw")}</button>
            <button class="danger" disabled={busy} onClick={async () => { if (confirm(T("confirmDelete"))) { if (await run("delete")) await refresh(); } }}>{T("deleteAccount")}</button>
          </div>
        </>)}

        {u && (<>
          <div class="acct-row">
            <button onClick={() => setReport(report === null ? "" : null)}>{T("report")}</button>
            <button disabled={busy} onClick={async () => { if (await run("logout")) await refresh(); }}>{T("signOut")}</button>
          </div>
          {report !== null && (<>
            <label>{T("reportWhat")}</label>
            <textarea value={report} maxLength={1000} onInput={(e) => setReport((e.target as HTMLTextAreaElement).value)} />
            <button disabled={busy || !report.trim()} onClick={async () => { if (await run("report", { kind: "other", target: "in-app", note: report })) { setMsg(T("reportThanks")); setReport(null); } }}>{T("reportSend")}</button>
          </>)}
        </>)}
        {msg && <p class="acct-msg">{msg}</p>}
      </div>
    </div>
  );
}
