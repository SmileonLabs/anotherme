import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "authorization",
    "cookie",
    "token",
    "secret",
    "password",
    "body",
    "content",
    "*.authorization",
    "*.cookie",
    "*.token",
    "*.secret",
    "*.password",
    "*.body",
    "*.content",
    "*.headers.authorization",
    "*.headers.cookie",
    "*.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
