import '../css/system.css';
import { Badge } from '@/components/ui';
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
  const totalUsers = roles.reduce((sum, r) => sum + r.userCount, 0);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>{L('الأدوار والصلاحيات', 'Roles and permissions')}</h1>
          <p className="muted">
            {L(
              'كل تغيير في صلاحيات الدور يُسجَّل في سجل التدقيق. دور المدير لا يفقد صلاحياته.',
              'Every change to a role is written to the audit log. The MANAGER role never loses permissions.',
            )}
          </p>
        </div>
        <div className="adm-head-actions">
          <a className="btn btn-small" href="#staff-create">{L('إنشاء موظف', 'Create staff user')}</a>
        </div>
      </div>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <strong>{roles.length}</strong>
          <span>{L('الأدوار', 'Roles')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{permissions.length}</strong>
          <span>{L('الصلاحيات المتاحة', 'Available permissions')}</span>
        </div>
        <div className="adm-kpi">
          <strong>{totalUsers}</strong>
          <span>{L('الحسابات المرتبطة بالأدوار', 'Users assigned to roles')}</span>
        </div>
      </div>

      {roles.length === 0 ? (
        <p className="adm-empty">{L('لا توجد أدوار.', 'No roles.')}</p>
      ) : (
        roles.map((r) => (
          <section className="adm-section" key={r.id}>
            <header>
              <h2>{locale === 'ar' ? r.nameAr || r.name : r.name}</h2>
              <span className="row">
                <Badge>{r.name}</Badge>
                <span className="muted">{L(`المستخدمون: ${r.userCount}`, `Users: ${r.userCount}`)}</span>
              </span>
            </header>
            <RoleEditor
              roleId={r.id}
              roleName={r.name}
              roleNameAr={r.nameAr}
              isManager={r.name === 'MANAGER'}
              initial={r.permissions}
              permissions={permissions}
              locale={locale}
            />
          </section>
        ))
      )}

      <section className="adm-section" id="staff-create">
        <header>
          <h2>{L('إنشاء موظف', 'Create staff user')}</h2>
        </header>
        <p className="adm-note">
          {L(
            'يُنشأ الحساب نشطاً بدور أو أكثر. أعطِ الموظف كلمة المرور المؤقتة عبر قناة آمنة.',
            'The account is created active with one or more roles. Share the temporary password through a secure channel.',
          )}
        </p>
        <StaffForm roles={roles.map((r) => ({ name: r.name, label: locale === 'ar' ? `${r.nameAr || r.name} (${r.name})` : r.name }))} locale={locale} />
      </section>
    </>
  );
}
