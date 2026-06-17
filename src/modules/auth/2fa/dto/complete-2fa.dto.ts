import { IsString, IsNotEmpty } from 'class-validator';

export class Verify2FaDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
