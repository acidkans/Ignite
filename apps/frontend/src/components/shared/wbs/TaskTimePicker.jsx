// @anchor default-task-time — godzina, z którą startuje każde nowe zadanie (i zadanie bez godziny przy edycji)
export const DEFAULT_TASK_TIME = '08:00';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '30'];

// @anchor snap-task-time — 'GG:MM' zaokrąglone do pełnej godziny albo pół godziny (14:15 → 14:30, 23:50 → 23:30)
export const snapTaskTime = (hhmm) => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const total = Math.min(Math.round((h * 60 + m) / 30) * 30, 23 * 60 + 30);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// @anchor task-time-picker
// Godzina zadania jako dwie listy: godzina 00–23 + minuty 00/30. Zastępuje <input type="time">,
// który w Chrome nie ogranicza minut. Pusta godzina („—”) = zadanie bez godziny, bez wydarzenia w Outlooku.
export default function TaskTimePicker({ value, onChange, disabled, className = '', optionStyle, title }) {
    const [h = '', m = '00'] = (value || '').split(':');
    return (
        <span className="flex gap-1" title={title}>
            <select
                value={h}
                onChange={e => onChange(e.target.value ? `${e.target.value}:${m}` : '')}
                disabled={disabled}
                className={className}
                aria-label="Godzina"
            >
                <option value="" style={optionStyle}>—</option>
                {HOURS.map(x => <option key={x} value={x} style={optionStyle}>{x}</option>)}
            </select>
            <select
                value={m}
                onChange={e => onChange(`${h}:${e.target.value}`)}
                disabled={disabled || !h}
                className={className}
                aria-label="Minuty"
            >
                {MINUTES.map(x => <option key={x} value={x} style={optionStyle}>{x}</option>)}
            </select>
        </span>
    );
}
