import legacy from "./data/legacy-talent-names.json" with { type: "json" };
import { hasTalentName, hasTalentPlaceholder } from "./util.ts";

export const legacyTalentSource = legacy.source;

export function applyLegacyTalentNames(
  abilities: Record<string, { dname?: string }>,
  currentTalents: Set<string>,
  labels: Record<string, string> = legacy.labels,
) {
  const fallbacks: { name: string; sourceName?: string; dname: string }[] = [];
  for (const [name, ability] of Object.entries(abilities)) {
    if (!name.startsWith("special_bonus") || currentTalents.has(name)) continue;
    if (hasTalentName(ability.dname) && !hasTalentPlaceholder(ability.dname))
      continue;
    const previous = labels[name];
    if (!hasTalentName(previous) || hasTalentPlaceholder(previous)) continue;
    fallbacks.push({ name, sourceName: ability.dname, dname: previous });
    ability.dname = previous;
  }
  return fallbacks;
}
