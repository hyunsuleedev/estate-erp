import { CONTACT_GROUP_MEMBERS_MAX } from '@estate-erp/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateContactGroupDto {
  @IsString()
  name!: string;

  /** 주면 그룹을 만들면서 함께 넣는다. 둘 중 하나만 성공하는 일이 없도록 한 번에 처리한다. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTACT_GROUP_MEMBERS_MAX)
  @IsUUID(undefined, { each: true })
  contactIds?: string[];
}

export class RenameContactGroupDto {
  @IsString()
  name!: string;

  @IsString()
  newName!: string;
}

export class ContactGroupMembersDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_GROUP_MEMBERS_MAX)
  @IsUUID(undefined, { each: true })
  contactIds!: string[];
}
