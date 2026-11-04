import dayjs from 'dayjs';

export function fmtDateTime(iso: string): string {
  return dayjs(iso).format('DD.MM.YYYY HH:mm');
}
