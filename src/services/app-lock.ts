type LocalAuthModule = typeof import("expo-local-authentication");

let modulePromise: Promise<LocalAuthModule | null> | null = null;

function loadModule(): Promise<LocalAuthModule | null> {
  modulePromise ??= import("expo-local-authentication").then(
    (module) => module,
    () => null,
  );
  return modulePromise;
}

export async function isBiometricAuthAvailable(): Promise<boolean> {
  const module = await loadModule();
  if (!module) return false;
  try {
    const [hardware, enrolled] = await Promise.all([
      module.hasHardwareAsync(),
      module.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

export async function authenticateUser(
  promptMessage: string,
  cancelLabel: string,
): Promise<boolean> {
  const module = await loadModule();
  if (!module) return false;
  try {
    const result = await module.authenticateAsync({
      promptMessage,
      cancelLabel,
    });
    return result.success;
  } catch {
    return false;
  }
}
