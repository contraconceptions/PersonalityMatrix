import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { mergeContent, type ContentOverrides } from "../lib/content";
import { defaultContent } from "../lib/matrix";
import { getJSON, removeKey, setJSON } from "../lib/storage";
import type { Content } from "../lib/types";

const KEY = "contentOverrides";

interface ContentState {
  /** Effective content: built-in defaults with any supervisor overrides applied. */
  content: Content;
  overrides: ContentOverrides | null;
  saveOverrides: (o: ContentOverrides | null) => Promise<void>;
}

const Ctx = createContext<ContentState>({
  content: defaultContent,
  overrides: null,
  saveOverrides: async () => {},
});

export function ContentProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<ContentOverrides | null>(null);

  useEffect(() => {
    getJSON<ContentOverrides>(KEY).then(setOverrides);
  }, []);

  const value = useMemo<ContentState>(
    () => ({
      content: mergeContent(overrides),
      overrides,
      saveOverrides: async (o) => {
        setOverrides(o);
        if (o) await setJSON(KEY, o);
        else await removeKey(KEY);
      },
    }),
    [overrides],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
