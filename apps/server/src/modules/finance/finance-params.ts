import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

/**
 * 주소의 id 형식이 틀리면 DB까지 가지 않고 한국어 400으로 돌려준다 (그대로 두면 500이 난다).
 * 예) @Param('id', uuidParam('청구')) → "잘못된 청구 주소입니다."
 */
export const uuidParam = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => new BadRequestException(`잘못된 ${what} 주소입니다.`) });
