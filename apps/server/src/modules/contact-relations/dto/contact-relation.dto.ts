import { CONTACT_RELATION_TYPES, type ContactRelationType } from '@estate-erp/shared';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ContactRelationQueryDto {
  @IsUUID()
  contactId!: string;
}

export class CreateContactRelationDto {
  @IsUUID()
  contactId!: string;

  @IsUUID()
  relatedContactId!: string;

  @IsIn(CONTACT_RELATION_TYPES)
  relationType!: ContactRelationType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inverseLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string;
}

export class CreateContactRelationWithNewContactDto {
  @IsUUID()
  contactId!: string;

  @IsIn(CONTACT_RELATION_TYPES)
  relationType!: ContactRelationType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inverseLabel?: string;

  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string;
}

export class UpdateContactRelationDto {
  @IsOptional()
  @IsIn(CONTACT_RELATION_TYPES)
  relationType?: ContactRelationType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  inverseLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string | null;
}
