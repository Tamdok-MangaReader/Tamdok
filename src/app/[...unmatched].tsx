import { Redirect, usePathname } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';

import {
  buildRegistrySettingsHref,
  parseRegistryDeepLink,
  setPendingRegistryDeepLink,
} from '@/utils/registry-deep-link';

export default function Unmatched() {
  const pathname = usePathname();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const initialUrl = await Linking.getInitialURL();
      const candidates = [
        initialUrl,
        pathname,
        pathname ? `tamdok:/${pathname}` : null,
        pathname ? `tamdok://${pathname.replace(/^\//, '')}` : null,
      ].filter((value): value is string => Boolean(value));

      for (const candidate of candidates) {
        const registryUrl = parseRegistryDeepLink(candidate);
        if (!registryUrl) continue;

        if (!cancelled) {
          setPendingRegistryDeepLink(registryUrl);
          setHref(buildRegistrySettingsHref(registryUrl));
        }
        return;
      }

      if (!cancelled) setHref('/');
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!href) return null;
  return <Redirect href={href} />;
}
