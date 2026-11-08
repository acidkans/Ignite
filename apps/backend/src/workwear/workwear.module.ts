import { Module } from '@nestjs/common';
import { WorkwearController } from './workwear.controller';
import { WorkwearService } from './workwear.service';

// @anchor workwear-module — rozmiary ubrań roboczych pracowników.
@Module({
    controllers: [WorkwearController],
    providers: [WorkwearService],
})
export class WorkwearModule {}
