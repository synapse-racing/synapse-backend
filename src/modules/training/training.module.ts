import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TrainingService } from './application/training.service';
import { TrainingController } from './presentation/training.controller';

@Module({
  imports: [AuthModule],
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
