const DEFAULT_MAX_HEIGHT_RATIO = 100;

let showImageSize = false;
let maxHeightRatio = DEFAULT_MAX_HEIGHT_RATIO;

export function configureReaderDebug(options: {
  showImageSize: boolean;
  maxHeightRatio: number;
}): void {
  showImageSize = options.showImageSize;
  maxHeightRatio =
    Number.isFinite(options.maxHeightRatio) && options.maxHeightRatio >= 1
      ? options.maxHeightRatio
      : DEFAULT_MAX_HEIGHT_RATIO;
}

export function shouldShowReaderImageSize(): boolean {
  return showImageSize;
}

export function getReaderMaxHeightRatio(): number {
  return maxHeightRatio;
}

export function getReaderMinAspect(): number {
  return 1 / maxHeightRatio;
}
