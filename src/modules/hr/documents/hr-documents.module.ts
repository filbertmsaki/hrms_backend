import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { Document } from './entities/document.entity';
import { HrDocumentsService } from './hr-documents.service';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), FilesModule],
  providers: [HrDocumentsService],
  exports: [HrDocumentsService, TypeOrmModule],
})
export class HrDocumentsModule {}
