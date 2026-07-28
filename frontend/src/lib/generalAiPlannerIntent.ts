export type GeneralAIPlannerPriority =
  | "Low"
  | "Medium"
  | "High";

export type GeneralAIPlannerDraft = {
  date: string | null;
  time: string | null;
  durationMinutes: number | null;
  priority: GeneralAIPlannerPriority | null;
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function pad(
  value: number,
): string {
  return String(value).padStart(
    2,
    "0",
  );
}

function toLocalDateValue(
  value: Date,
): string {
  return [
    value.getFullYear(),
    pad(value.getMonth() + 1),
    pad(value.getDate()),
  ].join("-");
}

function validDateInput(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  const parsed =
    new Date(
      year,
      month - 1,
      day,
    );

  return (
    parsed.getFullYear() === year
    && parsed.getMonth() ===
      month - 1
    && parsed.getDate() === day
  );
}

function addDays(
  value: Date,
  amount: number,
): Date {
  const next =
    new Date(value);

  next.setHours(
    12,
    0,
    0,
    0,
  );

  next.setDate(
    next.getDate() + amount,
  );

  return next;
}

function nextWeekday(
  now: Date,
  weekday: number,
  forceNextWeek: boolean,
): Date {
  let distance =
    (
      weekday
      - now.getDay()
      + 7
    ) % 7;

  if (
    distance === 0
    || forceNextWeek
  ) {
    distance += 7;
  }

  return addDays(
    now,
    distance,
  );
}

function extractDate(
  text: string,
  now: Date,
): string | null {
  const isoMatch =
    text.match(
      /\b(20\d{2}-\d{2}-\d{2})\b/,
    );

  if (
    isoMatch
    && validDateInput(
      isoMatch[1],
    )
  ) {
    return isoMatch[1];
  }

  if (
    /\bday after tomorrow\b/.test(
      text,
    )
  ) {
    return toLocalDateValue(
      addDays(now, 2),
    );
  }

  if (/\btomorrow\b/.test(text)) {
    return toLocalDateValue(
      addDays(now, 1),
    );
  }

  if (/\btoday\b/.test(text)) {
    return toLocalDateValue(now);
  }

  const weekdayMatch =
    text.match(
      /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
    );

  if (weekdayMatch) {
    const weekday =
      WEEKDAYS.indexOf(
        weekdayMatch[2] as
          typeof WEEKDAYS[number],
      );

    return toLocalDateValue(
      nextWeekday(
        now,
        weekday,
        Boolean(
          weekdayMatch[1],
        ),
      ),
    );
  }

  return null;
}

function extractTime(
  text: string,
): string | null {
  const match =
    text.match(
      /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/,
    )
    ?? text.match(
      /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/,
    );

  if (!match) {
    return null;
  }

  let hour =
    Number(match[1]);

  const minute =
    Number(match[2] || "0");

  const meridiem =
    match[3]?.toLowerCase()
      ?? null;

  if (
    !Number.isInteger(hour)
    || !Number.isInteger(minute)
    || minute < 0
    || minute > 59
  ) {
    return null;
  }

  if (meridiem) {
    if (
      hour < 1
      || hour > 12
    ) {
      return null;
    }

    if (
      meridiem === "pm"
      && hour !== 12
    ) {
      hour += 12;
    }

    if (
      meridiem === "am"
      && hour === 12
    ) {
      hour = 0;
    }
  } else {
    if (
      hour < 0
      || hour > 23
    ) {
      return null;
    }

    // A plain study time such as "at 7"
    // defaults to evening. The user still
    // reviews the value before creation.
    if (
      hour >= 1
      && hour <= 7
    ) {
      hour += 12;
    }
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function extractDuration(
  text: string,
): number | null {
  const match =
    text.match(
      /\bfor\s+(\d{1,4})\s*(minutes?|mins?|min|hours?|hrs?|hr)\b/,
    );

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  if (
    !Number.isInteger(amount)
    || amount < 1
  ) {
    return null;
  }

  const unit =
    match[2].toLowerCase();

  const minutes =
    unit.startsWith("h")
      ? amount * 60
      : amount;

  return minutes <= 1440
    ? minutes
    : null;
}

function extractPriority(
  text: string,
): GeneralAIPlannerPriority | null {
  if (
    /\b(?:high priority|urgent|very important)\b/.test(
      text,
    )
  ) {
    return "High";
  }

  if (
    /\b(?:low priority|not urgent|whenever)\b/.test(
      text,
    )
  ) {
    return "Low";
  }

  if (
    /\bmedium priority\b/.test(
      text,
    )
  ) {
    return "Medium";
  }

  return null;
}

export function parseGeneralAIPlannerDraft(
  value: string,
  now = new Date(),
): GeneralAIPlannerDraft {
  const text =
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  return {
    date:
      extractDate(
        text,
        now,
      ),
    time:
      extractTime(text),
    durationMinutes:
      extractDuration(text),
    priority:
      extractPriority(text),
  };
}

export function mergeGeneralAIPlannerDateTime(
  currentValue: string,
  draft: GeneralAIPlannerDraft,
): string {
  const currentMatch =
    currentValue.match(
      /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/,
    );

  const fallback =
    new Date();

  const currentDate =
    currentMatch?.[1]
    ?? toLocalDateValue(fallback);

  const currentTime =
    currentMatch?.[2]
    ?? `${pad(fallback.getHours())}:${pad(
      fallback.getMinutes(),
    )}`;

  return [
    draft.date
      ?? currentDate,
    draft.time
      ?? currentTime,
  ].join("T");
}
