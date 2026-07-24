export type SmartActionKind =
  | "app_store"
  | "google_play"
  | "microsoft_store"
  | "apple_music"
  | "spotify"
  | "youtube"
  | "source";


export type SmartActionBadge =
  | "Store"
  | "Platform"
  | null;


export type SmartActionLink = {
  href: string;
  label: string;
  host: string;
  kind: SmartActionKind;
  badge: SmartActionBadge;
};


function safeHttpsUrl(
  value: string,
): URL | null {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:"
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}


function normalizedHost(
  url: URL,
) {
  return url.hostname
    .toLowerCase()
    .replace(/^www\./, "");
}


function hostMatches(
  host: string,
  domain: string,
) {
  return (
    host === domain ||
    host.endsWith(
      `.${domain}`
    )
  );
}


function classifyHost(
  host: string,
): {
  kind: SmartActionKind;
  badge: SmartActionBadge;
} {
  if (
    hostMatches(
      host,
      "apps.apple.com",
    )
  ) {
    return {
      kind: "app_store",
      badge: "Store",
    };
  }

  if (
    hostMatches(
      host,
      "play.google.com",
    )
  ) {
    return {
      kind: "google_play",
      badge: "Store",
    };
  }

  if (
    hostMatches(
      host,
      "apps.microsoft.com",
    )
  ) {
    return {
      kind: "microsoft_store",
      badge: "Store",
    };
  }

  if (
    hostMatches(
      host,
      "music.apple.com",
    )
  ) {
    return {
      kind: "apple_music",
      badge: "Platform",
    };
  }

  if (
    hostMatches(
      host,
      "open.spotify.com",
    ) ||
    hostMatches(
      host,
      "spotify.com",
    )
  ) {
    return {
      kind: "spotify",
      badge: "Platform",
    };
  }

  if (
    hostMatches(
      host,
      "youtube.com",
    ) ||
    hostMatches(
      host,
      "youtu.be",
    )
  ) {
    return {
      kind: "youtube",
      badge: "Platform",
    };
  }

  return {
    kind: "source",
    badge: null,
  };
}


function defaultLabel(
  kind: SmartActionKind,
  host: string,
) {
  const labels: Record<
    SmartActionKind,
    string
  > = {
    app_store: "Open App Store",
    google_play: "Open Google Play",
    microsoft_store:
      "Open Microsoft Store",
    apple_music:
      "Listen on Apple Music",
    spotify: "Open Spotify",
    youtube: "Open YouTube",
    source: host,
  };

  return labels[kind];
}


function cleanLabel(
  value: string,
) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim();

  if (
    !normalized ||
    /^https?:\/\//i.test(
      normalized
    )
  ) {
    return "";
  }

  if (normalized.length > 64) {
    return (
      normalized.slice(
        0,
        61,
      )
      + "..."
    );
  }

  return normalized;
}


function trimPlainUrl(
  value: string,
) {
  return value.replace(
    /[.,;:!?\])}]+$/,
    "",
  );
}


export function extractSmartActionLinks(
  content: string,
): SmartActionLink[] {
  const links:
    SmartActionLink[] = [];

  const seen =
    new Set<string>();

  const tokenPattern =
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<]+)/gi;

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        tokenPattern.exec(
          content
        )
    ) !== null
  ) {
    const markdownLabel =
      match[1] || "";

    const candidate =
      match[2] ||
      trimPlainUrl(
        match[3] || "",
      );

    const url =
      safeHttpsUrl(
        candidate
      );

    if (!url) {
      continue;
    }

    const href =
      url.toString();

    if (seen.has(href)) {
      continue;
    }

    seen.add(href);

    const host =
      normalizedHost(url);

    const classification =
      classifyHost(host);

    const suppliedLabel =
      cleanLabel(
        markdownLabel
      );

    links.push({
      href,
      host,
      kind:
        classification.kind,
      badge:
        classification.badge,
      label:
        classification.kind ===
          "source" &&
        suppliedLabel
          ? suppliedLabel
          : defaultLabel(
              classification.kind,
              host,
            ),
    });

    if (links.length >= 10) {
      break;
    }
  }

  return links;
}
