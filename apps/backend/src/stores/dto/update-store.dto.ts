import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Field yang boleh diubah pada toko.
 *
 * Sengaja tidak ada `status`, `createdById`, atau `id`: pemilik toko tidak
 * menuliskan kolom tersebut. Status toko diubah oleh admin platform, bukan
 * oleh pemilik - jadi pemilik tidak bisa mencabut dirinya sendiri atau
 * mengubah status untuk melewati `@StoreAccess('OWNER')`.
 */
export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  city?: string;
}