import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { isGlassSupported } from '@/utils/glass';

export type SwipeAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sfSymbol?: string;
  color: string;
  onPress: () => void;
};

type SwipeSide = 'leading' | 'trailing';

type SwipeableRowProps = {
  children: React.ReactNode;
  actions?: SwipeAction[];
  leadingActions?: SwipeAction[];
  fullSwipeActionKey?: string;
  fullSwipeLeadingActionKey?: string;
  onFullSwipe?: () => void;
  onFullSwipeLeading?: () => void;
  enabled?: boolean;
  rowId?: string;
};

type SwipeableRowsContextValue = {
  activeRowId: string | null;
  setActiveRowId: (id: string | null) => void;
};

const SwipeableRowsContext = createContext<SwipeableRowsContextValue | null>(null);

export function SwipeableRowsProvider({ children }: { children: ReactNode }) {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const value = useMemo(() => ({ activeRowId, setActiveRowId }), [activeRowId]);
  return <SwipeableRowsContext.Provider value={value}>{children}</SwipeableRowsContext.Provider>;
}

const isLiquidGlass = isGlassSupported();
const BUTTON_SIZE = 42;
const BUTTON_HEIGHT = isLiquidGlass ? BUTTON_SIZE : ('100%' as const);
const TOP_OFFSET = isLiquidGlass ? ('50%' as const) : ('0%' as const);
const MARGIN_TOP = isLiquidGlass ? -BUTTON_SIZE / 2 : 0;
const MARGIN = isLiquidGlass ? 8 : 0;
const GAP = isLiquidGlass ? 8 : 1;
const TOTAL_OFFSET = MARGIN + GAP;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_SWIPE = SCREEN_WIDTH * (isLiquidGlass ? 0.8 : 0.85);
const MAX_BUTTON_WIDTH = MAX_SWIPE;
const TRIGGER_THRESHOLD = MAX_SWIPE * 0.8;

function snapPosition(actionCount: number): number {
  if (actionCount <= 1) return BUTTON_SIZE + TOTAL_OFFSET;
  return actionCount * (BUTTON_SIZE + GAP) + TOTAL_OFFSET;
}

