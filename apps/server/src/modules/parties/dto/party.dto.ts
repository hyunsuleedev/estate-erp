import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PartyKind, PartyMemberStatus } from '@estate-erp/shared';

const PARTY_KINDS = Object.values(PartyKind);
const PARTY_MEMBER_STATUSES = Object.values(PartyMemberStatus);

export class CreatePartyInitialMemberDto {
  @IsOptional()
  @IsUUID()
  memberContactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleLabel?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class CreatePartyDto {
  @IsIn(PARTY_KINDS)
  kind!: PartyKind;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  businessRegNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  homePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  selfRoleLabel?: string;

  @IsOptional()
  @IsBoolean()
  selfIsPrimary?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePartyInitialMemberDto)
  initialMembers?: CreatePartyInitialMemberDto[];
}

export class AddPartyMemberDto {
  @IsOptional()
  @IsUUID()
  memberContactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleLabel?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class AddHouseholdMemberDto {
  @IsUUID()
  contactId!: string;

  @IsOptional()
  @IsUUID()
  memberContactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  selfRoleLabel?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class AddOrganizationMemberDto {
  @IsUUID()
  organizationContactId!: string;

  @IsOptional()
  @IsUUID()
  memberContactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleLabel?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class UpdatePartyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  homePhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string | null;
}

export class UpdatePartyMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  roleLabel?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(PARTY_MEMBER_STATUSES)
  status?: PartyMemberStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string | null;
}
