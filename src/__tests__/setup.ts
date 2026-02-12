/**
 * Global test setup
 * Firebase modüllerini mock'lar — testlerde gerçek bağlantı kurulmasını engeller.
 */
import { vi } from "vitest";

// Firebase modüllerini mock'la (test'lerde import edildiğinde gerçek bağlantı açmasın)
vi.mock("../lib/firebase", () => ({
  db: {},
  auth: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
  serverTimestamp: vi.fn(),
  Timestamp: {
    now: () => ({ toMillis: () => Date.now() }),
    fromDate: (d: Date) => ({ toMillis: () => d.getTime(), toDate: () => d }),
  },
}));

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));
