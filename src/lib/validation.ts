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
  content: z.string().trim().max(4000).default(""),
  replyToId: z.string().optional(),
  attachmentTicketIds: z.array(z.string().cuid()).max(5).default([]),
}).refine((message) => message.content.length > 0 || message.attachmentTicketIds.length > 0, {
  message: "Add a message or attach a file.",
});

export const friendRequestSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
});

export const friendActionSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

export const directMessageSchema = z.object({
  content: z.string().trim().max(4000).default(""),
  attachmentTicketIds: z.array(z.string().cuid()).max(5).default([]),
}).refine((message) => message.content.length > 0 || message.attachmentTicketIds.length > 0, {
  message: "Add a message or attach a file.",
});

export const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf", "text/plain"]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
});
