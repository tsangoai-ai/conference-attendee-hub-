import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "firebase/auth";
import {
  getFirestore, collection, doc, getDoc, onSnapshot, setDoc, updateDoc, addDoc, query,
  serverTimestamp, arrayUnion, arrayRemove, deleteDoc
} from "firebase/firestore";

const REQUIRED_GLOBALS = ["__firebase_config", "__app_id"];
const getGlobal = (k) => (typeof window !== "undefined" ? window[k] : undefined);
const MOCK_SESSIONS = [
  { id: "s-101", title: "Opening Keynote: The Future of Serverless", room: "Main Hall A", speaker: "Dr. Jamie Rhodes", startISO: "2025-11-15T09:00:00", endISO: "2025-11-15T10:00:00", summary: "A pragmatic look at serverless adoption, pitfalls, and patterns for 2026." },
  { id: "s-102", title: "Realtime UX with Firestore", room: "Room 204", speaker: "Amina Patel", startISO: "2025-11-15T10:15:00", endISO: "2025-11-15T11:00:00", summary: "Designing low-latency experiences and scaling live data using Firestore." },
  { id: "s-103", title: "React Hooks at Scale", room: "Room 210", speaker: "Leo K.", startISO: "2025-11-15T11:15:00", endISO: "2025-11-15T12:00:00", summary: "Patterns, perf tips, and pitfalls when your hook count explodes." }
];
const isoOk = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s);
const fmtRange = (a,b) => { try { const f=new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}); return `${f.format(new Date(a))} – ${f.format(new Date(b))}`; } catch { return `${a} – ${b}`; }};

function useFirebaseBootstrap() {
  const [state, setState] = useState({ app:null, db:null, auth:null, userId:null, isAuthReady:false, error:null });
  useEffect(() => {
    for (const k of REQUIRED_GLOBALS) { if (!getGlobal(k)) { setState((s)=>({ ...s, error:`Missing required global: ${k}` })); return; } }
    try {
      const app = getApps().length ? getApps()[0] : initializeApp(getGlobal("__firebase_config"));
      const auth = getAuth(app);
      const db = getFirestore(app);
      const token = getGlobal("__initial_auth_token");
      const signin = async () => { try { token ? await signInWithCustomToken(auth, token) : await signInAnonymously(auth); } catch { await signInAnonymously(auth); } };
      let unsub = () => {};
      (async () => { await signin(); unsub = onAuthStateChanged(auth, (u)=> setState((s)=> ({ ...s, app, db, auth, userId: u?.uid ?? null, isAuthReady: true }))); })();
      return () => unsub();
    } catch (e) { setState((s)=>({ ...s, error:String(e) })); }
  }, []);
  return state;
}

function useAdmin(db, appId, userId, ready) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!ready || !db || !userId) return;
    const ref = doc(db, "artifacts", appId, "admins", userId);
    return onSnapshot(ref, (snap) => setIsAdmin(snap.exists()));
  }, [db, appId, userId, ready]);
  return isAdmin;
}

function useSchedule(db, appId, ready) {
  const [sessions, setSessions] = useState([]); const [error, setError] = useState(null);
  useEffect(() => {
    if (!ready || !db) return;
    const colRef = collection(db, "artifacts", appId, "public", "data", "conference_schedule");
    const unsub = onSnapshot(query(colRef), (qs) => {
      const items = []; qs.forEach((d)=> items.push({ id: d.id, ...d.data() }));
      items.sort((a,b)=> String(a.startISO).localeCompare(String(b.startISO))); setSessions(items);
    }, (e)=> setError(`Schedule listener error: ${String(e)}`));
    return () => unsub();
  }, [db, appId, ready]);
  return { sessions, error };
}

function useUserProfile(db, appId, userId, ready) {
  const [attending, setAttending] = useState([]); const [error, setError] = useState(null); const inited = useRef(false);
  useEffect(() => {
    if (!ready || !db || !userId) return;
    const r = doc(db, "artifacts", appId, "users", userId, "conference_data", "user_profile");
    (async () => { try { if (!inited.current) { const d = await getDoc(r); if (!d.exists()) await setDoc(r, { attendingSessions: [] }); inited.current = true; } } catch (e) { setError(`Failed to init profile: ${String(e)}`);}})();
    return onSnapshot(r, (snap)=> setAttending(Array.isArray(snap.data()?.attendingSessions) ? snap.data().attendingSessions : []), (e)=> setError(`Profile listener error: ${String(e)}`));
  }, [db, appId, userId, ready]);
  const toggle = async (sessionId) => {
    if (!db || !userId) return;
    const r = doc(db, "artifacts", appId, "users", userId, "conference_data", "user_profile");
    try { attending.includes(sessionId) ? await updateDoc(r, { attendingSessions: arrayRemove(sessionId) }) : await updateDoc(r, { attendingSessions: arrayUnion(sessionId) }); } catch (e) { setError(`Failed to update RSVP: ${String(e)}`); }
  };
  return { attending, toggle, error };
}

