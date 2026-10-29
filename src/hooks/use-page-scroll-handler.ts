import { useEvent, useHandler } from "react-native-reanimated";

type PageScrollEvent = {
  position: number;
  offset: number;
  eventName: string;
};

type Handlers = {
  onPageScroll?: (
    event: PageScrollEvent,
    context: Record<string, unknown>,
  ) => void;
};

export function usePageScrollHandler(
  handlers: Handlers,
  dependencies?: unknown[],
) {
  const { context, doDependenciesDiffer } = useHandler(handlers, dependencies);

  return useEvent(
    (event: PageScrollEvent) => {
      "worklet";
      const { onPageScroll } = handlers;
      if (onPageScroll && event.eventName.endsWith("onPageScroll")) {
        onPageScroll(event, context);
      }
    },
    ["onPageScroll"],
    doDependenciesDiffer,
  );
}
