import { setValue, getValue, storageKeys } from '@/constants/storage';

type WelcomeListener = () => void;

const welcomeListeners = new Set<WelcomeListener>();

export function subscribeWelcomeReplay(listener: WelcomeListener): () => void {
  welcomeListeners.add(listener);
  return () => {
    welcomeListeners.delete(listener);
  };
}

export async function shouldShowWelcome(): Promise<boolean> {
  const completed = await getValue<boolean>(storageKeys.WELCOME_COMPLETED_KEY, false);
  return !completed;
}

export async function markWelcomeCompleted(): Promise<void> {
  await setValue(storageKeys.WELCOME_COMPLETED_KEY, true);
}

export async function resetWelcomeData(): Promise<void> {
  await setValue(storageKeys.WELCOME_COMPLETED_KEY, false);
}

export async function replayWelcome(): Promise<void> {
  await resetWelcomeData();
  for (const listener of welcomeListeners) listener();
}
