import * as StoreReview from "expo-store-review";
import { Alert, Linking } from "react-native";

import { t } from "@/constants/locales";
import { getValue, setValue, storageKeys } from "@/constants/storage";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CHAPTERS_READ = 10;
const MIN_DAYS_SINCE_FIRST_LAUNCH = 3;
const SNOOZE_LATER_DAYS = 30;
const SNOOZE_AFTER_RATING_DAYS = 120;
const SNOOZE_AFTER_NEGATIVE_DAYS = 180;
const FEEDBACK_EMAIL = "me@sleaf.dev";

type ReviewPromptState = {
  firstSeenAt: number | null;
  chaptersRead: number;
  nextEligibleAt: number;
};

const DEFAULT_STATE: ReviewPromptState = {
  firstSeenAt: null,
  chaptersRead: 0,
  nextEligibleAt: 0,
};

let promptVisible = false;

async function readState(): Promise<ReviewPromptState> {
  const stored = await getValue<Partial<ReviewPromptState>>(
    storageKeys.REVIEW_PROMPT,
    {},
  );
  return { ...DEFAULT_STATE, ...stored };
}

async function patchState(patch: Partial<ReviewPromptState>): Promise<void> {
  const current = await readState();
  await setValue(storageKeys.REVIEW_PROMPT, { ...current, ...patch });
}

export async function noteChapterFinished(): Promise<void> {
  const state = await readState();
  await patchState({ chaptersRead: state.chaptersRead + 1 });
}

function snooze(days: number): Promise<void> {
  return patchState({ nextEligibleAt: Date.now() + days * DAY_MS });
}

function askForFeedback(): void {
  Alert.alert(t("review_feedback_title"), t("review_feedback_message"), [
    { text: t("cancel"), style: "cancel" },
    {
      text: t("review_feedback_send"),
      onPress: () =>
        void Linking.openURL(
          `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Tamdok feedback")}`,
        ),
    },
  ]);
}

export async function maybeAskForReview(): Promise<void> {
  if (promptVisible) return;
  const now = Date.now();
  const state = await readState();

  if (state.firstSeenAt === null) {
    await patchState({ firstSeenAt: now });
    return;
  }
  if (state.chaptersRead < MIN_CHAPTERS_READ) return;
  if (now - state.firstSeenAt < MIN_DAYS_SINCE_FIRST_LAUNCH * DAY_MS) return;
  if (now < state.nextEligibleAt) return;
  if (!(await StoreReview.hasAction())) return;

  promptVisible = true;
  Alert.alert(
    t("review_prompt_title"),
    t("review_prompt_message"),
    [
      {
        text: t("review_prompt_later"),
        style: "cancel",
        onPress: () => {
          promptVisible = false;
          void snooze(SNOOZE_LATER_DAYS);
        },
      },
      {
        text: t("review_prompt_no"),
        onPress: () => {
          promptVisible = false;
          void snooze(SNOOZE_AFTER_NEGATIVE_DAYS);
          askForFeedback();
        },
      },
      {
        text: t("review_prompt_yes"),
        isPreferred: true,
        onPress: () => {
          promptVisible = false;
          void snooze(SNOOZE_AFTER_RATING_DAYS);
          void StoreReview.requestReview();
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: () => {
        promptVisible = false;
      },
    },
  );
}
