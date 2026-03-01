/**
 * User Domain Model
 */

export type UserRole = 'user' | 'company' | 'administrator';
export type UserType = 'individual' | 'attorney' | 'company_admin';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified?: boolean;
  lastLogin?: string;
  createdAt?: string;
  role: UserRole;
  userType?: UserType;
}

export interface UserProfile extends User {
  // Extended user profile fields
  phone?: string;
  company?: string;
}
