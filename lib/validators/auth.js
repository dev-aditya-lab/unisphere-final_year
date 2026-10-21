import { z } from "zod";
import { RESERVED_USERNAMES, USERNAME_REGEX } from "@/lib/constants";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your email address")
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, "3–30 characters: letters, numbers, hyphen or underscore")
  .refine((v) => !/[_-]{2}/.test(v), "Avoid consecutive hyphens or underscores")
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is reserved");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(80, "Name is too long");

export const registerSchema = z.object({
  fullName: fullNameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  // Three separate statements, none pre-ticked, none implying another. The Terms are a contract; the privacy
  // choice is consent to process the account information; the adult declaration is UniSphere's age policy.
  acceptTerms: z.literal(true, { error: "You must accept the Terms and Community Guidelines to create an account" }),
  acceptPrivacy: z.literal(true, { error: "To create an account, you must agree to UniSphere using your account information to run it" }),
  confirmAdult: z.literal(true, { error: "UniSphere is for people aged 18 and over" }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
  next: z.string().max(512).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords do not match",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords do not match",
  })
  .refine((v) => v.password !== v.currentPassword, {
    path: ["password"],
    error: "Choose a password different from the current one",
  });
