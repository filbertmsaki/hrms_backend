import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { ImageProcessingService } from './image-processing.service';

@Module({
  providers: [FilesService, ImageProcessingService],
  exports: [FilesService, ImageProcessingService],
})
export class FilesModule {}
