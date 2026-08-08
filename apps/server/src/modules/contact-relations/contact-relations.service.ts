import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CONTACT_RELATION_TYPE_LABELS } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  contactPhonesIncludeOrdered,
  normalizePhone,
  withPrimaryPhone,
} from '../contacts/contact-phone.utils';
import { withContactRelationPerspective } from './contact-relation.presenter';
import {
  CreateContactRelationDto,
  CreateContactRelationWithNewContactDto,
  UpdateContactRelationDto,
} from './dto/contact-relation.dto';

@Injectable()
export class ContactRelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByContact(officeId: string, contactId: string) {
    const [contact, asMain, asRelated] = await Promise.all([
      this.prisma.contact.findFirst({
        where: { id: contactId, officeId },
        select: { id: true },
      }),
      this.prisma.contactRelation.findMany({
        where: { officeId, contactId },
        include: {
          relatedContact: {
            include: { phones: contactPhonesIncludeOrdered },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contactRelation.findMany({
        where: { officeId, relatedContactId: contactId },
        include: {
          contact: { include: { phones: contactPhonesIncludeOrdered } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!contact) throw new NotFoundException('연락처를 찾을 수 없습니다.');

    const relations = asMain.map((relation) =>
      withContactRelationPerspective(
        {
          ...relation,
          relatedContact: withPrimaryPhone(relation.relatedContact),
        },
        false,
      ),
    );
    const relatedBy = asRelated.map((relation) =>
      withContactRelationPerspective(
        {
          ...relation,
          contact: withPrimaryPhone(relation.contact),
        },
        true,
      ),
    );

    return {
      // 기존 소비자를 위한 방향별 배열을 유지하면서, 새 화면은 items 하나만
      // 순회해도 현재 연락처 관점의 관계를 얻을 수 있다.
      relations,
      relatedBy,
      items: [...relations, ...relatedBy].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      ),
    };
  }

  async create(officeId: string, dto: CreateContactRelationDto) {
    this.assertNotSelfRelation(dto.contactId, dto.relatedContactId);

    const contacts = await this.prisma.contact.findMany({
      where: {
        officeId,
        id: { in: [dto.contactId, dto.relatedContactId] },
      },
      select: { id: true },
    });
    if (contacts.length !== 2) {
      throw new NotFoundException(
        '같은 사무소에 속한 두 연락처를 모두 찾을 수 없습니다.',
      );
    }

    await this.assertPairAvailable(
      officeId,
      dto.contactId,
      dto.relatedContactId,
    );

    try {
      const relation = await this.prisma.contactRelation.create({
        data: {
          officeId,
          contactId: dto.contactId,
          relatedContactId: dto.relatedContactId,
          relationType: dto.relationType,
          label: this.trimNullable(dto.label),
          inverseLabel: this.trimNullable(dto.inverseLabel),
          memo: this.trimNullable(dto.memo),
        },
        include: {
          relatedContact: {
            include: { phones: contactPhonesIncludeOrdered },
          },
        },
      });

      return withContactRelationPerspective(
        {
          ...relation,
          relatedContact: withPrimaryPhone(relation.relatedContact),
        },
        false,
      );
    } catch (error) {
      this.rethrowRelationWriteError(error);
    }
  }

  async createWithNewContact(
    officeId: string,
    dto: CreateContactRelationWithNewContactDto,
  ) {
    const canonicalPhone = normalizePhone(dto.phone);
    if (canonicalPhone.length < 7) {
      throw new BadRequestException('전화번호를 정확히 입력해 주세요.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const sourceContact = await tx.contact.findFirst({
          where: { id: dto.contactId, officeId },
          select: { id: true },
        });
        if (!sourceContact) {
          throw new NotFoundException('기준 연락처를 찾을 수 없습니다.');
        }

        // 같은 사무소의 전화번호가 있으면 새 사람을 만들지 않고 재사용한다.
        let relatedContact = await tx.contact.findFirst({
          where: {
            officeId,
            phones: { some: { phone: canonicalPhone } },
          },
        });

        if (relatedContact?.id === dto.contactId) {
          throw new BadRequestException(
            '기준 연락처와 같은 전화번호로 관계를 만들 수 없습니다.',
          );
        }

        if (!relatedContact) {
          const autoName =
            dto.name?.trim() ||
            dto.label?.trim() ||
            CONTACT_RELATION_TYPE_LABELS[dto.relationType] ||
            '관련인';

          relatedContact = await tx.contact.create({
            data: {
              officeId,
              name: autoName,
              phones: {
                create: [
                  {
                    phone: canonicalPhone,
                    label: 'mobile',
                    isPrimary: true,
                    office: { connect: { id: officeId } },
                  },
                ],
              },
            },
          });
        }

        await this.assertPairAvailableWithTransaction(
          tx,
          officeId,
          dto.contactId,
          relatedContact.id,
        );

        const relation = await tx.contactRelation.create({
          data: {
            officeId,
            contactId: dto.contactId,
            relatedContactId: relatedContact.id,
            relationType: dto.relationType,
            label: this.trimNullable(dto.label),
            inverseLabel: this.trimNullable(dto.inverseLabel),
            memo: this.trimNullable(dto.memo),
          },
          include: {
            relatedContact: {
              include: { phones: contactPhonesIncludeOrdered },
            },
          },
        });

        return withContactRelationPerspective(
          {
            ...relation,
            relatedContact: withPrimaryPhone(relation.relatedContact),
          },
          false,
        );
      });
    } catch (error) {
      this.rethrowRelationWriteError(error);
    }
  }

  async update(
    id: string,
    officeId: string,
    dto: UpdateContactRelationDto,
  ) {
    const relation = await this.prisma.contactRelation.findFirst({
      where: { id, officeId },
      include: {
        relatedContact: {
          include: { phones: contactPhonesIncludeOrdered },
        },
      },
    });
    if (!relation) {
      throw new NotFoundException('연락처 관계를 찾을 수 없습니다.');
    }

    const data: Prisma.ContactRelationUpdateInput = {
      ...(dto.relationType !== undefined && {
        relationType: dto.relationType,
      }),
      ...(dto.label !== undefined && {
        label: this.trimNullable(dto.label),
      }),
      ...(dto.inverseLabel !== undefined && {
        inverseLabel: this.trimNullable(dto.inverseLabel),
      }),
      ...(dto.memo !== undefined && {
        memo: this.trimNullable(dto.memo),
      }),
    };

    if (Object.keys(data).length === 0) {
      return withContactRelationPerspective(
        {
          ...relation,
          relatedContact: withPrimaryPhone(relation.relatedContact),
        },
        false,
      );
    }

    const updated = await this.prisma.contactRelation.update({
      where: { id },
      data,
      include: {
        relatedContact: {
          include: { phones: contactPhonesIncludeOrdered },
        },
      },
    });

    return withContactRelationPerspective(
      {
        ...updated,
        relatedContact: withPrimaryPhone(updated.relatedContact),
      },
      false,
    );
  }

  async remove(id: string, officeId: string) {
    const relation = await this.prisma.contactRelation.findFirst({
      where: { id, officeId },
    });
    if (!relation) {
      throw new NotFoundException('연락처 관계를 찾을 수 없습니다.');
    }
    return this.prisma.contactRelation.delete({ where: { id } });
  }

  private assertNotSelfRelation(contactId: string, relatedContactId: string) {
    if (contactId === relatedContactId) {
      throw new BadRequestException('같은 연락처를 자기 자신과 연결할 수 없습니다.');
    }
  }

  private async assertPairAvailable(
    officeId: string,
    contactId: string,
    relatedContactId: string,
  ) {
    const duplicate = await this.prisma.contactRelation.findFirst({
      where: this.pairWhere(officeId, contactId, relatedContactId),
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('두 연락처는 이미 관계로 연결되어 있습니다.');
    }
  }

  private async assertPairAvailableWithTransaction(
    tx: Prisma.TransactionClient,
    officeId: string,
    contactId: string,
    relatedContactId: string,
  ) {
    const duplicate = await tx.contactRelation.findFirst({
      where: this.pairWhere(officeId, contactId, relatedContactId),
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('두 연락처는 이미 관계로 연결되어 있습니다.');
    }
  }

  private pairWhere(
    officeId: string,
    contactId: string,
    relatedContactId: string,
  ): Prisma.ContactRelationWhereInput {
    return {
      officeId,
      OR: [
        { contactId, relatedContactId },
        { contactId: relatedContactId, relatedContactId: contactId },
      ],
    };
  }

  private trimNullable(value: string | null | undefined) {
    if (value === undefined) return undefined;
    return value?.trim() || null;
  }

  private rethrowRelationWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('두 연락처는 이미 관계로 연결되어 있습니다.');
    }
    throw error;
  }
}
