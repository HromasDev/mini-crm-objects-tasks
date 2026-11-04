import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Button, Card, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { StatusTag } from '../components/StatusTag';
import { availableActions } from '../lib/actions';
import { ALL_STATUSES } from '../lib/types';
import type { Task, TaskStatus } from '../lib/types';

export default function MyTasksPage() {
  const { profile } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*, object:objects!tasks_object_fk(id, name)')
      .eq('assignee_id', profile.id)
      .order('updated_at', { ascending: false });
    if (error) {
      message.error('Не удалось загрузить задачи: ' + error.message);
    }
    setTasks((data ?? []) as Task[]);
  }, [profile, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const runTransition = async (task: Task, to: TaskStatus) => {
    setActingId(task.id);
    const { error } = await supabase.rpc('transition_task', {
      p_task_id: task.id,
      p_to_status: to,
      p_comment: null,
    });
    setActingId(null);
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('Статус обновлён: ' + to);
    void load();
  };

  const filtered = (tasks ?? []).filter((t) => filter === 'all' || t.status === filter);

  const columns: ColumnsType<Task> = [
    {
      title: 'Задача',
      dataIndex: 'title',
      render: (_, record) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/tasks/${record.id}`)}>
          {record.title}
        </Button>
      ),
    },
    {
      title: 'Объект',
      dataIndex: 'object_id',
      render: (_, record) => record.object?.name ?? '—',
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      width: 150,
      render: (_, record) => <StatusTag status={record.status} />,
    },
    {
      title: 'Обновлена',
      dataIndex: 'updated_at',
      width: 160,
      render: (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: 'Действия',
      width: 260,
      render: (_, record) => {
        const actions = availableActions(record, profile?.role, profile!.id);
        if (actions.length === 0) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return (
          <Space wrap>
            {actions.map((a) =>
              a.needsComment ? (
                <Button key={a.key} size="small" onClick={() => navigate(`/tasks/${record.id}`)}>
                  Открыть карточку
                </Button>
              ) : (
                <Button
                  key={a.key}
                  size="small"
                  type="primary"
                  loading={actingId === record.id}
                  onClick={() => void runTransition(record, a.to)}
                >
                  {a.label}
                </Button>
              ),
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title="Мои задачи"
      extra={
        <Select<TaskStatus | 'all'>
          value={filter}
          onChange={setFilter}
          style={{ minWidth: 180 }}
          options={[
            { value: 'all', label: 'Все статусы' },
            ...ALL_STATUSES.map((s) => ({ value: s, label: s })),
          ]}
        />
      }
    >
      <Typography.Paragraph type="secondary">
        Здесь собраны задачи, назначенные вам. Обновляется время от времени — откройте карточку
        задачи, чтобы посмотреть детали и историю.
      </Typography.Paragraph>
      <Table<Task>
        rowKey="id"
        loading={tasks === null}
        dataSource={filtered}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
      />
    </Card>
  );
}
