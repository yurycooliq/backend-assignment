import { Injectable } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { PrismaService } from "../prisma.service";

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: { brandId: string; email: string; passwordHash: string },
    client: PrismaClientLike = this.prisma,
  ): Promise<User> {
    return client.user.create({
      data: input,
    });
  }

  findByEmail(
    brandId: string,
    email: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<User | null> {
    return client.user.findUnique({
      where: {
        brandId_email: {
          brandId,
          email,
        },
      },
    });
  }

  findById(
    brandId: string,
    id: string,
    client: PrismaClientLike = this.prisma,
  ): Promise<User | null> {
    return client.user.findFirst({
      where: {
        brandId,
        id,
      },
    });
  }
}
