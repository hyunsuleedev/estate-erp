import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { CreateConsumerRequestDto } from "./consumer-requests.dto";
const trades: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
const types: Record<string, string> = {
  apartment: "아파트",
  officetel: "오피스텔",
  villa: "빌라",
  house: "단독·다가구",
  commercial: "상가",
};
@Injectable()
export class ConsumerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}
  async regions(query: string) {
    const q = query?.trim();
    if (!q || q.length < 2 || q.length > 60) return [];
    const rows = await this.prisma.ward.findMany({
      where: { name: { contains: q } },
      include: { district: { include: { province: true } } },
      take: 30,
      orderBy: { code: "asc" },
    });
    return rows.map((w) => ({
      code: w.code,
      label: `${w.district.province.name} ${w.district.name} ${w.name}`,
    }));
  }
  history(consumerId: string) {
    return this.prisma.consumerRequest.findMany({
      where: { consumerId },
      select: {
        id: true,
        regionLabel: true,
        recipientCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async create(consumerId: string, dto: CreateConsumerRequestDto) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Serialize per consumer, making retries and daily limits safe across instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${consumerId})::bigint)`;
        const existing = await tx.consumerRequest.findUnique({
          where: { id: dto.requestId },
        });
        if (existing) {
          if (existing.consumerId !== consumerId)
            throw new ConflictException("요청 식별자를 다시 생성해 주세요.");
          return { receipt: existing, notifications: [] };
        }
        const count = await tx.consumerRequest.count({
          where: {
            consumerId,
            createdAt: { gte: new Date(Date.now() - 86400000) },
          },
        });
        if (count >= 5)
          throw new BadRequestException(
            "하루에 최대 5건까지 요청할 수 있습니다.",
          );
        const ward = await tx.ward.findUnique({
          where: { code: dto.wardCode },
          include: { district: { include: { province: true } } },
        });
        if (!ward)
          throw new BadRequestException("유효한 지역을 선택해 주세요.");
        const offices = await tx.office.findMany({
          where: {
            isActive: true,
            officeSites: { some: { site: { wardCode: dto.wardCode } } },
            users: {
              some: { isActive: true, role: { in: ["owner", "manager"] } },
            },
          },
          select: {
            id: true,
            users: {
              where: { isActive: true, role: { in: ["owner", "manager"] } },
              select: { id: true },
            },
          },
        });
        if (!offices.length)
          throw new BadRequestException(
            "이 지역은 아직 요청을 받을 중개사가 없습니다. 다른 지역을 선택해 주세요.",
          );
        const regionLabel = `${ward.district.province.name} ${ward.district.name} ${ward.name}`;
        const title = `[매물 찾기 요청] ${ward.name} ${types[dto.propertyType]} ${trades[dto.transactionType]}`;
        const content = [
          `희망 지역: ${regionLabel}`,
          `최대 예산/보증금: ${dto.budgetMax.toLocaleString("ko-KR")}만원`,
          `요구사항: ${dto.requirements.trim()}`,
          `요청자: ${dto.contactName.trim()}`,
          `연락처: ${dto.phone}`,
          `연락처 제공 및 상담 연락 동의: ${new Date().toISOString()}`,
        ].join("\n");
        const notifications = [];
        for (const office of offices) {
          const task = await tx.task.create({
            data: {
              officeId: office.id,
              title,
              content,
              source: "system",
              category: "buyer",
              status: "pending",
            },
          });
          for (const user of office.users) {
            notifications.push(
              await tx.notification.create({
                data: {
                  officeId: office.id,
                  userId: user.id,
                  type: "task_assigned",
                  title,
                  content:
                    "새로운 고객의 매물 찾기 요청이 도착했습니다. 업무에서 조건을 확인해 주세요.",
                  linkType: "task",
                  linkId: task.id,
                },
              }),
            );
          }
        }
        const receipt = await tx.consumerRequest.create({
          data: {
            id: dto.requestId,
            consumerId,
            wardCode: dto.wardCode,
            regionLabel,
            recipientCount: offices.length,
          },
        });
        return { receipt, notifications };
      },
      { timeout: 30000 },
    );
    for (const n of result.notifications) {
      this.realtime.emitNotificationCreated({
        officeId: n.officeId,
        userId: n.userId,
        notification: {
          id: n.id,
          type: n.type,
          title: n.title,
          content: n.content,
          linkType: n.linkType,
          linkId: n.linkId,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
        },
      });
    }
    const { id, regionLabel, recipientCount, createdAt } = result.receipt;
    return { id, regionLabel, recipientCount, createdAt };
  }
}
