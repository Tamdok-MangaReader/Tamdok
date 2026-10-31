import type { InstalledSource, TamdokSourceModule } from "../shared/types";
import type { SourceRunner } from "../shared/source-runner";
import {
  normalizeManga,
  normalizeMangaPageResult,
} from "../shared/normalize-manga";
import { expandZipPages } from "../shared/zip-pages";
import {
  readInstalledFilters,
  readInstalledScript,
} from "../shared/source-manager";
import { createTamdokRunner, hydrateTamdokDefaults } from "./runtime";
import { getEffectiveSourceSettings } from "@/services/source-settings";
import { resolveSourceBaseUrl } from "../shared/fetch-headers";

// Loads a Tamdok source and adapts its module to the common SourceRunner interface.
// Missing optional functions are mapped to safe defaults (empty page, unchanged manga, ...).
export async function createTamdokSourceRunner(
  source: InstalledSource,
): Promise<SourceRunner> {
  const script = await readInstalledScript(source);
  if (!script) {
    throw new Error("Tamdok source script not found");
  }

  // Tamdok sources are CommonJS-style scripts. The script is evaluated with a `module`/`exports`
  // object and must assign `exports.source`. Sources are user-installed code and are not sandboxed
  // beyond what the host passes in, so only install sources you trust.
  const moduleRef: { exports: { source?: TamdokSourceModule } } = {
    exports: {},
  };
  const run = new Function("module", "exports", script) as (
    module: typeof moduleRef,
    exports: typeof moduleRef.exports,
  ) => void;
  run(moduleRef, moduleRef.exports);
  const mod = moduleRef.exports.source;
  if (!mod || typeof mod !== "object") {
    throw new Error("Invalid Tamdok source module");
  }

  const sourceBaseUrl = resolveSourceBaseUrl(source.manifest);
  const { module, context } = createTamdokRunner(source.id, mod, sourceBaseUrl);
  const settings = await getEffectiveSourceSettings(source);
  // Load the user's saved settings so `ctx.defaults.get` returns them synchronously.
  hydrateTamdokDefaults(source.id, settings);

  return {
    kind: "tamdok",
    sourceId: source.id,
    getSearchMangaList: async (params) => {
      if (!module.getSearchMangaList) {
        return { entries: [], hasNextPage: false };
      }
      return normalizeMangaPageResult(
        await module.getSearchMangaList(params, context),
      );
    },
    getMangaList: module.getMangaList
      ? async (listing, page) =>
          normalizeMangaPageResult(
            await module.getMangaList!(listing, page, context),
          )
      : undefined,
    getMangaUpdate: async (manga, needsDetails, needsChapters) => {
      if (!module.getMangaUpdate) return manga;
      return normalizeManga(
        await module.getMangaUpdate(
          manga,
          needsDetails,
          needsChapters,
          context,
        ),
      );
    },
    getPageList: async (manga, chapter) => {
      if (!module.getPageList) return [];
      return expandZipPages(await module.getPageList(manga, chapter, context));
    },
    getHome: module.getHome ? async () => module.getHome!(context) : undefined,
    // Listings can come from the module itself or from the static manifest.
    getListings: module.getListings
      ? async () => module.getListings!(context)
      : source.manifest.listings
        ? async () => source.manifest.listings!
        : undefined,
    // Filters can come from the module; otherwise fall back to the package's filters.json.
    getFilters: module.getFilters
      ? async () => module.getFilters!(context)
      : async () => (await readInstalledFilters(source)) ?? [],
  };
}
