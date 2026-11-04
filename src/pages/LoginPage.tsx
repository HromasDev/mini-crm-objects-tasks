import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as AntdApp, Button, Card, Form, Input, Typography } from 'antd';
import { useAuth } from '../context/AuthContext';

interface LoginFormValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const prof = await signIn(values.email.trim(), values.password);
      message.success('Вы вошли в систему');
      navigate(prof.role === 'manager' ? '/objects' : '/my-tasks', { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <Card title="CRM «Объекты и задачи»" style={{ width: 400 }}>
        <Form<LoginFormValues> layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Некорректный email' },
            ]}
          >
            <Input autoComplete="email" placeholder="user@company.ru" />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Войти
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
          Регистрация отключена. Учётные записи создаёт руководитель в панели Supabase.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
