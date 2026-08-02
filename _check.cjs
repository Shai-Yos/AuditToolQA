const { PrismaClient } = require('./generated/prisma');
const p = new PrismaClient();
p.auditAssignee.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, auditName: true, userName: true, role: true, userId: true, createdAt: true }
}).then(r => {
  console.log(JSON.stringify(r, null, 2));
  return p.$disconnect();
}).catch(e => {
  console.error(e);
  return p.$disconnect();
});