export function SwipeableRow({
  children,
  actions = [],
  leadingActions = [],
  fullSwipeActionKey,
  fullSwipeLeadingActionKey,
  onFullSwipe,
  onFullSwipeLeading,
  enabled = true,
  rowId,
}: SwipeableRowProps) {
  const generatedId = useId();
  const id = rowId ?? generatedId;
  const rows = useContext(SwipeableRowsContext);
  const { colors, radius } = useTheme();

  const translateX = useSharedValue(0);
  const gestureContext = useSharedValue({ x: 0 });
  const isBeyondThreshold = useSharedValue(false);
  const iconShift = useSharedValue(0);

  const trailingActions = actions;
  const trailingFullActionKey = fullSwipeActionKey ?? trailingActions[trailingActions.length - 1]?.key;
  const trailingOpenSnap = snapPosition(trailingActions.length);
  const trailingFullAction =
    trailingActions.find((item) => item.key === trailingFullActionKey) ?? trailingActions[trailingActions.length - 1];
  const trailingSecondaryActions = trailingActions.filter((item) => item.key !== trailingFullAction?.key);

  const leadingFullActionKeyResolved = fullSwipeLeadingActionKey ?? leadingActions[leadingActions.length - 1]?.key;
  const leadingOpenSnap = snapPosition(leadingActions.length);
  const leadingFullAction =
    leadingActions.find((item) => item.key === leadingFullActionKeyResolved) ?? leadingActions[leadingActions.length - 1];
  const leadingSecondaryActions = leadingActions.filter((item) => item.key !== leadingFullAction?.key);

  const minTranslateX = trailingActions.length > 0 ? -MAX_SWIPE : 0;
  const maxTranslateX = leadingActions.length > 0 ? MAX_SWIPE : 0;

  const triggerHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const markActive = useCallback(() => {
    rows?.setActiveRowId(id);
  }, [id, rows]);

  const clearActiveRow = useCallback(() => {
    rows?.setActiveRowId(null);
  }, [rows]);

  const runFullSwipeTrailing = useCallback(() => {
    if (onFullSwipe) {
      onFullSwipe();
      return;
    }
    trailingFullAction?.onPress();
  }, [onFullSwipe, trailingFullAction]);

  const runFullSwipeLeading = useCallback(() => {
    if (onFullSwipeLeading) {
      onFullSwipeLeading();
      return;
    }
    leadingFullAction?.onPress();
  }, [leadingFullAction, onFullSwipeLeading]);

  const runAction = useCallback(
    (action: SwipeAction) => {
      action.onPress();
      rows?.setActiveRowId(null);
    },
    [rows],
  );

  useEffect(() => {
    if (rows?.activeRowId !== id) {
      translateX.value = withSpring(0);
      iconShift.value = withSpring(0);
      isBeyondThreshold.value = false;
    }
  }, [rows?.activeRowId, id, translateX, iconShift, isBeyondThreshold]);

  const panGesture = useMemo(() => {
    if (!enabled || (trailingActions.length === 0 && leadingActions.length === 0)) {
      return Gesture.Pan().enabled(false);
    }

    return Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-5, 5])
      .onStart(() => {
        gestureContext.value = { x: translateX.value };
        runOnJS(markActive)();
      })
      .onUpdate((event) => {
        const nextX = gestureContext.value.x + event.translationX;
        translateX.value = Math.max(minTranslateX, Math.min(maxTranslateX, nextX));

        const absX = Math.abs(translateX.value);
        const crossed = absX > TRIGGER_THRESHOLD;

        if (crossed && !isBeyondThreshold.value) {
          isBeyondThreshold.value = true;
          runOnJS(triggerHaptic)();
          iconShift.value = withSpring(1, { stiffness: 2000, damping: 150 });
        } else if (!crossed && isBeyondThreshold.value) {
          isBeyondThreshold.value = false;
          runOnJS(triggerHaptic)();
          iconShift.value = withSpring(0, { stiffness: 2000, damping: 150 });
        }
      })
      .onEnd(() => {
        const x = translateX.value;
        const absX = Math.abs(x);

        if (x > TRIGGER_THRESHOLD && leadingFullAction) {
          runOnJS(runFullSwipeLeading)();
          translateX.value = withSpring(1, {}, (finished) => {
            if (finished) {
              translateX.value = 0;
              iconShift.value = 0;
              isBeyondThreshold.value = false;
            }
          });
          runOnJS(clearActiveRow)();
          return;
        }

        if (x < -TRIGGER_THRESHOLD && trailingFullAction) {
          runOnJS(runFullSwipeTrailing)();
          translateX.value = withSpring(-1, {}, (finished) => {
            if (finished) {
              translateX.value = 0;
              iconShift.value = 0;
              isBeyondThreshold.value = false;
            }
          });
          runOnJS(clearActiveRow)();
          return;
        }

        if (x > BUTTON_SIZE && leadingActions.length > 0) {
          translateX.value = withSpring(leadingOpenSnap);
          return;
        }

        if (x < -BUTTON_SIZE && trailingActions.length > 0) {
          translateX.value = withSpring(-trailingOpenSnap);
          return;
        }

        translateX.value = withSpring(0);
        iconShift.value = withSpring(0);
        isBeyondThreshold.value = false;
        runOnJS(clearActiveRow)();
      });
  }, [
    enabled,
    trailingActions.length,
    leadingActions.length,
    gestureContext,
    translateX,
    isBeyondThreshold,
    iconShift,
    markActive,
    triggerHaptic,
    runFullSwipeTrailing,
    runFullSwipeLeading,
    clearActiveRow,
    trailingOpenSnap,
    leadingOpenSnap,
    leadingFullAction,
    trailingFullAction,
    minTranslateX,
    maxTranslateX,
  ]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!enabled || (trailingActions.length === 0 && leadingActions.length === 0)) {
    return <>{children}</>;
  }

  return (
    <View style={styles.swipeContainer}>
      <GestureDetector gesture={panGesture}>
        <Reanimated.View
          style={[styles.swipeContent, contentStyle, { backgroundColor: colors.secondarySystemBackground, borderRadius: radius.md }]}>
          {children}
        </Reanimated.View>
      </GestureDetector>

      <View style={styles.actionsBackground} pointerEvents='box-none'>
        {leadingSecondaryActions.map((action, index) => {
          const slotFromEdge = leadingSecondaryActions.length - index;
          return (
            <SecondaryActionButton
              key={action.key}
              action={action}
              side='leading'
              slotFromEdge={slotFromEdge}
              translateX={translateX}
              openSnap={leadingOpenSnap}
              onPress={() => runAction(action)}
            />
          );
        })}

        {leadingFullAction && (
          <FullActionButton
            action={leadingFullAction}
            side='leading'
            translateX={translateX}
            iconShift={iconShift}
            openSnap={leadingOpenSnap}
            onPress={() => runAction(leadingFullAction)}
          />
        )}

        {trailingSecondaryActions.map((action, index) => {
          const slotFromEdge = trailingSecondaryActions.length - index;
          return (
            <SecondaryActionButton
              key={action.key}
              action={action}
              side='trailing'
              slotFromEdge={slotFromEdge}
              translateX={translateX}
              openSnap={trailingOpenSnap}
              onPress={() => runAction(action)}
            />
          );
        })}

        {trailingFullAction && (
          <FullActionButton
            action={trailingFullAction}
            side='trailing'
            translateX={translateX}
            iconShift={iconShift}
            openSnap={trailingOpenSnap}
            onPress={() => runAction(trailingFullAction)}
          />
        )}
      </View>
    </View>
  );
}

