import {
  Equals,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
export class CreateConsumerRequestDto {
  @IsUUID() requestId!: string;
  @Matches(/^\d{10}$/) wardCode!: string;
  @IsIn(["sale", "jeonse", "monthly"]) transactionType!: string;
  @IsIn(["apartment", "officetel", "villa", "house", "commercial"])
  propertyType!: string;
  @IsInt() @Min(1) @Max(1000000000) budgetMax!: number;
  @IsString() @Length(10, 2000) requirements!: string;
  @IsString() @Length(1, 50) contactName!: string;
  @Matches(/^[0-9+() -]{8,25}$/) phone!: string;
  @Equals(true) consent!: boolean;
}
