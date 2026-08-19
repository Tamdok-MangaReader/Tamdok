import type { PagedPageLayout } from '@/services/app-settings';
import type { ReaderPage } from '@/utils/reader-pages';

export type ReaderSpread = {
  id: string;
  pages: ReaderPage[];
  startPageIndex: number;
  isolated: boolean;
};

export function usesDoublePageLayout(layout: PagedPageLayout, width: number, height: number): boolean {
  if (layout === 'single') return false;
  if (layout === 'double') return true;
  return width > height;
}

export function firstToggleableHead(pages: ReaderPage[], doublePages: boolean): number {
  if (!doublePages || pages.length < 2) return 0;
  for (let index = 1; index <= Math.min(8, pages.length); index += 1) {
    if (isPagePairable(pages, index - 1) && isPagePairable(pages, index)) {
      return index;
    }
  }
  return 0;
}

export function isPagePairable(pages: ReaderPage[], index: number): boolean {
  const page = pages[index];
  if (!page?.url) return false;
  if (page.splitTotal && page.splitTotal > 1) return false;
  return true;
}

export function buildSpreads(
  pages: ReaderPage[],
  doublePages: boolean,
  isolatedPageIndices: Set<number>,
): ReaderSpread[] {
  if (!doublePages) {
    return pages.map((page, index) => ({
      id: `spread-${page.id}`,
      pages: [page],
      startPageIndex: index,
      isolated: false,
    }));
  }

  const spreads: ReaderSpread[] = [];
  let index = 0;

  while (index < pages.length) {
    const isolated = isolatedPageIndices.has(index);
    const canPair =
      !isolated &&
      index + 1 < pages.length &&
      isPagePairable(pages, index) &&
      isPagePairable(pages, index + 1) &&
      !isolatedPageIndices.has(index + 1);

    if (!canPair) {
      spreads.push({
        id: `spread-${pages[index]!.id}`,
        pages: [pages[index]!],
        startPageIndex: index,
        isolated: true,
      });
      index += 1;
      continue;
    }

    spreads.push({
      id: `spread-${pages[index]!.id}-${pages[index + 1]!.id}`,
      pages: [pages[index]!, pages[index + 1]!],
      startPageIndex: index,
      isolated: false,
    });
    index += 2;
  }

  return spreads;
}

export function spreadIndexForPage(spreads: ReaderSpread[], pageIndex: number): number {
  return spreads.findIndex(
    (spread) => pageIndex >= spread.startPageIndex && pageIndex < spread.startPageIndex + spread.pages.length,
  );
}

export function pageIndexForSpread(spreads: ReaderSpread[], spreadIndex: number): number {
  return spreads[spreadIndex]?.startPageIndex ?? 0;
}

export function findSegmentHead(spreads: ReaderSpread[], spreadIndex: number): number {
  const spread = spreads[spreadIndex];
  if (!spread) return 0;
  return spread.startPageIndex;
}

export function defaultIsolatedPages(
  pages: ReaderPage[],
  doublePages: boolean,
  pageOffsetEnabled: boolean,
): Set<number> {
  if (!doublePages || !pageOffsetEnabled) return new Set();
  const head = firstToggleableHead(pages, doublePages);
  return head > 0 ? new Set([head]) : new Set([1]);
}
