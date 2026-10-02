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
  abilities: Record<string, { dname?: string }>,
  currentTalents: Set<string>,
) {
  return Object.entries(abilities)
    .filter(
      ([name, data]) =>
        name.startsWith("special_bonus") &&
        !currentTalents.has(name) &&
        (typeof data.dname !== "string" || !data.dname.trim()),
    )
    .map(([name]) => ({ name }));
}
