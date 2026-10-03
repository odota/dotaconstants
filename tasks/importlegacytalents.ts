import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { hasTalentName, hasTalentPlaceholder } from "./util.ts";

// Freeze public display compatibility, not historical game-value truth.
const ref = "b4b5a8299de5f3e0704e62fdd04a6a54c4d4548e";
const file = "build/abilities.json";
const bytes = execFileSync("git", ["show", `${ref}:${file}`], {
  maxBuffer: 16 * 1024 * 1024,
});
const abilities = JSON.parse(bytes.toString("utf8"));
const labels = Object.fromEntries(
  Object.entries(abilities)
    .filter(
      ([name, data]: [string, any]) =>
        name.startsWith("special_bonus") &&
        hasTalentName(data.dname) &&
        !hasTalentPlaceholder(data.dname),
    )
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([name, data]: [string, any]) => [name, data.dname]),
);
fs.mkdirSync("tasks/data", { recursive: true });
fs.writeFileSync(
  "tasks/data/legacy-talent-names.json",
  JSON.stringify(
    {
      source: {
        repository: "https://github.com/odota/dotaconstants",
        ref,
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        meaning:
          "Previously published display labels; not verified historical game values",
      },
      labels,
    },
    null,
    2,
  ) + "\n",
);
