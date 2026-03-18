import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/agents/$slug")({
  component: AgentSlugLayout,
});

function AgentSlugLayout() {
  return <Outlet />;
}
