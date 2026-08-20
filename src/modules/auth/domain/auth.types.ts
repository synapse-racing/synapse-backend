import { PublicUser } from '../../users/users.service';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export interface SessionResult extends AuthResponse {
  refreshToken: string;
}
