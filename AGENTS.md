# Coding Guidelines

- Add simple JSDoc to all exported and non-trivial functions and vairables. Trivial callbacks do not require JSDoc.
- Prioritize readability and developer experience over reducing line count or writing overly compact code.
- Prefer descriptive names and straightforward control flow over clever abstractions.
- Add enough logs to make application behavior and failures easy to understand.
- Use the appropriate Pino log level: `debug`, `info`, `warn`, or `error`.
- Begin every log message with the function name, using the format `functionName: log message`.
- Keep log messages stable so they remain easy to search and aggregate.
- Pass errors in the Pino log object under the `err` key, for example: `logger.error({ err }, "functionName: operation failed")`.
- Put important or structured data in the Pino log object, not inside the message string, for example: `logger.info({ userId }, "functionName: user loaded")`.
- Never log secrets, credentials, tokens, passwords, or unnecessary personal data.
- Avoid duplicate error logs. Log an error where it is handled or where useful context is added.