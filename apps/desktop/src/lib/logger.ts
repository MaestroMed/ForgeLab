// Dev-gated logger. In production builds (Vite sets import.meta.env.PROD),
// log/info/debug become no-ops. warn/error always fire — they represent state
// users may need to report.
//
// Use this instead of console.* for anything that isn't an error.

const isDev = typeof import.meta !== 'undefined' && !import.meta.env?.PROD;

export const logger = {
  debug: isDev ? console.debug.bind(console) : () => {},
  log: isDev ? console.log.bind(console) : () => {},
  info: isDev ? console.info.bind(console) : () => {},
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
