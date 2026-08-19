import type { ReaderSettings, ResolvedReadingMode } from '@/services/app-settings';

export type TapAction = 'previous' | 'next' | 'toggleBars' | 'none';

export type TapZoneGrid = TapAction[][];

const GRID_SIZE = 3;

function grid(action: TapAction): TapZoneGrid {
  return Array.from({ length: GRID_SIZE }, () => Array.from({ length: GRID_SIZE }, () => action));
}

function mergeZones(base: TapZoneGrid, zones: Partial<Record<string, TapAction>>): TapZoneGrid {
  const next = base.map((row) => [...row]) as TapZoneGrid;
  for (const [key, action] of Object.entries(zones)) {
    const [rowRaw, colRaw] = key.split(',');
    const row = Number(rowRaw);
    const col = Number(colRaw);
    if (row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE && action) {
      next[row]![col] = action;
    }
  }
  return next;
}

function leftRightZones(): TapZoneGrid {
  return mergeZones(grid('toggleBars'), {
    '0,0': 'previous',
    '1,0': 'previous',
    '2,0': 'previous',
    '0,2': 'next',
    '1,2': 'next',
    '2,2': 'next',
  });
}

function lShapedZones(): TapZoneGrid {
  return mergeZones(grid('toggleBars'), {
    '0,0': 'previous',
    '1,0': 'previous',
    '2,0': 'previous',
    '2,1': 'next',
    '2,2': 'next',
  });
}

function kindleZones(): TapZoneGrid {
  return mergeZones(grid('none'), {
    '0,0': 'previous',
    '1,0': 'previous',
    '2,0': 'previous',
    '0,2': 'next',
    '1,2': 'next',
    '2,2': 'next',
    '1,1': 'toggleBars',
  });
}

function edgeZones(): TapZoneGrid {
  return mergeZones(grid('toggleBars'), {
    '1,0': 'previous',
    '1,2': 'next',
  });
}

function autoZones(mode: ResolvedReadingMode): TapZoneGrid {
  if (mode === 'webtoon' || mode === 'continuous' || mode === 'vertical') {
    return kindleZones();
  }
  return leftRightZones();
}

export function buildTapZoneGrid(settings: ReaderSettings, mode: ResolvedReadingMode): TapZoneGrid {
  let gridValue: TapZoneGrid;
  switch (settings.tapZones) {
    case 'left-right':
      gridValue = leftRightZones();
      break;
    case 'l-shaped':
      gridValue = lShapedZones();
      break;
    case 'kindle':
      gridValue = kindleZones();
      break;
    case 'edge':
      gridValue = edgeZones();
      break;
    case 'auto':
      gridValue = autoZones(mode);
      break;
    case 'disabled':
    default:
      gridValue = grid('toggleBars');
      break;
  }

  if (!settings.invertTapZones) return gridValue;

  return gridValue.map((row) =>
    row.map((action) => {
      if (action === 'previous') return 'next';
      if (action === 'next') return 'previous';
      return action;
    }),
  ) as TapZoneGrid;
}

export function tapActionAtPoint(
  grid: TapZoneGrid,
  x: number,
  y: number,
  width: number,
  height: number,
): TapAction {
  const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((x / width) * GRID_SIZE)));
  const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((y / height) * GRID_SIZE)));
  return grid[row]?.[col] ?? 'none';
}

export function mapTapActionForMode(action: TapAction, mode: ResolvedReadingMode): TapAction {
  if (action !== 'previous' && action !== 'next') return action;
  if (mode === 'rtl') {
    return action === 'previous' ? 'next' : 'previous';
  }
  return action;
}
