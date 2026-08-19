import { createContext, useContext, type ReactNode } from 'react';

import type { Chapter, Manga } from '@/parsers/shared/types';
import type { ChapterSegment } from '@/hooks/use-reader-chapter-window';
import type { DictionarySettings, ReaderSettings, ResolvedReadingMode } from '@/services/app-settings';
import type { ReaderPage } from '@/utils/reader-pages';

export type ReaderChromeState = {
  barsVisible: boolean;
  currentPage: number;
  totalPages: number;
  pagesRemaining: number;
  chapterTitle: string;
  mangaTitle: string;
  incognito: boolean;
};

export type ReaderActions = {
  toggleBars: () => void;
  setBarsVisible: (visible: boolean) => void;
  goToPage: (index: number, animated?: boolean) => void;
  goNext: () => void;
  goPrevious: () => void;
  goNextChapter: () => void;
  openChapterList: () => void;
  closeReader: () => void;
  openChapterUrl: () => void;
  openSettings: () => void;
  openReaderSettings: () => void;
  selectChapter: (chapter: Chapter) => void;
  lookupDictionary: (pageUrl: string, x: number, y: number, layout: { width: number; height: number }) => void;
  loadAdjacentChapter: (direction: 'previous' | 'next') => void;
};

export type ReaderContextValue = {
  manga: Manga;
  chapter: Chapter;
  chapters: Chapter[];
  pages: ReaderPage[];
  settings: ReaderSettings;
  dictionarySettings: DictionarySettings;
  mode: ResolvedReadingMode;
  isText: boolean;
  backgroundColor: string;
  foregroundColor: string;
  coverHeaders?: Record<string, string>;
  chrome: ReaderChromeState;
  actions: ReaderActions;
  chapterUrl?: string;
  stripSegments: ChapterSegment[];
  debugShowPageNumbers: boolean;
};

const ReaderContext = createContext<ReaderContextValue | null>(null);

type ReaderProviderProps = {
  value: ReaderContextValue;
  children: ReactNode;
};

export function ReaderProvider({ value, children }: ReaderProviderProps) {
  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

export function useReader(): ReaderContextValue {
  const value = useContext(ReaderContext);
  if (!value) throw new Error('useReader must be used within ReaderProvider');
  return value;
}
