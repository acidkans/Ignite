// @anchor leaves-google-calendar-cid
/// cid = base64 adresu kalendarza urlopowego (airtel.urlopy@gmail.com) — link „otwórz w swoim Google".
const GOOGLE_CALENDAR_CID = 'YWlydGVsLnVybG9weUBnbWFpbC5jb20';

// @anchor leaves-google-calendar-url
const GOOGLE_CALENDAR_URL = `https://calendar.google.com/calendar/u/0/r?cid=${GOOGLE_CALENDAR_CID}`;

// @anchor leaves-google-calendar-embed-url
/// Podgląd wewnątrz aplikacji — wymaga, by kalendarz był udostępniony publicznie.
const GOOGLE_CALENDAR_EMBED_URL =
    'https://calendar.google.com/calendar/embed?src=airtel.urlopy%40gmail.com&ctz=Europe%2FWarsaw&mode=MONTH&showTitle=0&showPrint=0&showCalendars=0&showTz=0&bgcolor=%23111827';

// @anchor leaves-calendar-tab
// Zakładka „Kalendarz" — wspólny kalendarz urlopowy Google, widoczny dla każdego użytkownika modułu.
export default function LeavesCalendarTab() {
    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {/* @anchor link-google-calendar */}
                <a
                    href={GOOGLE_CALENDAR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Otwórz kalendarz urlopowy na swoim koncie Google"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 transition-colors"
                >
                    📅 Otwórz kalendarz urlopowy w Google
                </a>
                <span className="text-[11px] text-gray-500 break-all">{GOOGLE_CALENDAR_URL}</span>
            </div>

            {/* @anchor google-calendar-embed */}
            <div className="flex-1 min-h-[520px] rounded-lg overflow-hidden border border-white/10 bg-gray-950 shadow-2xl">
                <iframe
                    src={GOOGLE_CALENDAR_EMBED_URL}
                    title="Kalendarz urlopowy Google"
                    style={{ border: 0 }}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    scrolling="no"
                />
            </div>

            <p className="mt-2 text-[11px] text-gray-500">
                Podgląd działa tylko dla kalendarza udostępnionego publicznie — w innym wypadku skorzystaj z linku powyżej.
            </p>
        </div>
    );
}
