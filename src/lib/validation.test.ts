import test from "node:test";
import assert from "node:assert/strict";
import { registerSchema, loginSchema, createServerSchema } from "./validation";

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
});
