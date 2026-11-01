import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";

export type WebtoonScrollApi = {
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
};

// Lets page placeholders follow the viewport centre while their page is on screen.
export const WebtoonScrollContext = createContext<WebtoonScrollApi | null>(
  null,
);
