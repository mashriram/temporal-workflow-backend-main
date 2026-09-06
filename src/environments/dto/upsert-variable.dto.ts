import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  ValidateIf,
} from 'class-validator';
import type { AutoRefreshTokenConfig } from '../entities/environment-variable.entity';

export class UpsertVariableDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsIn(['static', 'secret', 'auto_refresh_token'])
  kind: 'static' | 'secret' | 'auto_refresh_token';

  // Required for 'static'/'secret', absent for 'auto_refresh_token'.
  @ValidateIf((o) => o.kind !== 'auto_refresh_token')
  @IsString()
  @IsNotEmpty()
  value?: string;

  // Required for 'auto_refresh_token', absent otherwise.
  @ValidateIf((o) => o.kind === 'auto_refresh_token')
  @IsObject()
  refreshConfig?: AutoRefreshTokenConfig;

  @IsOptional()
  @IsString()
  id?: string; // present on update, absent on create
}
