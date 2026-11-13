/**
 * Idempotent development seed. Creates roles, permissions, price levels, locations, synthetic catalog,
 * synthetic stock, development accounts and CMS placeholders.
 *
 * Every value here is SYNTHETIC (fictional brands, DEV- SKUs, placeholder shipping rates, test phone numbers).
 * Refuses to run when NODE_ENV=production. Safe to re-run.
 */
import { PrismaClient, AttributeType, SettlementMode } from '@prisma/client';
import { hashPassword } from '../../src/lib/passwords';
import { PERMISSION_DESCRIPTIONS, SYSTEM_ROLES, PERMISSIONS, type PermissionCode } from '../../src/lib/rbac';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed refused: NODE_ENV=production');
}

const db = new PrismaClient();

import { devPassword, DEV_SECRET_FILE } from './dev-secret';

/** Read from storage/dev-seed-secret.txt (gitignored). Never a literal in source. */
export const DEV_PASSWORD = devPassword();
export const SYNTHETIC_NOTICE =
  'SYNTHETIC development data. Brands, SKUs, prices, shipping rates and couriers are placeholders, not business values.';

type Acc = { phone: string; name: string; type: 'STAFF' | 'CUSTOMER'; role?: string; status?: string; level?: string };

const STAFF: Acc[] = [
  { phone: '+9647700000001', name: 'Dev Manager', type: 'STAFF', role: 'MANAGER' },
  { phone: '+9647700000002', name: 'Dev Customer Approver', type: 'STAFF', role: 'CUSTOMER_APPROVER' },
  { phone: '+9647700000003', name: 'Dev Catalog Operator', type: 'STAFF', role: 'CATALOG_OPERATOR' },
  { phone: '+9647700000004', name: 'Dev Inventory Operator', type: 'STAFF', role: 'INVENTORY_OPERATOR' },
  { phone: '+9647700000005', name: 'Dev Order Operator', type: 'STAFF', role: 'ORDER_OPERATOR' },
  { phone: '+9647700000006', name: 'Dev Picker One', type: 'STAFF', role: 'PICKER' },
  { phone: '+9647700000007', name: 'Dev Picker Two', type: 'STAFF', role: 'PICKER' },
  { phone: '+9647700000008', name: 'Dev Checker', type: 'STAFF', role: 'CHECKER' },
  { phone: '+9647700000009', name: 'Dev Packer', type: 'STAFF', role: 'PACKER' },
  { phone: '+9647700000010', name: 'Dev Accountant', type: 'STAFF', role: 'ACCOUNTANT' },
  { phone: '+9647700000011', name: 'Dev Content Editor', type: 'STAFF', role: 'CONTENT_EDITOR' },
  { phone: '+9647700000012', name: 'Dev Report Viewer', type: 'STAFF', role: 'REPORT_VIEWER' },
];

const CUSTOMERS: Acc[] = [
  { phone: '+9647700001001', name: 'Dev Customer Level A', type: 'CUSTOMER', status: 'ACTIVE', level: 'LEVEL_A' },
  { phone: '+9647700001002', name: 'Dev Customer Level B', type: 'CUSTOMER', status: 'ACTIVE', level: 'LEVEL_B' },
  { phone: '+9647700001003', name: 'Dev Registered (unverified)', type: 'CUSTOMER', status: 'REGISTERED' },
  { phone: '+9647700001004', name: 'Dev Approval Pending', type: 'CUSTOMER', status: 'APPROVAL_PENDING' },
  { phone: '+9647700001005', name: 'Dev Suspended', type: 'CUSTOMER', status: 'SUSPENDED', level: 'LEVEL_A' },
  { phone: '+9647700001006', name: 'Dev Rejected', type: 'CUSTOMER', status: 'REJECTED' },
];

