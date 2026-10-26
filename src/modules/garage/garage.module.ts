import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppearanceController } from './presentation/appearance.controller';
@Module({ imports: [AuthModule], controllers: [AppearanceController] })
export class GarageModule {}