function StarRating({ value, onChange }) {
  return (<div className="flex gap-2" role="radiogroup" aria-label="Star rating">
    {[1,2,3,4,5].map((s)=>(
      <button key={s} type="button" onClick={()=>onChange(s)} aria-checked={value===s} role="radio"
        className={`text-2xl ${value>=s?"opacity-100":"opacity-40"}`} title={`${s} star${s>1?"s":""}`}>★</button>
    ))}
  </div>);
}

function SessionCard({ session, isAttending, onToggle, onFeedback }) {
  return (
    <div className="rounded-2xl shadow p-4 border">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{session.title}</h3>
          <p className="text-sm">{fmtRange(session.startISO, session.endISO)} · {session.room}</p>
          <p className="text-sm text-gray-600">Speaker: {session.speaker}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onToggle(session.id)} className={`px-3 py-1 rounded-full text-sm border ${isAttending ? "bg-gray-100" : "bg-white"}`}>{isAttending ? "Remove" : "Attend"}</button>
          <button onClick={() => onFeedback(session.id)} className="px-3 py-1 rounded-full text-sm border">Leave Feedback</button>
        </div>
      </div>
      <p className="mt-3 text-sm">{session.summary}</p>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (<div className="rounded-2xl shadow p-4 border"><h3 className="text-lg font-semibold">{title}</h3><div className="mt-2 text-sm">{children}</div></div>);
}

function AdminSessionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial); const [err, setErr] = useState(null);
  const onChange = (k,v)=> setForm((s)=>({ ...s, [k]: v }));
  const submit = () => {
    if (!form.id || !form.title || !form.room || !form.speaker || !form.startISO || !form.endISO || !form.summary) { setErr("All fields required."); return; }
    if (!isoOk(form.startISO) || !isoOk(form.endISO)) { setErr("Times must be ISO `YYYY-MM-DDTHH:MM`"); return; }
    setErr(null); onSave(form);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-lg">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">{initial.__isNew ? "New Session" : "Edit Session"}</h3>
          <button onClick={onCancel} className="rounded-full border px-2 py-1 text-sm" aria-label="Close">✕</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <label className="text-sm">ID<input className="w-full rounded border p-2 text-sm" value={form.id} disabled={!initial.__isNew} onChange={(e)=>onChange("id", e.target.value)} /></label>
          <label className="text-sm">Title<input className="w-full rounded border p-2 text-sm" value={form.title} onChange={(e)=>onChange("title", e.target.value)} /></label>
          <label className="text-sm">Room<input className="w-full rounded border p-2 text-sm" value={form.room} onChange={(e)=>onChange("room", e.target.value)} /></label>
          <label className="text-sm">Speaker<input className="w-full rounded border p-2 text-sm" value={form.speaker} onChange={(e)=>onChange("speaker", e.target.value)} /></label>
          <label className="text-sm">Start ISO<input placeholder="YYYY-MM-DDTHH:MM" className="w-full rounded border p-2 text-sm" value={form.startISO} onChange={(e)=>onChange("startISO", e.target.value)} /></label>
          <label className="text-sm">End ISO<input placeholder="YYYY-MM-DDTHH:MM" className="w-full rounded border p-2 text-sm" value={form.endISO} onChange={(e)=>onChange("endISO", e.target.value)} /></label>
          <label className="text-sm md:col-span-2">Summary<textarea className="w-full rounded border p-2 text-sm" rows={3} value={form.summary} onChange={(e)=>onChange("summary", e.target.value)} /></label>
        </div>
        {err && <div className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-full border px-3 py-1 text-sm">Cancel</button>
          <button onClick={submit} className="rounded-full border px-3 py-1 text-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

export default function ConferenceAttendeeHub() {
  const appId = getGlobal("__app_id") || "default";
  const { db, userId, isAuthReady, error: bootError } = useFirebaseBootstrap();
  const isAdmin = useAdmin(db, appId, userId, isAuthReady && !!userId);
  const { sessions, error: scheduleError } = useSchedule(db, appId, isAuthReady && !!userId);
  const { attending, toggle, error: profileError } = useUserProfile(db, appId, userId, isAuthReady && !!userId);

  const [activeView, setActiveView] = useState("schedule");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [feedbackError, setFeedbackError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [editInitial, setEditInitial] = useState(null);

  useEffect(() => { if (activeView === "admin" && !isAdmin) setActiveView("schedule"); }, [activeView, isAdmin]);

  const selectedSession = useMemo(() => sessions.find((s) => s.id === selectedSessionId) || null, [sessions, selectedSessionId]);
  const ErrorBanner = ({ msg }) => !msg ? null : (<div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div>);

  const submitFeedback = async () => {
    if (!db || !userId || !selectedSessionId || rating < 1) return;
    const colRef = collection(db, "artifacts", appId, "users", userId, "conference_data", "session_feedback");
    setSubmitting(true); setFeedbackError(null);
    try {
      await addDoc(colRef, { sessionId: selectedSessionId, rating, comment: comment?.trim() || "", createdAt: serverTimestamp() });
      setSelectedSessionId(null); setRating(0); setComment("");
    } catch (e) { setFeedbackError(`Failed to submit feedback: ${String(e)}`); }
    finally { setSubmitting(false); }
  };

  const openCreate = () => { setEditInitial({ __isNew: true, id: "", title: "", room: "", speaker: "", startISO: "", endISO: "", summary: "" }); setShowAdminForm(true); };
  const openEdit = (s) => { setEditInitial({ ...s, __isNew: false }); setShowAdminForm(true); };

  const saveSession = async (data) => {
    const colRef = collection(db, "artifacts", appId, "public", "data", "conference_schedule");
    const ref = doc(colRef, data.id);
    await setDoc(ref, { title: data.title, room: data.room, speaker: data.speaker, startISO: data.startISO, endISO: data.endISO, summary: data.summary }, { merge: false });
    setShowAdminForm(false);
  };
  const deleteSession = async (id) => { if (!confirm("Delete this session?")) return; const ref = doc(db, "artifacts", appId, "public", "data", "conference_schedule", id); await deleteDoc(ref); };
  const seedSessions = async () => {
    const colRef = collection(db, "artifacts", appId, "public", "data", "conference_schedule");
    await Promise.all(MOCK_SESSIONS.map((s)=> setDoc(doc(colRef, s.id), { title:s.title, room:s.room, speaker:s.speaker, startISO:s.startISO, endISO:s.endISO, summary:s.summary }, { merge:false })));
  };
  const duplicateSession = async (s) => {
    const newId = prompt("New session ID:", `${s.id}-copy`);
    if (!newId) return;
    const colRef = collection(db, "artifacts", appId, "public", "data", "conference_schedule");
    await setDoc(doc(colRef, newId), { title:s.title, room:s.room, speaker:s.speaker, startISO:s.startISO, endISO:s.endISO, summary:s.summary }, { merge:false });
  };
  const exportJSON = () => { const blob=new Blob([JSON.stringify(sessions,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`schedule-${appId}.json`; a.click(); URL.revokeObjectURL(url); };
  const importJSON = async (file) => {
    const text = await file.text(); const arr = JSON.parse(text);
    if (!Array.isArray(arr)) { alert("Invalid file"); return; }
    const colRef = collection(db, "artifacts", appId, "public", "data", "conference_schedule");
    for (const s of arr) { if (!s.id || !s.title || !s.room || !s.speaker || !isoOk(s.startISO) || !isoOk(s.endISO) || !s.summary) { alert(`Invalid session: ${s.id || "(missing id)"}`); return; } }
    await Promise.all(arr.map((s)=> setDoc(doc(colRef, s.id), { title:s.title, room:s.room, speaker:s.speaker, startISO:s.startISO, endISO:s.endISO, summary:s.summary })));
  };

  return (
    <div className="mx-auto max-w-3xl p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Conference Attendee Hub</h1>
        <p className="text-sm text-gray-600">
          App ID: <span className="font-mono">{appId}</span>{" · "}
          User: <span className="font-mono">{userId || "…"}</span>{" · "}
          Role: <span className="font-mono">{isAdmin ? "admin" : "attendee"}</span>
        </p>
      </header>

      <ErrorBanner msg={bootError || scheduleError || profileError} />

      <nav className="mb-4 flex gap-2">
        {["schedule","reflection","info"].map((v)=>(
          <button key={v} onClick={()=>setActiveView(v)} className={`px-3 py-1 rounded-full border text-sm ${activeView===v?"bg-gray-100":"bg-white"}`}>
            {v==="schedule"?"Schedule":v==="reflection"?"Reflection":"Info"}
          </button>
        ))}
        {isAdmin && (
          <button onClick={()=>setActiveView("admin")} className={`px-3 py-1 rounded-full border text-sm ${activeView==="admin"?"bg-gray-100":"bg-white"}`}>
            Admin
          </button>
        )}
      </nav>

      {!(isAuthReady && !!userId) ? (
        <div className="rounded-2xl border p-6 text-center"><p className="text-sm">Initializing session…</p></div>
      ) : (
        <>
          {activeView==="schedule" && (
            <div className="space-y-3">
              {sessions.length===0 ? (<div className="rounded-2xl border p-6 text-center text-sm">Loading schedule…</div>) : (
                sessions.map((s)=>(
                  <SessionCard key={s.id} session={s} isAttending={attending.includes(s.id)} onToggle={toggle} onFeedback={setSelectedSessionId} />
                ))
              )}
            </div>
          )}

          {activeView==="reflection" && (
            <div className="space-y-4">
              <InfoCard title="Reflection & Group Work">
                <p className="mb-2">Reflect on sessions you attended. One takeaway + one action this week.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Share a concise summary with your group.</li>
                  <li>Pair up and outline an experiment within 7 days.</li>
                  <li>Note blockers, owners, and a success metric.</li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a className="underline text-blue-600" href="YOUR_ACTUAL_PADLET_URL_1" target="_blank" rel="noreferrer">Collab Board 1</a>
                  <a className="underline text-blue-600" href="YOUR_ACTUAL_PADLET_URL_2" target="_blank" rel="noreferrer">Collab Board 2</a>
                  <a className="underline text-blue-600" href="YOUR_ACTUAL_FORM_URL" target="_blank" rel="noreferrer">Submit Outcomes</a>
                </div>
              </InfoCard>
            </div>
          )}

          {activeView==="info" && (
            <div className="space-y-3">
              <InfoCard title="FAQ"><p>Check registration desk for lost & found and speaker changes.</p></InfoCard>
              <InfoCard title="Wi-Fi"><p>SSID: <span className="font-mono">Conf-Guest</span> · Password: <span className="font-mono">welcome2025</span></p></InfoCard>
              <InfoCard title="Venue Maps"><p>Printed maps at entrances. Digital maps in event app.</p></InfoCard>
            </div>
          )}

          {isAdmin && activeView==="admin" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={openCreate} className="rounded-full border px-3 py-1 text-sm">New Session</button>
                <button onClick={seedSessions} className="rounded-full border px-3 py-1 text-sm">Seed Mock</button>
                <button onClick={exportJSON} className="rounded-full border px-3 py-1 text-sm">Export JSON</button>
                <label className="rounded-full border px-3 py-1 text-sm cursor-pointer">
                  Import JSON
                  <input type="file" accept="application/json" className="hidden" onChange={(e)=>e.target.files?.[0] && importJSON(e.target.files[0])} />
                </label>
              </div>

              <div className="rounded-2xl border overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2">ID</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Room</th>
                      <th className="text-left p-2">Speaker</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s)=>(
                      <tr key={s.id} className="border-t">
                        <td className="p-2 font-mono">{s.id}</td>
                        <td className="p-2">{s.title}</td>
                        <td className="p-2 whitespace-nowrap">{fmtRange(s.startISO, s.endISO)}</td>
                        <td className="p-2">{s.room}</td>
                        <td className="p-2">{s.speaker}</td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <button onClick={()=>openEdit(s)} className="rounded-full border px-2 py-0.5 text-xs">Edit</button>
                            <button onClick={()=>deleteSession(s.id)} className="rounded-full border px-2 py-0.5 text-xs">Delete</button>
                            <button onClick={()=>duplicateSession(s)} className="rounded-full border px-2 py-0.5 text-xs">Duplicate</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {sessions.length===0 && (<tr><td className="p-4 text-center text-gray-500" colSpan={6}>No sessions yet.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">Leave Feedback</h3>
              <button onClick={()=>{ setSelectedSessionId(null); setRating(0); setComment(""); }} className="rounded-full border px-2 py-1 text-sm" aria-label="Close">✕</button>
            </div>
            <p className="mt-1 text-sm text-gray-600">{selectedSession.title} · {fmtRange(selectedSession.startISO, selectedSession.endISO)}</p>
            <div className="mt-4 space-y-3">
              <div><label className="mb-1 block text-sm font-medium">Rating</label><StarRating value={rating} onChange={setRating} /></div>
              <div>
                <label htmlFor="fb-comment" className="mb-1 block text-sm font-medium">Comment (optional)</label>
                <textarea id="fb-comment" rows={4} className="w-full rounded-xl border p-2 text-sm" placeholder="What worked? What can improve?" value={comment} onChange={(e)=>setComment(e.target.value)} />
              </div>
              {feedbackError && (<div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{feedbackError}</div>)}
              <div className="flex justify-end gap-2">
                <button onClick={()=>{ setSelectedSessionId(null); setRating(0); setComment(""); }} className="rounded-full border px-3 py-1 text-sm">Cancel</button>
                <button onClick={submitFeedback} disabled={submitting || rating<1} className={`rounded-full border px-3 py-1 text-sm ${submitting || rating<1 ? "opacity-50":""}`}>{submitting ? "Submitting…" : "Submit"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAdminForm && <AdminSessionForm initial={editInitial} onSave={saveSession} onCancel={()=>setShowAdminForm(false)} />}

      <footer className="mt-8 text-center text-xs text-gray-500">Built with React + Tailwind + Firebase. Public data is shared; user data is private per user.</footer>
    </div>
  );
}
