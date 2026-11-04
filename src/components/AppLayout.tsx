import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { CheckSquareOutlined, LogoutOutlined, PartitionOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/types';

const { Header, Content } = Layout;

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems: NonNullable<MenuProps['items']> = [
    { key: '/objects', icon: <PartitionOutlined />, label: 'Объекты' },
  ];
  // «Мои задачи» — экран исполнителя (по ТЗ).
  if (profile?.role === 'worker') {
    menuItems.push({ key: '/my-tasks', icon: <CheckSquareOutlined />, label: 'Мои задачи' });
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          paddingInline: 24,
        }}
      >
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          CRM «Объекты и задачи»
        </Typography.Text>
        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => void navigate(key)}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none' }}
        />
        <Space style={{ whiteSpace: 'nowrap' }}>
          <Typography.Text>{profile?.full_name}</Typography.Text>
          <Tag color={profile?.role === 'manager' ? 'geekblue' : 'cyan'}>
            {profile ? ROLE_LABELS[profile.role] : ''}
          </Tag>
          <Button type="text" icon={<LogoutOutlined />} onClick={() => void signOut()}>
            Выйти
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Outlet />
        </div>
      </Content>
    </Layout>
  );
}
