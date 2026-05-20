import Fastify from "fastify";
import type { Activity, Family, FamilyMember, Reminder } from "@family-housekeeper/shared";

const server = Fastify({ logger: true });

const families: Family[] = [];
const members: FamilyMember[] = [];
const reminders: Reminder[] = [];
const activities: Activity[] = [];

server.get("/health", async () => ({
  ok: true,
  service: "family-housekeeper-api",
}));

server.get("/v1/families", async () => ({
  data: families,
}));

server.get("/v1/families/:familyId/members", async (request) => {
  const { familyId } = request.params as { familyId: string };

  return {
    data: members.filter((member) => member.familyId === familyId),
  };
});

server.get("/v1/families/:familyId/reminders", async (request) => {
  const { familyId } = request.params as { familyId: string };

  return {
    data: reminders.filter((reminder) => reminder.familyId === familyId),
  };
});

server.get("/v1/families/:familyId/activities", async (request) => {
  const { familyId } = request.params as { familyId: string };

  return {
    data: activities.filter((activity) => activity.familyId === familyId),
  };
});

const port = Number(process.env.API_PORT ?? 3100);

server.listen({ port, host: "0.0.0.0" }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
