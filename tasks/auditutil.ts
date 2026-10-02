// Check the existing export contract, not actual in-game learning levels.
// Keep this check separate from the generator's talent-list construction.
export function auditHeroTalentLists(
  heroes: Record<string, any>,
  generated: Record<string, any>,
) {
  const errors: string[] = [];
  for (const [hero, source] of Object.entries(heroes)) {
    const start = Number(source.AbilityTalentStart ?? 10);
    const slots = Object.entries(source).filter(([key, name]) => {
      const match = /^Ability(\d+)$/.exec(key);
      return (
        match &&
        Number(match[1]) >= start &&
        typeof name === "string" &&
        name !== ""
      );
    });
    const actual = generated[hero]?.talents;
    if (!Array.isArray(actual)) {
      errors.push(`Missing hero talent list: ${hero}`);
      continue;
    }
    if (actual.length !== slots.length)
      errors.push(
        `Hero talent count differs: ${hero}: expected ${slots.length}, got ${actual.length}`,
      );
    const seen = new Set<string>();
    for (const [index, entry] of actual.entries()) {
      if (typeof entry?.name !== "string") {
        errors.push(`Invalid hero talent entry: ${hero}: index ${index}`);
        continue;
      }
      if (seen.has(entry.name))
        errors.push(`Duplicate hero talent entry: ${hero}: ${entry.name}`);
      seen.add(entry.name);
    }
    for (const [index, [, name]] of slots.entries()) {
      if (actual[index]?.name !== name)
        errors.push(
          `Hero talent order/reference differs: ${hero}: index ${index}: expected ${name}`,
        );
      const level = Math.floor(index / 2) + 1;
      if (actual[index]?.level !== level)
        errors.push(
          `Hero talent export level differs: ${hero}: index ${index}: expected ${level}`,
        );
    }
  }
  return errors;
}

// Informational diagnostics for generated records outside the current talent set.
export function findUnnamedInactiveTalents(
  abilities: Record<string, { dname?: unknown }>,
  currentTalents: Set<string>,
) {
  return Object.entries(abilities)
    .filter(
      ([name, data]) =>
        name.startsWith("special_bonus") &&
        !currentTalents.has(name) &&
        !hasTalentName(data.dname),
    )
    .map(([name]) => ({ name }));
}
import {
  hasTalentName,
  hasTalentPlaceholder,
  isTalentModifier,
  talentValueEntries,
  type TalentValueCandidate,
} from "./util.ts";

export function scanTalentStructures(scripts: Record<string, any>) {
  const multiple: any[] = [];
  const adjacent: any[] = [];
  const objects: any[] = [];
  for (const [ability, script] of Object.entries(scripts)) {
    for (const [attribute, value] of talentValueEntries(script)) {
      if (!value || typeof value !== "object") continue;
      const modifiers = Object.entries(value).filter(([key]) =>
        isTalentModifier(key),
      );
      const entry = {
        ability,
        attribute,
        talents: modifiers.map(([key]) => key),
      };
      if (modifiers.length > 1) multiple.push(entry);
      if (
        modifiers.length &&
        Object.keys(value).some((key) =>
          /^special_bonus_(facet|scepter|shard)/.test(key),
        )
      )
        adjacent.push(entry);
      for (const [talent, raw] of modifiers)
        if (typeof raw !== "string")
          objects.push({ ability, attribute, talent, raw });
    }
  }
  return { multiple, adjacent, objects };
}

export function classifyTalentName(
  name: string,
  sourceName: unknown,
  candidates: TalentValueCandidate[],
  scripts: Record<string, any>,
  commentedDefinitions: Set<string>,
  commentedReferences = new Set<string>(),
) {
  if (!hasTalentName(sourceName)) return ["missing-template"];
  if (!hasTalentPlaceholder(sourceName)) return [];
  const reasons = new Set<string>();
  const keys = [...sourceName.matchAll(/\{s:([^}]+)\}/gi)].map((m) =>
    m[1].toLowerCase(),
  );
  if (!keys.length) reasons.add("unsupported-placeholder");
  for (const key of keys) {
    const group = candidates.filter((c) => c.talent === name && c.key === key);
    const base = group.filter((c) => c.condition === "base");
    if (!base.length) {
      reasons.add(group.length ? "conditional-only" : "missing-source-value");
      continue;
    }
    const priority = Math.max(...base.map((c) => c.priority));
    const relevant = base.filter((c) => c.priority === priority);
    for (const c of relevant) if (c.reason) reasons.add(c.reason);
    if (
      new Set(relevant.filter((c) => c.semantic).map((c) => c.semantic)).size >
      1
    )
      reasons.add("conflicting-source-values");
  }
  if (!scripts[name])
    reasons.add(
      commentedDefinitions.has(name)
        ? "commented-definition"
        : "absent-definition",
    );
  if (commentedReferences.has(name)) reasons.add("commented-source-reference");
  return [...reasons].sort();
}
