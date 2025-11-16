import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./ConferenceAttendeeHub";

vi.mock("firebase/app", () => ({ initializeApp: vi.fn(() => ({})), getApps: vi.fn(() => []) }));
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  signInAnonymously: vi.fn(async () => {}),
  signInWithCustomToken: vi.fn(async () => {}),
  onAuthStateChanged: vi.fn((_auth, cb) => { cb({ uid: "test-uid" }); return () => {}; })
}));

const fsSpies = {
  updateDoc: vi.fn(async () => {}),
  addDoc: vi.fn(async () => {}),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ attendingSessions: [] }) }))
};
function schedSnap() {
  const docs = [{ id: "s-101", data: () => ({ title: "Opening Keynote: The Future of Serverless", room: "Main Hall A", speaker: "Dr. Jamie Rhodes", startISO: "2025-11-15T09:00:00", endISO: "2025-11-15T10:00:00", summary: "A pragmatic look at serverless adoption." }) }];
  return { forEach: (fn) => docs.forEach(fn) };
}
let adminExists = false;
vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn((_db, ...p) => ({ __type: "collection", path: p.join("/") })),
  doc:       vi.fn((_db, ...p) => ({ __type: "doc", path: p.join("/") })),
  query:     vi.fn((x) => x),
  onSnapshot: vi.fn((ref, next) => {
    if (ref.__type === "collection" && ref.path.endsWith("conference_schedule")) next(schedSnap());
    else if (ref.__type === "doc" && ref.path.endsWith("user_profile")) next({ data: () => ({ attendingSessions: [] }) });
    else if (ref.__type === "doc" && ref.path.includes("/admins/")) next({ exists: () => adminExists });
    return () => {};
  }),
  setDoc: fsSpies.setDoc,
  updateDoc: fsSpies.updateDoc,
  addDoc: fsSpies.addDoc,
  deleteDoc: fsSpies.deleteDoc,
  getDoc: fsSpies.getDoc,
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  arrayUnion: vi.fn((v) => ({ __op: "arrayUnion", v })),
  arrayRemove: vi.fn((v) => ({ __op: "arrayRemove", v }))
}));

beforeEach(() => { Object.values(fsSpies).forEach((s) => s.mockClear && s.mockClear()); adminExists = false; });

describe("ConferenceAttendeeHub", () => {
  it("toggles RSVP with arrayUnion on Attend", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /attend/i }));
    const payload = fsSpies.updateDoc.mock.calls[0][1];
    expect(payload.attendingSessions.__op).toBe("arrayUnion");
  });
  it("submits feedback with rating and serverTimestamp", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /leave feedback/i }));
    fireEvent.click(await screen.findByRole("radio", { name: "4 stars" }));
    const area = await screen.findByLabelText(/comment \(optional\)/i);
    fireEvent.change(area, { target: { value: "Great session!" } });
    fireEvent.click(await screen.findByRole("button", { name: /submit/i }));
    const addPayload = fsSpies.addDoc.mock.calls[0][1];
    expect(addPayload.rating).toBe(4);
    expect(addPayload.createdAt).toBe("SERVER_TIMESTAMP");
  });
  it("shows Admin tab only when admin", async () => {
    adminExists = true;
    render(<App />);
    expect(await screen.findByRole("button", { name: /admin/i })).toBeInTheDocument();
  });
});
