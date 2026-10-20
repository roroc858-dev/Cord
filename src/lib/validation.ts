import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only."),
  password: z.string().min(10).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  isPublic: z.boolean().default(true),
});

export const createChannelSchema = z.object({
  name: z.string().trim().min(2).max(50).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers, and hyphens."),
  type: z.enum(["TEXT", "VOICE"]).default("TEXT"),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  replyToId: z.string().optional(),
});
