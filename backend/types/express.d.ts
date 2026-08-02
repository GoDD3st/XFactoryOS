import { UserRole } from '@/frontend/src/types';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        full_name: string;
        department?: string;
      };
    }
  }
}

export {};
