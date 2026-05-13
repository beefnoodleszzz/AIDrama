import { PrismaClient } from '@prisma/client'
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  
  const prisma = new PrismaClient({ adapter })
  
  try {
    await prisma.$connect()
    console.log('✅ Database connection successful')
    const userCount = await prisma.user.count()
    console.log(`Current user count: ${userCount}`)
  } catch (e) {
    console.error('❌ Database connection failed')
    console.error(e)
  } finally {
    await prisma.$disconnect()
  }
}

main()