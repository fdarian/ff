import type { Cron } from 'effect';
import { Option } from 'effect';

function fieldToString(field: ReadonlySet<number>, max: number) {
	if (field.size === 0 || field.size === max) return '*';
	return Array.from(field).sort((a, b) => a - b).join(',');
}

export function cronToString(cron: Cron.Cron) {
	const minutes = fieldToString(cron.minutes, 60);
	const hours = fieldToString(cron.hours, 24);
	const days = fieldToString(cron.days, 31);
	const months = fieldToString(cron.months, 12);
	const weekdays = fieldToString(cron.weekdays, 7);

	const expr = `${minutes} ${hours} ${days} ${months} ${weekdays}`;
	if (Option.isSome(cron.tz)) return `TZ=${cron.tz.value} ${expr}`;
	return expr;
}
