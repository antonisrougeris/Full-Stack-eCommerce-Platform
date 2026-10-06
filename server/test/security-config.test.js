import test from "node:test";
import assert from "node:assert/strict";
import { corsOptions, getAllowedOrigins } from "../src/config/security.js";

test("normalizes configured CORS origins", () => {
  const previous = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = "https://shop.example.com/, https://www.shop.example.com/path";

  try {
    assert.deepEqual(getAllowedOrigins(), [
      "https://shop.example.com",
      "https://www.shop.example.com",
    ]);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  }
});

test("rejects malformed configured CORS origin", () => {
  const previous = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = "not-a-url";

  try {
    assert.throws(() => getAllowedOrigins(), /Invalid CORS_ORIGIN/);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  }
});

test("requires CORS_ORIGIN in production", () => {
  const previousOrigin = process.env.CORS_ORIGIN;
  const previousEnv = process.env.NODE_ENV;
  process.env.CORS_ORIGIN = "";
  process.env.NODE_ENV = "production";

  try {
    assert.throws(() => corsOptions(), /CORS_ORIGIN is required in production/);
  } finally {
    if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousOrigin;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});

test("allows only configured browser origins and server-to-server requests", async () => {
  const previousOrigin = process.env.CORS_ORIGIN;
  const previousEnv = process.env.NODE_ENV;
  process.env.CORS_ORIGIN = "https://shop.example.com";
  process.env.NODE_ENV = "production";

  try {
    const options = corsOptions();

    const decide = (origin) =>
      new Promise((resolve, reject) => {
        options.origin(origin, (error, allowed) => {
          if (error) reject(error);
          else resolve(allowed);
        });
      });

    assert.equal(await decide("https://shop.example.com"), true);
    assert.equal(await decide("https://evil.example"), false);
    assert.equal(await decide(undefined), true);
  } finally {
    if (previousOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousOrigin;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
});
