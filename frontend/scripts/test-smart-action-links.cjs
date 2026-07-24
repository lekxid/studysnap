/* eslint-disable @typescript-eslint/no-require-imports */

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

const ts =
  require("typescript");


const sourcePath =
  path.join(
    __dirname,
    "../src/lib/smartActionLinks.ts",
  );

const source =
  fs.readFileSync(
    sourcePath,
    "utf8",
  );

const compiled =
  ts.transpileModule(
    source,
    {
      compilerOptions: {
        module:
          ts.ModuleKind.CommonJS,
        target:
          ts.ScriptTarget.ES2020,
        strict: true,
      },
      fileName:
        sourcePath,
      reportDiagnostics: true,
    },
  );

const diagnostics =
  compiled.diagnostics || [];

if (diagnostics.length > 0) {
  const formatted =
    diagnostics.map(
      (diagnostic) =>
        ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          "\n",
        ),
    );

  throw new Error(
    formatted.join("\n"),
  );
}

const moduleRecord = {
  exports: {},
};

const execute =
  new Function(
    "module",
    "exports",
    "require",
    "__filename",
    "__dirname",
    compiled.outputText,
  );

execute(
  moduleRecord,
  moduleRecord.exports,
  require,
  sourcePath,
  path.dirname(sourcePath),
);

const {
  extractSmartActionLinks,
} = moduleRecord.exports;


assert.equal(
  typeof extractSmartActionLinks,
  "function",
);

const links =
  extractSmartActionLinks(`
[Get the app](https://apps.apple.com/ca/app/example/id123)
[Android](https://play.google.com/store/apps/details?id=com.example)
[Listen](https://open.spotify.com/track/example)
[Watch](https://www.youtube.com/watch?v=example)
[Project source](https://github.com/example/project)
`);

assert.equal(
  links.length,
  5,
);

const appStore =
  links.find(
    (link) =>
      link.kind === "app_store",
  );

assert.ok(appStore);
assert.equal(
  appStore.label,
  "Open App Store",
);
assert.equal(
  appStore.badge,
  "Store",
);

const googlePlay =
  links.find(
    (link) =>
      link.kind === "google_play",
  );

assert.ok(googlePlay);
assert.equal(
  googlePlay.badge,
  "Store",
);

const spotify =
  links.find(
    (link) =>
      link.kind === "spotify",
  );

assert.ok(spotify);
assert.equal(
  spotify.label,
  "Open Spotify",
);
assert.equal(
  spotify.badge,
  "Platform",
);

const youtube =
  links.find(
    (link) =>
      link.kind === "youtube",
  );

assert.ok(youtube);
assert.equal(
  youtube.badge,
  "Platform",
);

const github =
  links.find(
    (link) =>
      link.host === "github.com",
  );

assert.ok(github);
assert.equal(
  github.kind,
  "source",
);
assert.equal(
  github.badge,
  null,
);
assert.equal(
  github.label,
  "Project source",
);

assert.deepEqual(
  extractSmartActionLinks(
    "[Unsafe](http://play.google.com/store/apps/details?id=test)"
  ),
  [],
);

assert.deepEqual(
  extractSmartActionLinks(
    "[Invalid](javascript:alert(1))"
  ),
  [],
);

const duplicates =
  extractSmartActionLinks(`
[First](https://apps.apple.com/ca/app/example/id123)
https://apps.apple.com/ca/app/example/id123
`);

assert.equal(
  duplicates.length,
  1,
);

const plainSource =
  extractSmartActionLinks(
    "Read https://example.edu/research."
  );

assert.equal(
  plainSource.length,
  1,
);

assert.equal(
  plainSource[0].kind,
  "source",
);

assert.equal(
  plainSource[0].badge,
  null,
);

assert.equal(
  plainSource[0].href,
  "https://example.edu/research",
);

console.log(
  "Smart Action link parser tests passed."
);
