import { createJSONStorage } from "zustand/middleware";

/**
 * Where the workspace is kept on this device: the browser's localStorage.
 * With an account, lib/sync.ts points it at a key of that person and sends every change to Supabase.
 */
export const workspaceStorage = createJSONStorage(() => localStorage);
export const STORAGE_KEY = "organizer";
