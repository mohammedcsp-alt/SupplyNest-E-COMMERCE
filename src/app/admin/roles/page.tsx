import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, type PermissionCode } from '@/lib/rbac';
import { gatePage } from '../_lib/gate';
import { listRoles } from '@/modules/admin/roles';
import { RoleEditor } from '../_components/RoleEditor';
import { StaffForm } from '../_components/StaffForm';

export const dynamic = 'force-dynamic';

export default async function AdminRoles() {
  const g = await gatePage(PERMISSIONS.ROLE_MANAGE, '/admin/roles');
  if (!g.ok) return g.node;
  const { L, locale } = g;
  const roles = await listRoles();
  const permissions = (Object.keys(PERMISSION_DESCRIPTIONS) as PermissionCode[]).sort().map((code) => ({ code, description: PERMISSION_DESCRIPTIONS[code] }));

  return (
    <>
      <PageHeader
        title={L('الأدوار والصلاحيات', 'Roles and permissions')}
        subtitle={L('كل تغيير في صلاحيات الدور يُسجَّل في سجل التدقيق. دور المدير لا يفقد صلاحياته.', 'Every change to a role is written to the audit log. The MANAGER role never loses permissions.')}
      />
      {roles.length === 0 ? (
        <EmptyState>{L('لا توجد أدوار.', 'No roles.')}</EmptyState>
      ) : (
        roles.map((r) => (
          <Card
            key={r.id}
            title={locale === 'ar' ? r.nameAr || r.name : r.name}
            actions={
              <span className="row">
                <Badge>{r.name}</Badge>
                <span className="muted">{L(`المستخدمون: ${r.userCount}`, `Users: ${r.userCount}`)}</span>
              </span>
            }
          >
            <RoleEditor
              roleId={r.id}
              roleName={r.name}
              roleNameAr={r.nameAr}
              isManager={r.name === 'MANAGER'}
              initial={r.permissions}
              permissions={permissions}
              locale={locale}
            />
          </Card>
        ))
      )}

      <Card title={L('إنشاء موظف', 'Create staff user')}>
        <p className="muted">{L('يُنشأ الحساب نشطاً بدور أو أكثر. أعطِ الموظف كلمة المرور المؤقتة عبر قناة آمنة.', 'The account is created active with one or more roles. Share the temporary password through a secure channel.')}</p>
        <StaffForm roles={roles.map((r) => ({ name: r.name, label: locale === 'ar' ? `${r.nameAr || r.name} (${r.name})` : r.name }))} locale={locale} />
      </Card>
    </>
  );
}
