/** Minimal ICS VEVENT parser (date-only DTSTART). */
export function parseIcsEvents(icsText: string): Array<{ name: string; date: string; description?: string }> {
  const events: Array<{ name: string; date: string; description?: string }> = [];
  const blocks = icsText.split(/BEGIN:VEVENT/i);
  for (const block of blocks.slice(1)) {
    const summary = block.match(/SUMMARY[^:]*:(.+)/i)?.[1]?.trim();
    const dtstart = block.match(/DTSTART[^:]*:(\d{8})/i)?.[1];
    const desc = block.match(/DESCRIPTION[^:]*:(.+)/i)?.[1]?.trim();
    if (!summary || !dtstart) continue;
    const date = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    events.push({ name: summary.replace(/\\n/g, ' '), date, description: desc });
  }
  return events;
}