const GOVERNORATES: [string, string, string][] = [
  ['BAGHDAD', 'بغداد', 'Baghdad'], ['BASRA', 'البصرة', 'Basra'], ['NINEVEH', 'نينوى', 'Nineveh'],
  ['ERBIL', 'أربيل', 'Erbil'], ['SULAYMANIYAH', 'السليمانية', 'Sulaymaniyah'], ['DUHOK', 'دهوك', 'Duhok'],
  ['KIRKUK', 'كركوك', 'Kirkuk'], ['DIYALA', 'ديالى', 'Diyala'], ['ANBAR', 'الأنبار', 'Anbar'],
  ['BABIL', 'بابل', 'Babil'], ['KARBALA', 'كربلاء', 'Karbala'], ['NAJAF', 'النجف', 'Najaf'],
  ['WASIT', 'واسط', 'Wasit'], ['SALAH_AL_DIN', 'صلاح الدين', 'Salah al-Din'], ['DHI_QAR', 'ذي قار', 'Dhi Qar'],
  ['MAYSAN', 'ميسان', 'Maysan'], ['MUTHANNA', 'المثنى', 'Muthanna'], ['QADISIYYAH', 'القادسية', 'Al-Qadisiyyah'],
];

// Synthetic shipping placeholders (NOT approved business values). Missing governorates stay blocked (OPEN-10).
const SYNTHETIC_RATES: Record<string, number> = { BAGHDAD: 5000, BASRA: 7000, ERBIL: 9000 };

