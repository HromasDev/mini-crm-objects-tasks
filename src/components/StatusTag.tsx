import { Tag } from 'antd';
import type { TaskStatus } from '../lib/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  'Новая': 'blue',
  'В работе': 'orange',
  'На проверке': 'purple',
  'Принята': 'green',
  'На доработке': 'red',
};

export function StatusTag({ status }: { status: TaskStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{status}</Tag>;
}
