import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PublicUser } from '../../users/users.service';
import { AuthenticatedRequest } from './authenticated-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
