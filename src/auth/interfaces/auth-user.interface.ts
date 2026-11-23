export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rawToken?: string;
  jti?: string;
}
