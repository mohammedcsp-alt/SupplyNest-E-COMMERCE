import { z } from 'zod';

export const phoneSchema = z.string().trim().min(7).max(20);
export const codeSchema = z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits');
export const passwordSchema = z.string().min(10).max(128);
export const reasonSchema = z.string().trim().min(3, 'Reason is required').max(500);

export const registerSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().max(200).optional(),
});

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['REGISTRATION', 'ACCESS_RECOVERY']),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: codeSchema,
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
});

export const recoveryRequestSchema = z.object({ phone: phoneSchema });

export const recoveryConfirmSchema = z.object({
  phone: phoneSchema,
  code: codeSchema,
  newPassword: passwordSchema,
});

export const approveSchema = z.object({
  priceLevelId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const reasonOnlySchema = z.object({ reason: reasonSchema });

export const priceLevelChangeSchema = z.object({
  priceLevelId: z.string().uuid(),
  reason: reasonSchema,
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120).optional(),
    legalName: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

export const priceLevelCreateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use UPPER_SNAKE_CASE codes'),
  name: z.string().trim().min(2).max(120),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
