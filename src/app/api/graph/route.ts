import { mutate } from "@/lib/store";
import type { ExecGraph } from "@/lib/types";

export async function PUT(req: Request) {
  const b = (await req.json()) as Pick<ExecGraph, "nodes" | "edges" | "groups">;
  const g = mutate((d) => {
    d.graph.nodes = b.nodes;
    d.graph.edges = b.edges;
    d.graph.groups = b.groups ?? d.graph.groups;
    d.graph.version++;
    d.graph.updatedAt = Date.now();
    return d.graph;
  });
  return Response.json({ version: g.version });
}
