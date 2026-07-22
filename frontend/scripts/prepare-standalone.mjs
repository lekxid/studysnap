import {
  access,
  cp,
  mkdir,
  rm,
} from "node:fs/promises";

import path from "node:path";
import process from "node:process";

const frontendRoot = process.cwd();

const nextRoot = path.join(
  frontendRoot,
  ".next",
);

const standaloneRoot = path.join(
  nextRoot,
  "standalone",
);

const standaloneServer = path.join(
  standaloneRoot,
  "server.js",
);

const sourceStatic = path.join(
  nextRoot,
  "static",
);

const targetStatic = path.join(
  standaloneRoot,
  ".next",
  "static",
);

const sourcePublic = path.join(
  frontendRoot,
  "public",
);

const targetPublic = path.join(
  standaloneRoot,
  "public",
);

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function copyRequiredDirectory({
  source,
  target,
  label,
}) {
  if (!(await exists(source))) {
    throw new Error(
      `${label} source directory is missing: ${source}`,
    );
  }

  await rm(
    target,
    {
      recursive: true,
      force: true,
    },
  );

  await mkdir(
    path.dirname(target),
    {
      recursive: true,
    },
  );

  await cp(
    source,
    target,
    {
      recursive: true,
      force: true,
    },
  );

  console.log(
    `Prepared ${label}: ${target}`,
  );
}

if (!(await exists(standaloneServer))) {
  throw new Error(
    `Standalone server is missing: ${standaloneServer}`,
  );
}

await copyRequiredDirectory({
  source: sourceStatic,
  target: targetStatic,
  label: "Next.js static assets",
});

if (await exists(sourcePublic)) {
  await rm(
    targetPublic,
    {
      recursive: true,
      force: true,
    },
  );

  await cp(
    sourcePublic,
    targetPublic,
    {
      recursive: true,
      force: true,
    },
  );

  console.log(
    `Prepared public assets: ${targetPublic}`,
  );
} else {
  console.log(
    "No public directory was present; nothing to copy.",
  );
}

console.log(
  "Standalone production bundle is complete.",
);
