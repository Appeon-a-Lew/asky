import { db } from "@/lib/store";
import { withWorkspace } from "@/lib/workspace";

async function handleGET() {
  const d = db();
  return Response.json({ pages: d.pages, graph: d.graph, docs: d.docs, people: d.people, lessons: d.lessons, tools: d.tools, settings: d.settings, costCenters: d.costCenters });
}

export const GET = withWorkspace(handleGET);
