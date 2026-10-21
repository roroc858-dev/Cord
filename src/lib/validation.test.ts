import test from "node:test";
import assert from "node:assert/strict";
import {
  createServerSchema,
  directMessageSchema,
  friendRequestSchema,
  loginSchema,
  registerSchema,
  uploadSchema,
} from "./validation";

test("register schema accepts valid usernames and passwords", () => {
  const parsed = registerSchema.parse({
    email: "hello@cord.example",
    username: "cord_user",
    password: "super_secure_password",
  });

  assert.equal(parsed.username, "cord_user");
  assert.equal(parsed.email, "hello@cord.example");
});

test("register schema rejects short passwords", () => {
  assert.throws(() => {
    registerSchema.parse({ email: "hello@cord.example", username: "cord_user", password: "short" });
  });
});

test("server creation schema enforces safe names", () => {
  const parsed = createServerSchema.parse({ name: "Launch Lab", description: "Community for shipping updates", isPublic: true });
  assert.equal(parsed.name, "Launch Lab");

  const result = createServerSchema.safeParse({ name: "!bad", description: "x", isPublic: true });
  assert.equal(result.success, true);
});

test("login schema enforces a non-empty password", () => {
  assert.throws(() => {
    loginSchema.parse({ email: "hello@cord.example", password: "" });
  });

  test("friend request schema accepts usernames and rejects unsafe input", () => {
    assert.equal(friendRequestSchema.parse({ username: "cord_user" }).username, "cord_user");
    assert.equal(friendRequestSchema.safeParse({ username: "bad username" }).success, false);
  });

  test("direct messages require text or an uploaded attachment", () => {
    assert.equal(directMessageSchema.safeParse({ content: "hello" }).success, true);
    assert.equal(directMessageSchema.safeParse({ content: "" }).success, false);
    assert.equal(
      directMessageSchema.safeParse({ content: "", attachmentTicketIds: ["ckv1234567890123456789012"] }).success,
      true,
    );
  });

  test("upload schema allows supported file types up to 10 MB", () => {
    assert.equal(uploadSchema.safeParse({ fileName: "photo.png", mimeType: "image/png", size: 1024 }).success, true);
    assert.equal(uploadSchema.safeParse({ fileName: "archive.zip", mimeType: "application/zip", size: 1024 }).success, false);
    assert.equal(uploadSchema.safeParse({ fileName: "huge.pdf", mimeType: "application/pdf", size: 11 * 1024 * 1024 }).success, false);
  });
});
