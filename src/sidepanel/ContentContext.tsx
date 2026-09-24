import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import indexData from "../data/exampleEmbeddings.json";
import { hashExamples, mergeIndex, STORAGE_KEY as INDEX_KEY, type ClientIndex } from "../lib/clientExamples";
import { mergeContent, type ContentOverrides } from "../lib/content";
import { defaultContent } from "../lib/matrix";
import type { EmbeddingIndex } from "../lib/similarity";
import { getJSON, removeKey, setJSON } from "../lib/storage";
import type { Content } from "../lib/types";

const KEY = "contentOverrides";
const builtInIndex = indexData as EmbeddingIndex;

interface ContentState {
  /** Effective content: built-in defaults with any supervisor overrides applied. */
  content: Content;
  overrides: ContentOverrides | null;
  /** Example index for recognition: built-in examples plus any imported client lines. */
  exampleIndex: EmbeddingIndex;
  /** Client lines are imported but their stored vectors are missing or don't match (re-import to fix). */
  examplesStale: boolean;
  /** Save overrides; pass `clientIndex` when the import included example lines (null removes them). */
  saveOverrides: (o: ContentOverrides | null, clientIndex?: ClientIndex | null) => Promise<void>;
}

const Ctx = createContext<ContentState>({
  content: defaultContent,
  overrides: null,
  exampleIndex: builtInIndex,
  examplesStale: false,
  saveOverrides: async () => {},
});

export function ContentProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<ContentOverrides | null>(null);
  const [clientIndex, setClientIndex] = useState<ClientIndex | null>(null);

  useEffect(() => {
    getJSON<ContentOverrides>(KEY).then(setOverrides);
    getJSON<ClientIndex>(INDEX_KEY).then(setClientIndex);
  }, []);

  const value = useMemo<ContentState>(() => {
    const ex = overrides?.customerExamples;
    // Only use stored vectors that match the imported lines.
    const usable = ex && clientIndex?.hash === hashExamples(ex) ? clientIndex : null;
    return {
      content: mergeContent(overrides),
      overrides,
      exampleIndex: mergeIndex(builtInIndex, usable),
      examplesStale: Boolean(ex && !usable),
      saveOverrides: async (o, nextIndex) => {
        setOverrides(o);
        if (o) await setJSON(KEY, o);
        else await removeKey(KEY);
        const idx = o === null ? null : nextIndex;
        if (idx !== undefined) {
          setClientIndex(idx);
          if (idx) await setJSON(INDEX_KEY, idx);
          else await removeKey(INDEX_KEY);
        }
      },
    };
  }, [overrides, clientIndex]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useContent = () => useContext(Ctx);
