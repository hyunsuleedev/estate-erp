import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ListingAdvertisementChannel } from "@estate-erp/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type Db = Prisma.TransactionClient | PrismaService;

const KNOWN_CHANNELS: ReadonlySet<string> = new Set(
  Object.values(ListingAdvertisementChannel),
);

@Injectable()
export class OfficeCpAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    officeId: string,
    query: { channel?: string; includeInactive?: boolean } = {},
  ) {
    const channel = query.channel?.trim().toLowerCase();
    return this.prisma.officeCpAccount.findMany({
      where: {
        officeId,
        ...(channel ? { channel } : {}),
        ...(!query.includeInactive ? { isActive: true } : {}),
      },
      include: {
        _count: {
          select: {
            advertisements: { where: { status: "active" } },
          },
        },
      },
      orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
    });
  }

  async upsertAccount(
    officeId: string,
    dto: {
      channel: string;
      accountKey: string;
      accountName?: string | null;
    },
  ) {
    return this.ensureAccount(
      this.prisma,
      officeId,
      dto.channel,
      dto.accountKey,
      dto.accountName,
    );
  }

  async update(
    officeId: string,
    id: string,
    dto: { accountName?: string | null; isActive?: boolean },
  ) {
    const existing = await this.prisma.officeCpAccount.findFirst({
      where: { id, officeId },
    });
    if (!existing) {
      throw new NotFoundException("CP 계정을 찾을 수 없습니다.");
    }
    const accountName =
      dto.accountName === undefined
        ? undefined
        : dto.accountName?.trim() || null;
    return this.prisma.officeCpAccount.update({
      where: { id },
      data: {
        ...(accountName !== undefined && { accountName }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        _count: {
          select: {
            advertisements: { where: { status: "active" } },
          },
        },
      },
    });
  }

  async ensureAccount(
    db: Db,
    officeId: string,
    rawChannel: string,
    rawAccountKey: string | null | undefined,
    rawAccountName?: string | null,
  ) {
    const channel = rawChannel?.trim().toLowerCase();
    if (!channel || (!KNOWN_CHANNELS.has(channel) && !/^[a-z][a-z0-9_-]{1,30}$/.test(channel))) {
      throw new BadRequestException("광고 채널을 선택해 주세요.");
    }
    const accountKey = rawAccountKey?.trim();
    if (!accountKey) {
      throw new BadRequestException("CP 로그인 아이디(accountKey)를 입력해 주세요.");
    }
    if (accountKey.length > 100) {
      throw new BadRequestException("CP 로그인 아이디는 100자 이내여야 합니다.");
    }
    const accountName = rawAccountName?.trim() || undefined;
    return db.officeCpAccount.upsert({
      where: {
        officeId_channel_accountKey: {
          officeId,
          channel,
          accountKey,
        },
      },
      create: {
        officeId,
        channel,
        accountKey,
        ...(accountName !== undefined && { accountName }),
        isActive: true,
      },
      update: {
        isActive: true,
        ...(accountName !== undefined && { accountName }),
      },
    });
  }

  async resolveAccountForChannel(
    db: Db,
    officeId: string,
    channel: string,
    input: { cpAccountId?: string | null; accountKey?: string | null },
  ): Promise<string | null> {
    const cpAccountId = input.cpAccountId?.trim() || null;
    if (cpAccountId) {
      const account = await db.officeCpAccount.findFirst({
        where: { id: cpAccountId, officeId },
        select: { id: true, channel: true },
      });
      if (!account) {
        throw new NotFoundException("선택한 CP 계정을 찾을 수 없습니다.");
      }
      if (account.channel !== channel) {
        throw new BadRequestException("선택한 CP 계정의 채널이 광고 채널과 다릅니다.");
      }
      return account.id;
    }
    const accountKey = input.accountKey?.trim() || null;
    if (accountKey) {
      const ensured = await this.ensureAccount(db, officeId, channel, accountKey);
      return ensured.id;
    }
    return null;
  }

  async countActiveByChannel(
    db: Db,
    officeId: string,
    channel: string,
  ): Promise<number> {
    return db.officeCpAccount.count({
      where: { officeId, channel, isActive: true },
    });
  }
}
