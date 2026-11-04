export type AppRole = 'manager' | 'worker';

export type TaskStatus = 'Новая' | 'В работе' | 'На проверке' | 'Принята' | 'На доработке';

export const ALL_STATUSES: TaskStatus[] = [
  'Новая',
  'В работе',
  'На проверке',
  'Принята',
  'На доработке',
];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  created_at: string;
}

export interface CrmObject {
  id: string;
  name: string;
  address: string;
  created_by: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  object_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: TaskStatus;
  author_id: string;
  created_at: string;
  updated_at: string;
  // Встроенные связанные записи (join из Supabase по внешним ключам).
  author?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  assignee?: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
  object?: Pick<CrmObject, 'id' | 'name' | 'address'> | null;
}

export interface StatusHistory {
  id: number;
  task_id: string;
  changed_by: string | null;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  comment: string | null;
  changed_at: string;
  changed_by_profile?: Pick<Profile, 'id' | 'full_name'> | null;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  manager: 'Постановщик',
  worker: 'Исполнитель',
};
