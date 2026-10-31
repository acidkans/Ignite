const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.count();
  const nodes = await prisma.processNode.count();
  const userTasks = await prisma.userTask.count();
  const schematics = await prisma.schematicDocument.count();
  console.log({ users, nodes, userTasks, schematics });
}
main().catch(console.error).finally(() => prisma.$disconnect());
