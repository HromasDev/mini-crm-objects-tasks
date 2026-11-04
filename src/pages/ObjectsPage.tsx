import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import type { CrmObject } from '../lib/types';

interface ObjectRow extends CrmObject {
  tasks?: { count: number }[] | null;
  tasks_count: number;
}

interface ObjectFormValues {
  name: string;
  address: string;
}

export default function ObjectsPage() {
  const { profile } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();

  const [rows, setRows] = useState<ObjectRow[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CrmObject | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<ObjectFormValues>();

  const isManager = profile?.role === 'manager';

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('objects')
      .select('*, tasks(count)')
      .order('created_at', { ascending: false });
    if (error) {
      message.error('Не удалось загрузить объекты: ' + error.message);
      setRows([]);
      return;
    }
    const mapped = ((data ?? []) as unknown as Omit<ObjectRow, 'tasks_count'>[]).map((o) => ({
      ...o,
      tasks_count: o.tasks?.[0]?.count ?? 0,
    }));
    setRows(mapped);
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue({ name: '', address: '' });
    setEditorOpen(true);
  };

  const openEdit = (record: CrmObject) => {
    setEditing(record);
    form.setFieldsValue({ name: record.name, address: record.address });
    setEditorOpen(true);
  };

  const submitEditor = async () => {
    let values: ObjectFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    const { error } = editing
      ? await supabase.from('objects').update(values).eq('id', editing.id)
      : await supabase.from('objects').insert({ ...values, created_by: profile!.id });
    setSaving(false);
    if (error) {
      message.error('Ошибка сохранения: ' + error.message);
      return;
    }
    message.success(editing ? 'Объект обновлён' : 'Объект создан');
    setEditorOpen(false);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('objects').delete().eq('id', id);
    if (error) {
      message.error('Не удалось удалить: ' + error.message);
      return;
    }
    message.success('Объект удалён вместе с задачами');
    void load();
  };

  const columns: ColumnsType<ObjectRow> = [
    {
      title: 'Название',
      dataIndex: 'name',
      render: (_, record) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/objects/${record.id}`)}>
          {record.name}
        </Button>
      ),
    },
    { title: 'Адрес', dataIndex: 'address' },
    { title: 'Задач', dataIndex: 'tasks_count', width: 90, align: 'right' },
    {
      title: 'Создан',
      dataIndex: 'created_at',
      width: 130,
      render: (value: string) => dayjs(value).format('DD.MM.YYYY'),
    },
  ];

  if (isManager) {
    columns.push({
      title: 'Действия',
      width: 110,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            type="text"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(record);
            }}
          />
          <Popconfirm
            title="Удалить объект вместе с задачами?"
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() => void remove(record.id)}
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Popconfirm>
        </Space>
      ),
    });
  }

  return (
    <>
      <Card
        title="Объекты"
      extra={
        isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Добавить объект
          </Button>
        )
      }
    >
      {!isManager && (
        <Typography.Paragraph type="secondary">
          Показаны объекты, на которых у вас есть задачи.
        </Typography.Paragraph>
      )}
      <Table<ObjectRow>
        rowKey="id"
        loading={rows === null}
        dataSource={rows ?? []}
        columns={columns}
        pagination={{ hideOnSinglePage: true }}
        onRow={(record) => ({
          onClick: () => navigate(`/objects/${record.id}`),
          style: { cursor: 'pointer' },
        })}
      />
    </Card>

    <Modal
      title={editing ? 'Изменить объект' : 'Новый объект'}
      open={editorOpen}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={saving}
      onOk={() => void submitEditor()}
      onCancel={() => setEditorOpen(false)}
      forceRender
    >
      <Form<ObjectFormValues> form={form} layout="vertical">
        <Form.Item name="name" label="Название" rules={[{ required: true, message: 'Введите название' }]}>
          <Input placeholder="ЖК «Северный», корпус 2" />
        </Form.Item>
        <Form.Item name="address" label="Адрес" rules={[{ required: true, message: 'Введите адрес' }]}>
          <Input placeholder="г. Москва, ул. Полярная, 12" />
        </Form.Item>
      </Form>
    </Modal>
    </>
  );
}