function FullActionButton({
  action,
  side,
  translateX,
  iconShift,
  openSnap,
  onPress,
}: {
  action: SwipeAction;
  side: SwipeSide;
  translateX: SharedValue<number>;
  iconShift: SharedValue<number>;
  openSnap: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const isLeading = side === 'leading';

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        const isOpen = isLeading ? translateX.value >= openSnap - 10 : translateX.value <= -openSnap + 10;
        if (isOpen) {
          runOnJS(onPress)();
          translateX.value = withSpring(0);
          iconShift.value = withSpring(0);
        }
      }),
    [iconShift, isLeading, onPress, openSnap, translateX],
  );

  const buttonStyle = useAnimatedStyle(() => {
    const x = translateX.value;
    if (isLeading ? x <= 0 : x >= 0) return { width: 0, opacity: 0 };

    const absX = Math.abs(x);
    const width = Math.min(Math.max(0, absX - TOTAL_OFFSET + (isLiquidGlass ? 0 : 50)), MAX_BUTTON_WIDTH);

    return {
      width,
      opacity: interpolate(absX, [0, TOTAL_OFFSET], [0, 1], Extrapolation.CLAMP),
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const x = translateX.value;
    if (isLeading ? x <= 0 : x >= 0) return { transform: [{ translateX: 0 }] };

    const absX = Math.abs(x);
    const buttonWidth = Math.min(Math.max(0, absX - TOTAL_OFFSET + (isLiquidGlass ? 0 : 90)), MAX_BUTTON_WIDTH);
    const centerOffset = (buttonWidth - BUTTON_SIZE) / 2;
    const shift = interpolate(
      iconShift.value,
      [0, 1],
      isLeading ? [-centerOffset, 0] : [centerOffset, 0],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateX: shift }],
    };
  });

  return (
    <GestureDetector gesture={tapGesture}>
      <Reanimated.View
        style={[
          styles.actionButton,
          isLeading ? { left: MARGIN, justifyContent: 'flex-end' } : { right: MARGIN },
          { top: TOP_OFFSET, marginTop: MARGIN_TOP, backgroundColor: action.color },
          buttonStyle,
        ]}>
        <Reanimated.View style={[styles.iconContainer, iconStyle]}>
          <SwipeActionIcon action={action} />
        </Reanimated.View>
      </Reanimated.View>
    </GestureDetector>
  );
}

function SecondaryActionButton({
  action,
  side,
  slotFromEdge,
  translateX,
  openSnap,
  onPress,
}: {
  action: SwipeAction;
  side: SwipeSide;
  slotFromEdge: number;
  translateX: SharedValue<number>;
  openSnap: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const isLeading = side === 'leading';
  const slotOffset = slotFromEdge * (BUTTON_SIZE + GAP);
  const revealAt = TOTAL_OFFSET + slotOffset;

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        const isOpen = isLeading ? translateX.value >= openSnap - 10 : translateX.value <= -openSnap + 10;
        if (isOpen) {
          runOnJS(onPress)();
          translateX.value = withSpring(0);
        }
      }),
    [isLeading, onPress, openSnap, translateX],
  );

  const buttonStyle = useAnimatedStyle(() => {
    const x = translateX.value;
    if (isLeading ? x <= 0 : x >= 0) return { width: 0, opacity: 0 };

    const absX = Math.abs(x);
    if (absX <= revealAt) return { width: 0, opacity: 0 };

    return {
      width: BUTTON_SIZE,
      opacity: interpolate(absX, [revealAt, revealAt + 10], [0, 1], Extrapolation.CLAMP),
    };
  });

  return (
    <GestureDetector gesture={tapGesture}>
      <Reanimated.View
        style={[
          styles.actionButton,
          isLeading ? { left: MARGIN + slotOffset } : { right: MARGIN + slotOffset },
          { top: TOP_OFFSET, marginTop: MARGIN_TOP, backgroundColor: action.color },
          buttonStyle,
        ]}>
        <View style={styles.iconContainer}>
          <SwipeActionIcon action={action} />
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
}

function SwipeActionIcon({ action }: { action: SwipeAction }) {
  const { colors } = useTheme();

  if (Platform.OS === 'ios' && action.sfSymbol) {
    return (
      <SymbolView
        name={action.sfSymbol as never}
        size={22}
        tintColor={colors.onTint}
        weight='semibold'
        fallback={<Ionicons name={action.icon} size={22} color={colors.onTint} />}
      />
    );
  }

  return <Ionicons name={action.icon} size={22} color={colors.onTint} />;
}

const styles = StyleSheet.create({
  swipeContainer: {
    position: 'relative',
    overflow: 'hidden',
    alignSelf: 'flex-start',
    width: '100%',
  },
  actionsBackground: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
    overflow: 'hidden',
  },
  actionButton: {
    position: 'absolute',
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_SIZE / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  iconContainer: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeContent: {
    zIndex: 1,
    width: '100%',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