async function main() {
  console.log('[seed] permissions & roles');
  const permRows = new Map<string, string>();
  for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    const p = await db.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
    permRows.set(code, p.id);
  }
  const allCodes = [...permRows.keys()] as PermissionCode[];
  for (const [name, def] of Object.entries(SYSTEM_ROLES)) {
    const role = await db.role.upsert({
      where: { name },
      update: { nameAr: def.nameAr, isSystem: true },
      create: { name, nameAr: def.nameAr, isSystem: true },
    });
    const codes = def.permissions === 'ALL' ? allCodes : def.permissions;
    for (const code of codes) {
      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permRows.get(code)! } },
        update: {},
        create: { roleId: role.id, permissionId: permRows.get(code)! },
      });
    }
  }

  console.log('[seed] price levels');
  const levels: Record<string, string> = {};
  const levelDefs = [
    ['LEVEL_A', 'Synthetic Level A', 10],
    ['LEVEL_B', 'Synthetic Level B', 20],
    ['LEVEL_C', 'Synthetic Level C (inactive example)', 30],
  ] as const;
  for (const [code, name, sortOrder] of levelDefs) {
    const lvl = await db.priceLevel.upsert({
      where: { code },
      update: { name, sortOrder, active: code !== 'LEVEL_C' },
      create: { code, name, sortOrder, active: code !== 'LEVEL_C' },
    });
    levels[code] = lvl.id;
  }

  console.log('[seed] governorates & shipping placeholders');
  const govId: Record<string, string> = {};
  let order = 0;
  for (const [code, nameAr, nameEn] of GOVERNORATES) {
    const g = await db.governorate.upsert({
      where: { code },
      update: { nameAr, nameEn, sortOrder: order },
      create: { code, nameAr, nameEn, sortOrder: order },
    });
    govId[code] = g.id;
    order += 1;
  }
  const baghdadMansour = await db.deliveryArea.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: { id: '00000000-0000-4000-8000-000000000001', governorateId: govId.BAGHDAD, nameAr: 'المنصور', nameEn: 'Mansour (synthetic)' },
  });
  const effectiveFrom = new Date('2026-01-01T00:00:00Z');
  for (const [code, amount] of Object.entries(SYNTHETIC_RATES)) {
    const existing = await db.shippingRateRule.findFirst({ where: { governorateId: govId[code], areaId: null, effectiveFrom } });
    if (!existing) {
      await db.shippingRateRule.create({ data: { governorateId: govId[code], amount, effectiveFrom, currency: 'IQD' } });
    }
  }
  if (!(await db.shippingRateRule.findFirst({ where: { areaId: baghdadMansour.id, effectiveFrom } }))) {
    await db.shippingRateRule.create({
      data: { governorateId: govId.BAGHDAD, areaId: baghdadMansour.id, amount: 4000, effectiveFrom, currency: 'IQD' },
    });
  }

  console.log('[seed] development accounts');
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const userIds: Record<string, string> = {};
  for (const acc of [...STAFF, ...CUSTOMERS]) {
    const status = (acc.status ?? 'ACTIVE') as 'ACTIVE';
    const user = await db.user.upsert({
      where: { phone: acc.phone },
      update: { fullNameEn: acc.name, userType: acc.type, status, passwordHash },
      create: {
        phone: acc.phone,
        passwordHash,
        userType: acc.type,
        status,
        fullNameEn: acc.name,
        phoneVerifiedAt: new Date(),
      },
    });
    userIds[acc.phone] = user.id;
    if (acc.role) {
      const role = await db.role.findUniqueOrThrow({ where: { name: acc.role } });
      await db.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
    if (acc.type === 'CUSTOMER') {
      const lvlId = acc.level ? levels[acc.level] : null;
      const profile = await db.customerProfile.upsert({
        where: { userId: user.id },
        update: { displayName: acc.name, currentPriceLevelId: lvlId },
        create: {
          userId: user.id,
          displayName: acc.name,
          legalName: `${acc.name} (synthetic business)`,
          businessIdentityLocked: status === 'ACTIVE',
          currentPriceLevelId: lvlId,
        },
      });
      if (lvlId && !(await db.customerPriceAssignment.findFirst({ where: { customerId: user.id } }))) {
        await db.customerPriceAssignment.create({ data: { customerId: user.id, priceLevelId: lvlId, reason: 'seed' } });
      }
      if (status === 'ACTIVE' && !(await db.address.findFirst({ where: { customerId: user.id } }))) {
        await db.address.create({
          data: {
            customerId: user.id,
            governorateId: govId.BAGHDAD,
            areaId: baghdadMansour.id,
            details: 'Synthetic street 1, building 2',
            recipientName: acc.name,
            recipientPhone: acc.phone,
            isDefault: true,
            label: 'Default',
          },
        });
      }
      void profile;
    }
  }

  console.log('[seed] categories & attributes');
  const cat = async (slug: string, nameAr: string, nameEn: string, parentId: string | null, sortOrder: number) =>
    db.category.upsert({
      where: { slug },
      update: { nameAr, nameEn, parentId, sortOrder },
      create: { slug, nameAr, nameEn, parentId, sortOrder },
    });
  const spare = await cat('dev-mobile-spare-parts', 'قطع غيار الهواتف (اختياري)', 'Mobile spare parts (optional)', null, 1);
  const screens = await cat('dev-screens', 'شاشات', 'Screens', spare.id, 1);
  const batteries = await cat('dev-batteries', 'بطاريات', 'Batteries', spare.id, 2);
  const hardware = await cat('dev-hardware', 'أدوات وعدد', 'Hardware & tools', null, 2);
  const handTools = await cat('dev-hand-tools', 'أدوات يدوية', 'Hand tools', hardware.id, 1);
  const apparel = await cat('dev-apparel', 'ملابس', 'Apparel', null, 3);
  const tshirts = await cat('dev-tshirts', 'تيشيرتات', 'T-shirts', apparel.id, 1);
  const office = await cat('dev-office', 'مستلزمات مكتبية', 'Office supplies', null, 4);

  const attr = (categoryId: string, key: string, labelAr: string, labelEn: string, dataType: AttributeType, extra: Partial<{ unit: string; options: string[]; filterable: boolean }> = {}) =>
    db.attributeDefinition.upsert({
      where: { categoryId_key: { categoryId, key } },
      update: { labelAr, labelEn, dataType, unit: extra.unit ?? null, options: extra.options ?? undefined, filterable: extra.filterable ?? false },
      create: { categoryId, key, labelAr, labelEn, dataType, unit: extra.unit ?? null, options: extra.options ?? undefined, filterable: extra.filterable ?? false },
    });
  await attr(screens.id, 'size', 'القياس', 'Size', AttributeType.NUMBER, { unit: 'inch', filterable: true });
  await attr(screens.id, 'compatibility', 'التوافق', 'Compatibility', AttributeType.TEXT);
  await attr(batteries.id, 'capacity', 'السعة', 'Capacity', AttributeType.NUMBER, { unit: 'mAh', filterable: true });
  await attr(handTools.id, 'material', 'المادة', 'Material', AttributeType.ENUM, { options: ['Steel', 'Aluminium', 'Plastic'], filterable: true });
  await attr(tshirts.id, 'size', 'المقاس', 'Size', AttributeType.ENUM, { options: ['S', 'M', 'L', 'XL'], filterable: true });
  await attr(tshirts.id, 'color', 'اللون', 'Color', AttributeType.ENUM, { options: ['Black', 'White', 'Navy'], filterable: true });
  await attr(office.id, 'weight', 'الوزن', 'Weight', AttributeType.NUMBER, { unit: 'gsm', filterable: true });

  console.log('[seed] qualities, brands, models');
  const qualities: Record<string, string> = {};
  for (const [i, [code, nameAr, nameEn]] of [
    ['ORIGINAL', 'أصلي', 'Original'], ['OEM', 'OEM', 'OEM'], ['HIGH_COPY', 'نسخة عالية', 'High copy'], ['COPY', 'نسخة', 'Copy'],
  ].entries()) {
    const q = await db.quality.upsert({ where: { code }, update: { nameAr, nameEn, sortOrder: i }, create: { code, nameAr, nameEn, sortOrder: i } });
    qualities[code] = q.id;
  }
  const brandNames = ['Synthetic Acme', 'Synthetic Northwind', 'Synthetic Contoso'];
  const brands: Record<string, string> = {};
  for (const name of brandNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const b = await db.brand.upsert({ where: { slug }, update: {}, create: { name, slug } });
    brands[name] = b.id;
  }
  const modelIds: Record<string, string> = {};
  for (const [brand, model] of [
    ['Synthetic Acme', 'Model X1'], ['Synthetic Acme', 'Model X2'], ['Synthetic Northwind', 'Pro 9'], ['Synthetic Contoso', 'Classic'],
  ] as const) {
    const normalizedName = model.toLowerCase();
    const m = await db.productModel.upsert({
      where: { brandId_normalizedName: { brandId: brands[brand], normalizedName } },
      update: {},
      create: { brandId: brands[brand], name: model, normalizedName },
    });
    modelIds[`${brand}|${model}`] = m.id;
  }

  console.log('[seed] synthetic SKUs, prices, stock');
  type SeedSku = { sku: string; cat: string; brand?: string; model?: string; quality?: string; nameEn: string; nameAr: string; stock: number };
  const seedSkus: SeedSku[] = [];
  const screenNames = ['Screen panel 6.1', 'Screen panel 6.5', 'Screen panel 5.8'];
  screenNames.forEach((n, i) =>
    (['ORIGINAL', 'OEM', 'HIGH_COPY'] as const).forEach((q, j) =>
      seedSkus.push({
        sku: `DEV-SCR-${i + 1}${j + 1}`, cat: screens.id, brand: 'Synthetic Acme', model: 'Model X1', quality: q,
        nameEn: `${n} (${q.toLowerCase()})`, nameAr: `شاشة ${n}`, stock: (i * 7 + j * 3) % 12,
      }),
    ),
  );
  for (let i = 0; i < 6; i++) {
    seedSkus.push({
      sku: `DEV-BAT-${i + 1}`, cat: batteries.id, brand: 'Synthetic Northwind', model: 'Pro 9', quality: i % 2 ? 'OEM' : 'COPY',
      nameEn: `Battery pack ${i + 1}`, nameAr: `بطارية ${i + 1}`, stock: i === 5 ? 0 : 3 + i * 4,
    });
  }
  for (let i = 0; i < 6; i++) {
    seedSkus.push({ sku: `DEV-HT-${i + 1}`, cat: handTools.id, brand: 'Synthetic Contoso', nameEn: `Hand tool set ${i + 1}`, nameAr: `طقم أدوات ${i + 1}`, stock: 10 + i });
  }
  for (const size of ['S', 'M', 'L', 'XL']) {
    for (const color of ['Black', 'White']) {
      seedSkus.push({ sku: `DEV-TS-${size}-${color.slice(0, 2).toUpperCase()}`, cat: tshirts.id, brand: 'Synthetic Contoso', nameEn: `Cotton T-shirt ${size} ${color}`, nameAr: `تيشيرت قطن ${size} ${color}`, stock: size === 'XL' ? 0 : 40 });
    }
  }
  for (let i = 0; i < 4; i++) {
    seedSkus.push({ sku: `DEV-OF-${i + 1}`, cat: office.id, brand: 'Synthetic Acme', nameEn: `A4 paper ream ${i + 1}`, nameAr: `رزمة ورق A4 ${i + 1}`, stock: 25 + i * 5 });
  }

  const levelCodes = ['LEVEL_A', 'LEVEL_B'] as const;
  for (const [idx, s] of seedSkus.entries()) {
    const sku = await db.sku.upsert({
      where: { sku: s.sku },
      update: { nameEn: s.nameEn, nameAr: s.nameAr, categoryId: s.cat, published: true, active: true },
      create: {
        sku: s.sku,
        categoryId: s.cat,
        brandId: s.brand ? brands[s.brand] : null,
        modelId: s.model && s.brand ? modelIds[`${s.brand}|${s.model}`] : null,
        qualityId: s.quality ? qualities[s.quality] : null,
        nameEn: s.nameEn,
        nameAr: s.nameAr,
        descriptionEn: 'Synthetic development item.',
        descriptionAr: 'صنف تجريبي للتطوير.',
        published: true,
        active: true,
      },
    });
    await db.inventoryBalance.upsert({
      where: { skuId: sku.id },
      update: {},
      create: { skuId: sku.id, physicalOnHand: s.stock, sourceTimestamp: new Date() },
    });
    for (const [li, lc] of levelCodes.entries()) {
      const amount = (idx % 9 + 1) * 15000 + li * 5000 + (idx % 3) * 2500;
      await db.tierPrice.upsert({
        where: { skuId_priceLevelId: { skuId: sku.id, priceLevelId: levels[lc] } },
        update: {},
        create: { skuId: sku.id, priceLevelId: levels[lc], amount, currency: 'IQD' },
      });
    }
  }

  console.log('[seed] couriers (synthetic) & agreements');
  const courierA = await db.courier.upsert({ where: { name: 'Synthetic Courier One' }, update: {}, create: { name: 'Synthetic Courier One', contact: 'synthetic' } });
  const courierB = await db.courier.upsert({ where: { name: 'Synthetic Courier Two' }, update: {}, create: { name: 'Synthetic Courier Two', contact: 'synthetic' } });
  const existingAgreements = await db.courierAgreement.count();
  if (existingAgreements === 0) {
    await db.courierAgreement.create({ data: { courierId: courierA.id, settlementMode: SettlementMode.NET_DEDUCTION, effectiveFrom, serviceFee: 3000, returnFee: 1000, governorateId: null } });
    await db.courierAgreement.create({ data: { courierId: courierB.id, settlementMode: SettlementMode.GROSS_REMITTANCE, effectiveFrom, serviceFee: 2500, returnFee: 0, governorateId: null } });
  }

  console.log('[seed] CMS placeholders');
  for (const [slug, titleAr, titleEn] of [['about', 'من نحن', 'About us'], ['privacy', 'سياسة الخصوصية', 'Privacy policy'], ['terms', 'الشروط والأحكام', 'Terms']] as const) {
    await db.cmsPage.upsert({
      where: { slug },
      update: {},
      create: { slug, titleAr, titleEn, bodyAr: `${titleAr} — مسودة تجريبية.`, bodyEn: `${titleEn} — synthetic draft.`, publishedAt: new Date() },
    });
  }

  // Rotation: sessions created with any earlier password are revoked on every seed run.
  const revoked = await db.session.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date() } });
  console.log('[seed] revoked sessions: ' + revoked.count);

  await db.systemSetting.upsert({
    where: { key: 'dev.synthetic_notice' },
    update: { valueJson: { notice: SYNTHETIC_NOTICE } },
    create: { key: 'dev.synthetic_notice', valueJson: { notice: SYNTHETIC_NOTICE } },
  });

  console.log(`[seed] done: ${seedSkus.length} synthetic SKUs, ${STAFF.length} staff, ${CUSTOMERS.length} customers`);
  // Local-only credential sheet (gitignored). The password is never written to tracked files.
  const sheet = [
    '# Local development accounts (SYNTHETIC, development database only)',
    '',
    'Generated by prisma/seed/index.ts. Do not share, do not commit, do not use in production.',
    '',
    'Password: stored in ' + DEV_SECRET_FILE + ' (gitignored). Not written here.',
    '',
    '| Role | Phone |',
    '|---|---|',
    ...[...STAFF, ...CUSTOMERS].map((a) => '| ' + a.name + ' | ' + a.phone + ' |'),
    '',
  ].join('\n');
  require('node:fs').writeFileSync('DEV-CREDENTIALS.local.md', sheet, { encoding: 'utf8' });
  console.log('[seed] wrote DEV-CREDENTIALS.local.md (gitignored)');
  void PERMISSIONS;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
