import type { AppRole, Task, TaskStatus } from './types';

export interface TaskAction {
  key: string;
  label: string;
  to: TaskStatus;
  /** Для «Вернуть на доработку»: требуется комментарий. */
  needsComment?: boolean;
  danger?: boolean;
}

/**
 * Какие действия над задачей доступны пользователю при её текущем статусе.
 * Это «зеркало» матрицы переходов из ТЗ для отображения кнопок; источник
 * истины — триггер в базе (enforce_task_rules), который проверяет каждый
 * переход, даже если запрос отправлен в обход интерфейса.
 */
export function availableActions(task: Task, role: AppRole | undefined, userId: string): TaskAction[] {
  const isAssignee = task.assignee_id === userId;
  const isManager = role === 'manager';

  switch (task.status) {
    case 'Новая':
      return isAssignee ? [{ key: 'start', label: 'Взять в работу', to: 'В работе' }] : [];
    case 'В работе':
      return isAssignee
        ? [{ key: 'submit', label: 'Отправить на проверку', to: 'На проверке' }]
        : [];
    case 'На проверке':
      return isManager
        ? [
            { key: 'accept', label: 'Принять', to: 'Принята' },
            { key: 'rework', label: 'Вернуть на доработку', to: 'На доработке', needsComment: true, danger: true },
          ]
        : [];
    case 'На доработке':
      return isAssignee ? [{ key: 'resume', label: 'Возобновить работу', to: 'В работе' }] : [];
    case 'Принята':
      return [];
    default:
      return [];
  }
}
