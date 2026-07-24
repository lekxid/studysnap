const explicitWebPatterns = [
  /\bsearch\s+(?:the\s+)?(?:web|internet|online)\b/i,
  /\b(?:check|chk)\s+(?:the\s+)?(?:web|internet|online)\b/i,
  /\b(?:look|check)\s+it\s+up\b/i,
  /\bsearch\s+it\b/i,
  /\bbrowse\s+(?:for|the|online|web|internet)\b/i,
  /\bverify\s+(?:it\s+)?(?:online|on\s+the\s+web|on\s+the\s+internet)\b/i,
  /\bfind\s+(?:the\s+)?latest\b/i,
  /\bfind\s+(?:current|recent|up[- ]to[- ]date)\b/i,
  /\bgive\s+me\s+(?:the\s+)?sources?\b/i,
  /\bcheck\s+sources?\b/i,
];

const currentInformationPatterns = [
  /\bcurrent\b/i,
  /\blatest\b/i,
  /\btoday\b/i,
  /\bthis\s+week\b/i,
  /\brecent(?:ly)?\b/i,
  /\bnow\b/i,
  /\bup[- ]to[- ]date\b/i,
  /\bnews\b/i,
  /\bprice\b/i,
  /\bweather\b/i,
  /\bschedule\b/i,
  /\bopening\s+hours?\b/i,
  /\bwho\s+is\s+(?:the\s+)?current\b/i,
];

const connectivityOnlyPatterns = [
  /\binternet\s+connection\b/i,
  /\bwi[- ]?fi\b/i,
  /\bmobile\s+data\b/i,
  /\brouter\b/i,
  /\bspeed\s+test\b/i,
  /\bnetwork\s+connection\b/i,
];

function normalizeIntentText(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function hasExplicitWebRequest(
  value: string,
) {
  const normalized =
    normalizeIntentText(value);

  return explicitWebPatterns.some(
    (pattern) =>
      pattern.test(normalized),
  );
}

export function asksForLiveResearch(
  value: string,
) {
  const normalized =
    normalizeIntentText(value);

  if (
    hasExplicitWebRequest(
      normalized
    )
  ) {
    return true;
  }

  if (
    connectivityOnlyPatterns.some(
      (pattern) =>
        pattern.test(normalized),
    )
  ) {
    return false;
  }

  return currentInformationPatterns.some(
    (pattern) =>
      pattern.test(normalized),
  );
}
