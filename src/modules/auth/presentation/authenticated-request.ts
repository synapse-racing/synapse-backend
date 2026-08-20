import { Request } from 'express';
import { PublicUser } from '../../users/users.service';

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}
