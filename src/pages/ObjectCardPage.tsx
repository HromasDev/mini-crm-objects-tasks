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
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { StatusTag } from '../components/StatusTag';
import type { CrmObject, Profile, Task } from '../lib/types';

interface TaskFormValues {
  title: string;
  description?: string;
  assignee_id: string;
}

interface ObjectFormValues {
  name: string;
  address: string;
}

export default function ObjectCardPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();

  const [crmObject, setCrmObject] = useState<CrmObject | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [objectModalOpen, setObjectModalOpen] = useState(false);
  const [savingObject, setSavingObject] = useState(false);

  const [taskForm] = Form.useForm<TaskFormValues>();
  const [objectForm] = Form.useForm<ObjectFormValues>();

  const isManager = profile?.role === 'manager';

  const load = useCallback(async () => {
    if (!id) return;
    const [objectRes, tasksRes] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tasks')
        .select(
          '*, author:profiles!tasks_author_fk(full_name, email), assignee:profiles!tasks_assignee_fk(full_name, email)',
        )
        .eq('object_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (objectRes.error) {
      message.error('Не удалось загрузить объект: ' + objectRes.error.message);
    }
    setCrmObject((objectRes.data as CrmObject) ?? null);
    setTasks((tasksRes.data ?? []) as Task[]);
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

  const submitTask = async () => {
    let values: TaskFormValues;
    try {
      values = await taskForm.validateFields();
    } catch {
      return;
    }
    if (!id || !profile) return;
    setSavingTask(true);
    const { error } = await supabase.from('tasks').insert({
      object_id: id,
      title: values.title.trim(),
      description: values.description?.trim() || null,
      assignee_id: values.assignee_id,
      author_id: profile.id,
    });
    setSavingTask(false);
    if (error) {
      message.error('Не удалось создать задачу: ' + error.message);
      return;
    }
    message.success('Задача создана в статусе «Новая»');
    setTaskModalOpen(false);
    taskForm.resetFields();
    void load();
  };

  const submitObject = async () => {
    let values: ObjectFormValues;
    try {
      values = await objectForm.validateFields();
    } catch {
      return;
    }
    setSavingObject(true);
    const { error } = await supabase.from('objects').update(values).eq('id', id!);
    setSavingObject(false);
    if (error) {
      message.error('Не удалось сохранить объект: ' + error.message);
      return;
    }
    message.success('Объект обновлён');
    setObjectModalOpen(false);
    void load();
  };

  const deleteObject = async () => {
    const { error } = await supabase.from('objects').delete().eq('id', id!);
    if (error) {
      message.error('Не удалось удалить объект: ' + error.message);
      return;
    }
    message.success('Объект удалён вместе с задачами');
    void navigate('/objects');
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      message.error('Не удалось удалить задачу: ' + error.message);
      return;
    }
    message.success('Задача удалена');
    void load();
  };

  if (!loaded) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!crmObject) {
    return (
      <Result
        status="404"
        title="Объект не найден"
        subTitle="У вас нет доступа к этому объекту, либо он был удалён."
        extra={
          <Button type="primary" onClick={() => navigate('/objects')}>
            К списку объектов
          </Button>
        }
      />
    );
  }

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
      title: 'Статус',
      dataIndex: 'status',
      width: 150,
      render: (_, record) => <StatusTag status={record.status} />,
    },
    {
      title: 'Исполнитель',
      dataIndex: 'assignee_id',
      width: 200,
      render: (_, record) => record.assignee?.full_name ?? '—',
    },
    {
      title: 'Автор',
      dataIndex: 'author_id',
      width: 200,
      render: (_, record) => record.author?.full_name ?? '—',
    },
    {
      title: 'Создана',
      dataIndex: 'created_at',
      width: 130,
      render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
    },
  ];

  if (isManager) {
    columns.push({
      title: 'Действия',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="Удалить задачу?"
          description="История статусов будет удалена вместе с задачей."
          okText="Удалить"
          cancelText="Отмена"
          okButtonProps={{ danger: true }}
          onConfirm={() => void deleteTask(record.id)}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      ),
    });
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        style={{ paddingInline: 0 }}
        onClick={() => navigate('/objects')}
      >
        К списку объектов
      </Button>

      <Card
        title={crmObject.name}
        extra={
          isManager && (
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  taskForm.resetFields();
                  setTaskModalOpen(true);
                }}
              >
                Добавить задачу
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  objectForm.setFieldsValue({ name: crmObject.name, address: crmObject.address });
                  setObjectModalOpen(true);
                }}
              >
                Изменить
              </Button>
              <Popconfirm
                title="Удалить объект вместе с его задачами?"
                okText="Удалить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => void deleteObject()}
              >
                <Button danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )
        }
      >
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="Адрес">{crmObject.address}</Descriptions.Item>
          <Descriptions.Item label="Создан">
            {dayjs(crmObject.created_at).format('DD.MM.YYYY')}
          </Descriptions.Item>
        </Descriptions>

        <Typography.Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>
          {isManager ? `Задачи объекта (${tasks.length})` : `Мои задачи на объекте (${tasks.length})`}
        </Typography.Title>
        <Table<Task>
          rowKey="id"
          dataSource={tasks}
          columns={columns}
          pagination={false}
          onRow={(record) => ({
            onClick: () => navigate(`/tasks/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      <Modal
        title="Новая задача"
        open={taskModalOpen}
        okText="Создать"
        cancelText="Отмена"
        confirmLoading={savingTask}
        onOk={() => void submitTask()}
        onCancel={() => setTaskModalOpen(false)}
        forceRender
      >
        <Form<TaskFormValues> form={taskForm} layout="vertical">
          <Form.Item
            name="title"
            label="Название"
            rules={[{ required: true, message: 'Введите название задачи' }]}
          >
            <Input placeholder="Монтаж электрощитовой на 3 этаже" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={4} placeholder="Что нужно сделать, какие материалы и сроки" />
          </Form.Item>
          <Form.Item
            name="assignee_id"
            label="Исполнитель"
            rules={[{ required: true, message: 'Выберите исполнителя' }]}
          >
            <Select
              placeholder="Выберите исполнителя"
              options={workers.map((w) => ({ value: w.id, label: w.full_name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Изменить объект"
        open={objectModalOpen}
        okText="Сохранить"
        cancelText="Отмена"
        confirmLoading={savingObject}
        onOk={() => void submitObject()}
        onCancel={() => setObjectModalOpen(false)}
        forceRender
      >
        <Form<ObjectFormValues> form={objectForm} layout="vertical">
          <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Адрес" rules={[{ required: true, message: 'Введите адрес' }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
