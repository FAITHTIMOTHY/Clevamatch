import type { UserContext } from "../auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
    }
  }
}

export {};
