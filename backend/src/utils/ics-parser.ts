/** Minimal ICS VEVENT parser (date-only DTSTART). */
export function parseIcsEvents(icsText: string): Array<{ name: string; date: string; description?: string }> {
  const events: Array<{ name: string; date: string; description?: string }> = [];
  const physicalLines = icsText.split(String.fromCharCode(10)).map((line, index) => {
    const withoutCarriageReturn = line.endsWith(String.fromCharCode(13)) ? line.slice(0, -1) : line;
    return index === 0 && withoutCarriageReturn.charCodeAt(0) === 0xfeff
      ? withoutCarriageReturn.slice(1)
      : withoutCarriageReturn;
  });
  const lines: string[] = [];
  for (const line of physicalLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  let block: string[] | null = null;
  for (const line of lines) {
    const marker = line.trim().toUpperCase();
    if (marker === 'BEGIN:VEVENT') {
      block = [];
      continue;
    }
    if (marker === 'END:VEVENT') {
      if (block) {
        const summary = getPropertyValue(block, 'SUMMARY')?.trim();
        const dtstart = getDateStartValue(block);
        const description = getPropertyValue(block, 'DESCRIPTION')?.trim();
        if (summary && dtstart && isValidDateOnly(dtstart)) {
          const date = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
          const unescapedSummary = summary.split(`${String.fromCharCode(92)}n`).join(' ');
          events.push({ name: unescapedSummary, date, description });
        }
      }
      block = null;
      continue;
    }
    if (block) block.push(line);
  }

  return events;
}

function getPropertyValue(lines: string[], name: string): string | undefined {
  let foundValue: string | undefined;
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const propertyName = line.slice(0, separator).split(';', 1)[0].toUpperCase();
    if (propertyName !== name) continue;
    if (foundValue !== undefined) return undefined;
    foundValue = line.slice(separator + 1);
  }
  return foundValue;
}

function getDateStartValue(lines: string[]): string | undefined {
  let foundValue: string | undefined;
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const parts = line.slice(0, separator).split(';');
    if (parts[0].toUpperCase() !== 'DTSTART') continue;
    if (foundValue !== undefined) return undefined;
    const parameters = parts.slice(1).map((parameter) => parameter.toUpperCase());
    const valueParameters = parameters.filter((parameter) => parameter.startsWith('VALUE='));
    if (valueParameters.length !== 1 || valueParameters[0] !== 'VALUE=DATE') return undefined;
    foundValue = line.slice(separator + 1);
  }
  return foundValue;
}

function isValidDateOnly(value: string): boolean {
  if (value.length !== 8 || [...value].some((character) => character < '0' || character > '9')) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (year < 1 || month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}
