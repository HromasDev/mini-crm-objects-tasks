import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Timeline,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { StatusTag } from '../components/StatusTag';
import { availableActions } from '../lib/actions';
import { fmtDateTime } from '../lib/format';
import type { Profile, StatusHistory, Task, TaskStatus } from '../lib/types';

interface TaskEditValues {
  title: string;
  description?: string;
  assignee_id?: string;
}

export default function TaskCardPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [acting, setActing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reworkOpen, setReworkOpen] = useState(false);
  const [reworkComment, setReworkComment] = useState('');
  const [editForm] = Form.useForm<TaskEditValues>();

  const isManager = profile?.role === 'manager';

  const load = useCallback(async () => {
    if (!id) return;
    const [taskRes, historyRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(
          `*,
          object:objects!tasks_object_fk(id, name, address),
          author:profiles!tasks_author_fk(id, full_name, email),
          assignee:profiles!tasks_assignee_fk(id, full_name, email)`,
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('task_status_history')
        .select('*, changed_by_profile:profiles!task_status_history_changed_by_fk(id, full_name)')
        .eq('task_id', id)
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true }),
    ]);
    if (taskRes.error) {
      message.error('Не удалось загрузить задачу: ' + taskRes.error.message);
    }
    setTask((taskRes.data as Task) ?? null);
    setHistory((historyRes.data ?? []) as StatusHistory[]);
    setLoaded(true);
  }, [id, message]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isManager) return;
    void supabase
      .from('profiles')
      .select('*')
      .eq('role', 'worker')
      .order('full_name')
      .then(({ data }) => setWorkers((data ?? []) as Profile[]));
  }, [isManager]);

  // Смена статуса — только через RPC transition_task: правила проверяет база.
  const runTransition = async (to: TaskStatus, comment?: string): Promise<boolean> => {
    if (!task) return false;
    setActing(true);
    const { error } = await supabase.rpc('transition_task', {
      p_task_id: task.id,
      p_to_status: to,
      p_comment: comment ?? null,
    });
    setActing(false);
    if (error) {
      message.error(error.message);
      return false;
    }
    message.success('Статус обновлён: ' + to);
    await load();
    return true;
  };

  const submitRework = async () => {
    if (!reworkComment.trim()) {
      message.warning('Комментарий обязателен при возврате на доработку');
      return;
    }
    const ok = await runTransition('На доработке', reworkComment.trim());
    if (ok) {
      setReworkOpen(false);
      setReworkComment('');
    }
  };

  const submitEdit = async () => {
    let values: TaskEditValues;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    if (!task) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from('tasks')
      .update({
        title: values.title.trim(),
        description: values.description?.trim() || null,
        assignee_id: values.assignee_id ?? null,
      })
      .eq('id', task.id);
    setSavingEdit(false);
    if (error) {
      message.error('Не удалось сохранить задачу: ' + error.message);
      return;
    }
    message.success('Задача обновлена');
    setEditOpen(false);
    void load();
  };

  const deleteTask = async () => {
    if (!task) return;
    const objectTarget = `/objects/${task.object_id}`;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      message.error('Не удалось удалить задачу: ' + error.message);
      return;
    }
    message.success('Задача удалена');
    void navigate(objectTarget);
  };

  if (!loaded) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <Result
        status="404"
        title="Задача не найдена"
        subTitle="У вас нет доступа к этой задаче, либо она была удалена."
        extra={<Button type="primary" onClick={() => navigate(-1)}>Назад</Button>}
      />
    );
  }

  // Кнопки показываем только те, что доступны текущей роли в текущем статусе.
  const actions = availableActions(task, profile?.role, profile!.id);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingInline: 0 }}
        onClick={() => navigate(`/objects/${task.object_id}`)}
      >
        К объекту «{task.object?.name ?? ''}»
      </Button>

      <Card
        title={
          <Space>
            {task.title}
            <StatusTag status={task.status} />
          </Space>
        }
        extra={
          isManager && (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  editForm.setFieldsValue({
                    title: task.title,
                    description: task.description ?? '',
                    assignee_id: task.assignee_id ?? undefined,
                  });
                  setEditOpen(true);
                }}
              >
                Изменить
              </Button>
              <Popconfirm
                title="Удалить задачу?"
                okText="Удалить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => void deleteTask()}
              >
                <Button danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )
        }
      >
        {actions.length > 0 ? (
          <Space wrap style={{ marginBottom: 20 }}>
            {actions.map((a) =>
              a.needsComment ? (
                <Button key={a.key} danger onClick={() => setReworkOpen(true)}>
                  {a.label}
                </Button>
              ) : (
                <Button
                  key={a.key}
                  type="primary"
                  loading={acting}
                  onClick={() => void runTransition(a.to)}
                >
                  {a.label}
                </Button>
              ),
            )}
          </Space>
        ) : (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            В текущем статусе для вашей роли доступных действий нет.
          </Typography.Paragraph>
        )}

        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="Объект">
            <Button
              type="link"
              style={{ paddingInline: 0 }}
              onClick={() => navigate(`/objects/${task.object_id}`)}
            >
              {task.object?.name ?? '—'}
            </Button>
          </Descriptions.Item>
          <Descriptions.Item label="Статус">
            <StatusTag status={task.status} />
          </Descriptions.Item>
          <Descriptions.Item label="Исполнитель">
            {task.assignee?.full_name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Автор">{task.author?.full_name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Создана">{fmtDateTime(task.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Обновлена">{fmtDateTime(task.updated_at)}</Descriptions.Item>
          <Descriptions.Item label="Описание" span={2}>
            {task.description ?? '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="История статусов">
        {history.length === 0 ? (
          <Typography.Text type="secondary">История пуста</Typography.Text>
        ) : (
          <Timeline
            items={history.map((h) => ({
              color:
                h.from_status === null
                  ? 'gray'
                  : h.to_status === 'Принята'
                    ? 'green'
                    : h.to_status === 'На доработке'
                      ? 'red'
                      : 'blue',
              children: (
                <div>
                  <Typography.Text strong>
                    {h.from_status === null
                      ? 'Задача создана'
                      : `${h.from_status} → ${h.to_status}`}
                  </Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 2, fontSize: 12 }}>
                    {h.changed_by_profile?.full_name ?? '—'} · {fmtDateTime(h.changed_at)}
                  </Typography.Paragraph>
                  {h.comment && (
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      Комментарий: «{h.comment}»
                    </Typography.Paragraph>
                  )}
                </div>
              ),
            }))}
          />
        )}
      </Card>

      <Modal
        title="Вернуть на доработку"
        open={reworkOpen}
        okText="Вернуть на доработку"
        cancelText="Отмена"
        onOk={() => void submitRework()}
        onCancel={() => {
          setReworkOpen(false);
          setReworkComment('');
        }}
      >
        <Typography.Paragraph type="secondary">
          Задача вернётся исполнителю в статус «В работе». Комментарий обязателен.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={reworkComment}
          onChange={(e) => setReworkComment(e.target.value)}
          placeholder="Что именно нужно доработать?"
        />
      </Modal>

      <Modal
        title="Изменить задачу"
        open={editOpen}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={savingEdit}
        onOk={() => void submitEdit()}
        onCancel={() => setEditOpen(false)}
        forceRender
      >
        <Form<TaskEditValues> form={editForm} layout="vertical">
          <Form.Item name="title" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="assignee_id" label="Исполнитель">
            <Select
              allowClear
              placeholder="Выберите исполнителя"
              options={workers.map((w) => ({ value: w.id, label: w.full_name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
