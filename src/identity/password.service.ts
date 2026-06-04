import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

@Injectable()
export class PasswordService {
  private readonly rounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
